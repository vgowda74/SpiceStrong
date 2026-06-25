/**
 * recipeService.ts — SpiceStrong
 * Central service for fetching recipes from Supabase with AsyncStorage caching.
 * Implements stale-while-revalidate: shows cached data instantly, refreshes in background.
 * Falls back to built-in recipes + local AsyncStorage when Supabase is unavailable.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import {
  type SavedRecipe,
  type CookingStep,
  type IngredientsByTier,
  type MealType,
  type QuantityTier,
  QUANTITY_TIERS,
  saveRecipe as localSaveRecipe,
  getRecipes as getLocalRecipes,
} from '../src/store/recipes';
import {
  type BuiltInRecipe,
  type NutritionInfo,
  BUILTIN_RECIPES,
  getBuiltInRecipesForProtein,
  getBuiltInRecipeById,
} from '../src/data/builtInRecipes';
import { generateRecipeFingerprint } from '../src/utils/recipeFingerprint';
import {
  filterRecipesForPreference,
  getDietPreference,
  isNonVegProteinId,
} from '../src/utils/dietPreference';
import { getDeviceId as getAdminDeviceId, isAdmin } from './adminService';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';
import { invokeAnthropicMessages } from './anthropicService';

// ─── Cache Constants ───
const CACHE_KEY_PREFIX = 'spicestrong_recipe_cache_';
const CACHE_META_PREFIX = 'spicestrong_recipe_cache_meta_';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const PENDING_SYNC_KEY = 'spicestrong_pending_sync';
const IMAGE_CACHE_KEY_PREFIX = 'spicestrong_recipe_img_urls_';
const DEVICE_ID_KEY = 'spicestrong_device_id';
const DELETED_RECIPES_KEY = 'spicestrong_deleted_recipes';
const ADMIN_DELETED_BLOCKLIST_REPAIR_KEY = 'spicestrong_admin_deleted_blocklist_repair_v1';

// ─── Supabase Row Types ───
interface SupabaseRecipeRow {
  id: string;
  name: string;
  protein_id: string;
  protein_name: string;
  protein_emoji: string;
  description: string | null;
  chef_tip: string | null;
  meal_type: string | null;
  ingredients: unknown;
  steps: unknown;
  time_minutes: number | null;
  difficulty: string | null;
  protein_per_100g: number | null;
  gradient: unknown;
  nutrition: unknown;
  ai_nutrition: unknown;
  source: 'curated' | 'ai' | 'user';
  is_active: boolean;
  is_pro: boolean;
  spice_level: string | null;
  cuisine: string | null;
  status: string | null;
  device_id: string | null;
  created_at: string;
  updated_at: string;
  cook_count?: number;
  recipe_images?: SupabaseImageRow[];
}

interface SupabaseImageRow {
  id: string;
  recipe_id: string;
  image_type: 'hero' | 'step' | 'ingredient';
  step_index: number | null;
  storage_url: string;
}

// ─── Supabase Availability Check ───
let recipeTableAvailable = false;

async function checkRecipeTableAvailable(): Promise<boolean> {
  if (recipeTableAvailable) return true;
  try {
    const { error } = await supabase
      .from('recipes')
      .select('id')
      .limit(1);
    if (!error) {
      recipeTableAvailable = true;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Device ID ───
export async function getCuratedRecipeCount(): Promise<number> {
  try {
    const tableAvailable = await checkRecipeTableAvailable();
    if (tableAvailable) {
      const { count, error } = await supabase
        .from('recipes')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'curated')
        .eq('is_active', true);
      if (!error && typeof count === 'number' && count > 0) return count;
    }
  } catch {}

  return Math.max(BUILTIN_RECIPES.length, 300);
}

async function getDeviceId(): Promise<string> {
  try {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `${Platform.OS}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `fallback_${Date.now()}`;
  }
}

// ─── Row-to-Model Mapping ───

function normalizeIngredients(raw: unknown): IngredientsByTier {
  const def: IngredientsByTier = { '2-3 servings': [], '4-6 servings': [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return def;
  const obj = raw as Record<string, unknown>;
  (QUANTITY_TIERS as readonly string[]).forEach((tier) => {
    if (Array.isArray(obj[tier])) {
      def[tier as QuantityTier] = (obj[tier] as { name: string; quantity: string }[]).map(
        (item) =>
          item && typeof item === 'object' && 'name' in item
            ? { name: String(item.name ?? ''), quantity: String(item.quantity ?? '') }
            : { name: '', quantity: '' },
      );
    }
  });
  return def;
}

function normalizeSteps(raw: unknown): CookingStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: Record<string, unknown>) => ({
    title: String(s.title ?? ''),
    description: String(s.description ?? ''),
    emoji: s.emoji ? String(s.emoji) : undefined,
    timerMinutes: typeof s.timerMinutes === 'number' ? s.timerMinutes : undefined,
    tip: s.tip ? String(s.tip) : undefined,
    ingredientsUsed: s.ingredientsUsed ? String(s.ingredientsUsed) : undefined,
    cookingMethod: s.cookingMethod ? String(s.cookingMethod) : undefined,
  }));
}

function mapSupabaseRowToRecipe(row: SupabaseRecipeRow): SavedRecipe & Partial<BuiltInRecipe> {
  const validMealTypes: MealType[] = ['breakfast', 'lunch_dinner', 'snack_dessert'];
  const mealType = validMealTypes.includes(row.meal_type as MealType)
    ? (row.meal_type as MealType)
    : undefined;

  const validDifficulties = ['Easy', 'Medium', 'Hard'] as const;
  const difficulty = validDifficulties.includes(row.difficulty as typeof validDifficulties[number])
    ? (row.difficulty as 'Easy' | 'Medium' | 'Hard')
    : undefined;

  const gradientArr = Array.isArray(row.gradient) ? row.gradient : undefined;
  const gradient = gradientArr && gradientArr.length === 2
    ? (gradientArr as [string, string])
    : undefined;

  const nutritionRaw = row.nutrition as Record<string, unknown> | null;
  const nutrition: NutritionInfo | undefined = nutritionRaw
    ? {
        calories: Number(nutritionRaw.calories ?? 0),
        proteinG: Number(nutritionRaw.proteinG ?? 0),
        fatG: Number(nutritionRaw.fatG ?? 0),
        carbsG: Number(nutritionRaw.carbsG ?? 0),
        fiberG: Number(nutritionRaw.fiberG ?? 0),
        sugarG: Number(nutritionRaw.sugarG ?? 0),
        sodiumMg: Number(nutritionRaw.sodiumMg ?? 0),
        cholesterolMg: nutritionRaw.cholesterolMg ? Number(nutritionRaw.cholesterolMg) : undefined,
        saturatedFatG: nutritionRaw.saturatedFatG ? Number(nutritionRaw.saturatedFatG) : undefined,
        ironMg: nutritionRaw.ironMg ? Number(nutritionRaw.ironMg) : undefined,
        calciumMg: nutritionRaw.calciumMg ? Number(nutritionRaw.calciumMg) : undefined,
      }
    : undefined;

  const aiNutritionRaw = row.ai_nutrition as Record<string, unknown> | null;
  const aiNutrition = aiNutritionRaw
    ? {
        calories: Number(aiNutritionRaw.calories ?? 0),
        proteinG: Number(aiNutritionRaw.proteinG ?? 0),
        fatG: Number(aiNutritionRaw.fatG ?? 0),
        carbsG: Number(aiNutritionRaw.carbsG ?? 0),
        fiberG: Number(aiNutritionRaw.fiberG ?? 0),
        sugarG: Number(aiNutritionRaw.sugarG ?? 0),
        sodiumMg: Number(aiNutritionRaw.sodiumMg ?? 0),
      }
    : undefined;

  return {
    id: row.id,
    name: row.name,
    proteinId: row.protein_id,
    proteinName: row.protein_name,
    proteinEmoji: row.protein_emoji,
    description: row.description ?? undefined,
    chefTip: row.chef_tip ?? '',
    mealType,
    ingredients: normalizeIngredients(row.ingredients),
    steps: normalizeSteps(row.steps),
    createdAt: new Date(row.created_at).getTime(),
    status: row.status === 'building' ? 'building' : 'ready',
    source: ((row as any).source as 'curated' | 'ai' | 'user') ?? undefined,
    aiNutrition: aiNutrition,
    communityCookCount: row.cook_count ?? 0,
    cuisine: (row as any).cuisine ?? undefined,

    // BuiltInRecipe extended fields
    timeMinutes: row.time_minutes ?? undefined,
    difficulty,
    proteinPer100g: row.protein_per_100g ? Number(row.protein_per_100g) : undefined,
    gradient: gradient as readonly [string, string] | undefined,
    nutrition,
    caloriesPerServing: nutrition?.calories,
    proteinGPerServing: nutrition?.proteinG,

    // Classification fields from pipeline
    spiceLevel: (row as any).spice_level ?? undefined,
    cuisineType: (row as any).cuisine_type ?? undefined,
    cookTimeBucket: (row as any).cook_time_bucket ?? undefined,
    dietaryTags: Array.isArray((row as any).dietary_tags) ? (row as any).dietary_tags : undefined,
    allergenTags: Array.isArray((row as any).allergen_tags) ? (row as any).allergen_tags : undefined,
    cookingMethod: (row as any).cooking_method ?? undefined,
    fitnessGoal: Array.isArray((row as any).fitness_goal) ? (row as any).fitness_goal : undefined,
    storageTags: Array.isArray((row as any).storage_tags) ? (row as any).storage_tags : undefined,
    pipelineCalories: (row as any).calories ? Number((row as any).calories) : undefined,
    pipelineProteinG: (row as any).protein_g ? Number((row as any).protein_g) : undefined,
    pipelineCarbsG: (row as any).carbs_g ? Number((row as any).carbs_g) : undefined,
    pipelineFatG: (row as any).fat_g ? Number((row as any).fat_g) : undefined,
  };
}

// ─── Cache Helpers ───

async function clearRecipeCaches(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((key) =>
      key.startsWith(CACHE_KEY_PREFIX)
      || key.startsWith(CACHE_META_PREFIX)
    );
    if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys);
  } catch {
    // Cache cleanup is best-effort; stale-while-revalidate will recover.
  }
}

async function repairAdminDeletedRecipeBlocklist(): Promise<void> {
  try {
    if (!(await isAdmin())) return;
    const repaired = await AsyncStorage.getItem(ADMIN_DELETED_BLOCKLIST_REPAIR_KEY);
    if (repaired === 'true') return;

    await AsyncStorage.removeItem(DELETED_RECIPES_KEY);
    await clearRecipeCaches();
    await AsyncStorage.setItem(ADMIN_DELETED_BLOCKLIST_REPAIR_KEY, 'true');
    console.log('[SpiceStrong] Admin deleted recipe blocklist repaired');
  } catch {
    // Best-effort repair for admin-only local state.
  }
}

async function getCachedRecipes(proteinId: string): Promise<SavedRecipe[] | null> {
  try {
    const data = await AsyncStorage.getItem(`${CACHE_KEY_PREFIX}${proteinId}`);
    if (!data) return null;
    let parsed;
    try { parsed = JSON.parse(data); } catch { console.warn('[SpiceStrong] Corrupted recipe cache for', proteinId, '— using fallback'); return null; }
    return parsed as SavedRecipe[];
  } catch {
    return null;
  }
}

async function setCachedRecipes(proteinId: string, recipes: SavedRecipe[]): Promise<void> {
  try {
    await AsyncStorage.setItem(`${CACHE_KEY_PREFIX}${proteinId}`, JSON.stringify(recipes));
    await AsyncStorage.setItem(
      `${CACHE_META_PREFIX}${proteinId}`,
      JSON.stringify({ lastFetched: Date.now() }),
    );
  } catch {
    // non-critical
  }
}

async function isCacheStale(proteinId: string): Promise<boolean> {
  try {
    const meta = await AsyncStorage.getItem(`${CACHE_META_PREFIX}${proteinId}`);
    if (!meta) return true;
    let parsed;
    try { parsed = JSON.parse(meta); } catch { console.warn('[SpiceStrong] Corrupted cache meta for', proteinId, '— treating as stale'); return true; }
    return Date.now() - parsed.lastFetched > CACHE_TTL_MS;
  } catch {
    return true;
  }
}

// ─── Image URL Cache ───

interface RecipeImageUrls {
  heroUrl: string | null;
  stepUrls: Record<number, string>;
}

async function cacheImageUrls(recipeId: string, urls: RecipeImageUrls): Promise<void> {
  try {
    await AsyncStorage.setItem(`${IMAGE_CACHE_KEY_PREFIX}${recipeId}`, JSON.stringify(urls));
  } catch { /* non-critical */ }
}

async function getCachedImageUrls(recipeId: string): Promise<RecipeImageUrls | null> {
  try {
    const data = await AsyncStorage.getItem(`${IMAGE_CACHE_KEY_PREFIX}${recipeId}`);
    if (!data) return null;
    let parsed;
    try { parsed = JSON.parse(data); } catch { console.warn('[SpiceStrong] Corrupted image URL cache for', recipeId, '— using fallback'); return null; }
    return parsed as RecipeImageUrls;
  } catch {
    return null;
  }
}

export async function getCachedRecipeImageUrls(recipeId: string): Promise<RecipeImageUrls | null> {
  return getCachedImageUrls(recipeId);
}

function extractImageUrls(images: SupabaseImageRow[] | undefined): RecipeImageUrls {
  const result: RecipeImageUrls = { heroUrl: null, stepUrls: {} };
  if (!images) return result;
  for (const img of images) {
    if (img.image_type === 'hero') {
      result.heroUrl = img.storage_url;
    } else if (img.image_type === 'step' && img.step_index != null) {
      result.stepUrls[img.step_index] = img.storage_url;
    }
  }
  return result;
}

// ─── Primary API ───

/**
 * Fetch all active recipes for a protein type.
 * Stale-while-revalidate:
 *   - Returns cached data immediately (or built-in fallback)
 *   - Returns a `refresh` promise that resolves to fresh data from Supabase (or null if offline)
 *   - Merges Supabase curated recipes with local AI recipes not yet synced
 */
export async function fetchRecipesByProtein(proteinId: string): Promise<{
  recipes: SavedRecipe[];
  refresh: Promise<SavedRecipe[] | null>;
}> {
  await repairAdminDeletedRecipeBlocklist();

  const dietPreference = await getDietPreference();
  if (dietPreference === 'veg' && isNonVegProteinId(proteinId)) {
    return { recipes: [], refresh: Promise.resolve([]) };
  }

  // 0. Load persistent deleted blocklist
  let deletedIds: Set<string>;
  try {
    const blockData = await AsyncStorage.getItem(DELETED_RECIPES_KEY);
    let blockList: string[];
    try { blockList = blockData ? JSON.parse(blockData) : []; } catch { console.warn('[SpiceStrong] Corrupted deleted recipes blocklist, using fallback'); blockList = []; }
    deletedIds = new Set(blockList);
  } catch {
    deletedIds = new Set();
  }
  const notDeleted = (r: SavedRecipe) => !deletedIds.has(r.id);

  // 1. Get cached recipes (or built-in + local fallback)
  const cached = await getCachedRecipes(proteinId);
  const localRecipes = await getLocalRecipes();
  const localForProtein = filterRecipesForPreference(
    localRecipes.filter((r) => r.proteinId === proteinId),
    dietPreference,
  );
  const builtIn = filterRecipesForPreference(getBuiltInRecipesForProtein(proteinId), dietPreference);

  // Merge: cached Supabase recipes + local-only AI recipes
  let immediate: SavedRecipe[];
  if (cached && cached.length > 0) {
    const cachedIds = new Set(cached.map((r) => r.id));
    // Add any local AI recipes not in the cache (offline-created, not yet synced)
    const localOnly = localForProtein.filter((r) => !cachedIds.has(r.id));
    immediate = [...cached, ...localOnly].filter(notDeleted);
  } else {
    // No cache — use built-in + local
    const builtInIds = new Set(builtIn.map((r) => r.id));
    const localOnly = localForProtein.filter((r) => !builtInIds.has(r.id));
    immediate = [...builtIn, ...localOnly].filter(notDeleted);
  }

  // 2. Always revalidate in background (true stale-while-revalidate)
  const refresh: Promise<SavedRecipe[] | null> = (async () => {
        try {
          const isAvailable = await checkRecipeTableAvailable();
          if (!isAvailable) return null;

          const deviceId = await getDeviceId();
          const admin = await isAdmin();
          let query = supabase
            .from('recipes')
            .select('*, recipe_images(*)')
            .eq('protein_id', proteinId)
            .eq('is_active', true)
            .order('created_at', { ascending: true });

          if (!admin) {
            // Regular devices fetch public recipes plus their own private AI/user recipes.
            // Some older curated rows were published before `source` was consistently backfilled.
            query = query.or(`source.eq.curated,is_published.eq.true,device_id.eq.${deviceId}`);
          }

          const { data, error } = await query;

          if (error || !data) {
            if (__DEV__) console.warn(`[SpiceStrong] Supabase fetch failed for ${proteinId}:`, error?.message || 'no data');
            return null;
          }
          if (__DEV__) console.log(`[SpiceStrong] Supabase fetch OK for ${proteinId}: ${data.length} recipes`);

          const supabaseRecipes = filterRecipesForPreference(
            (data as SupabaseRecipeRow[]).map(mapSupabaseRowToRecipe),
            dietPreference,
          );

          // Cache image URLs for each recipe
          for (const row of data as SupabaseRecipeRow[]) {
            const urls = extractImageUrls(row.recipe_images);
            await cacheImageUrls(row.id, urls);
          }

          // Merge with local-only AI recipes (re-read to pick up any deletes since load)
          const supabaseIds = new Set(supabaseRecipes.map((r) => r.id));
          const freshLocal = await getLocalRecipes();
          const freshLocalForProtein = filterRecipesForPreference(
            freshLocal.filter((r) => r.proteinId === proteinId),
            dietPreference,
          );
          const localOnlyAI = freshLocalForProtein.filter((r) => !supabaseIds.has(r.id));

          // Preserve local source field over Supabase (local 'user' source is authoritative)
          const localById = new Map(freshLocalForProtein.map((r) => [r.id, r]));
          const patchedSupabase = supabaseRecipes.map((r) => {
            const local = localById.get(r.id);
            if (local?.source && local.source !== r.source) return { ...r, source: local.source };
            return r;
          });

          // Re-read blocklist (may have changed since load started)
          let freshDeletedIds: Set<string>;
          try {
            const bd = await AsyncStorage.getItem(DELETED_RECIPES_KEY);
            let bdList: string[];
            try { bdList = bd ? JSON.parse(bd) : []; } catch { console.warn('[SpiceStrong] Corrupted deleted recipes blocklist, using fallback'); bdList = []; }
            freshDeletedIds = new Set(bdList);
          } catch { freshDeletedIds = new Set(); }

          const merged = [...patchedSupabase, ...localOnlyAI].filter(r => !freshDeletedIds.has(r.id));

          // Update cache
          await setCachedRecipes(proteinId, merged);
          return merged;
        } catch {
          return null;
        }
      })();

  return { recipes: immediate, refresh };
}

/**
 * Fetch a single recipe by ID.
 * Checks: cache → Supabase → local AsyncStorage → built-in fallback.
 */
export async function fetchRecipeById(recipeId: string): Promise<SavedRecipe | null> {
  const dietPreference = await getDietPreference();

  // 1. Check built-in first (always available offline)
  const builtIn = getBuiltInRecipeById(recipeId);
  if (builtIn) return filterRecipesForPreference([builtIn], dietPreference)[0] ?? null;

  // 2. Check local AsyncStorage
  const localRecipes = await getLocalRecipes();
  const local = localRecipes.find((r) => r.id === recipeId);
  if (local) return filterRecipesForPreference([local], dietPreference)[0] ?? null;

  // 3. Check all caches
  try {
    for (const protein of ['chicken', 'paneer', 'eggs', 'lamb', 'goat', 'pork', 'fish', 'prawns', 'tofu', 'soy', 'beans', 'milk', 'whey']) {
      const cached = await getCachedRecipes(protein);
      if (cached) {
        const found = cached.find((r) => r.id === recipeId);
        if (found) return filterRecipesForPreference([found], dietPreference)[0] ?? null;
      }
    }
  } catch { /* continue */ }

  // 4. Try Supabase directly
  try {
    const isAvailable = await checkRecipeTableAvailable();
    if (isAvailable) {
      const { data, error } = await supabase
        .from('recipes')
        .select('*, recipe_images(*)')
        .eq('id', recipeId)
        .single();

      if (!error && data) {
        const recipe = mapSupabaseRowToRecipe(data as SupabaseRecipeRow);
        if (filterRecipesForPreference([recipe], dietPreference).length === 0) return null;
        const urls = extractImageUrls((data as SupabaseRecipeRow).recipe_images);
        await cacheImageUrls(recipeId, urls);
        return recipe;
      }
    }
  } catch { /* fallback */ }

  return null;
}

/**
 * Save an AI-generated recipe to AsyncStorage ONLY (local, private).
 * Recipes stay local until the user explicitly publishes them.
 * 
 * ⚠️  IMPORTANT: AI recipes do NOT auto-sync to Supabase.
 *     They are private to this device until the user clicks "Publish".
 *
 * @param recipe - The recipe to save
 * @returns Promise<void> — always succeeds (local storage is reliable)
 */
export async function saveAIRecipe(recipe: SavedRecipe): Promise<void> {
  // Save locally only — immediate, offline-safe, private to this device
  // User must explicitly "publish" to share with the community
  await localSaveRecipe(recipe);
  console.log(`[SpiceStrong] AI recipe saved locally (private): ${recipe.id}`);
}

/**
 * Result of a recipe insert/sync operation.
 * `duplicate: true` means a recipe with the same fingerprint already exists.
 */
export interface RecipeSyncResult {
  success: boolean;
  duplicate?: boolean;
  message?: string;
}

/**
 * Publish a locally-created AI recipe to Supabase (make it community-visible).
 * This is the ONLY way AI recipes should be synced to Supabase.
 * 
 * @param recipe - The AI recipe to publish
 * @returns RecipeSyncResult with success/duplicate status
 */
export async function publishRecipe(recipe: SavedRecipe): Promise<RecipeSyncResult> {
  try {
    const isAvailable = await checkRecipeTableAvailable();
    if (!isAvailable) {
      return { success: false, message: 'No internet connection. Please try again.' };
    }

    console.log(`[SpiceStrong] Publishing recipe: ${recipe.name}...`);

    // Sync to Supabase with duplicate check
    const result = await syncRecipeToSupabase(recipe);
    
    if (result.duplicate) {
      return { 
        success: false, 
        duplicate: true, 
        message: 'A similar recipe already exists in the community.' 
      };
    }

    if (result.success) {
      console.log(`[SpiceStrong] Recipe published successfully: ${recipe.id}`);
      return { success: true, message: 'Recipe published to the community!' };
    }

    return { success: false, message: 'Failed to publish recipe.' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SpiceStrong] Publish failed:', msg);
    return { success: false, message: msg };
  }
}

/**
 * Upload a recipe to Supabase with fingerprint-based deduplication.
 *
 * Generates a SHA-256 fingerprint from the recipe's ingredients + step count.
 * If a recipe with the same fingerprint already exists (Postgres error 23505),
 * returns `{ duplicate: true }` instead of throwing.
 *
 * @param recipe - The recipe to sync
 * @param overrideDuplicate - If true, inserts with null fingerprint to bypass dedup
 * @returns RecipeSyncResult indicating success or duplicate
 */
async function syncRecipeToSupabase(
  recipe: SavedRecipe,
  overrideDuplicate = false
): Promise<RecipeSyncResult> {
  const isAvailable = await checkRecipeTableAvailable();
  if (!isAvailable) throw new Error('Supabase not available');

  const deviceId = await getAdminDeviceId();

  // Generate fingerprint (null if user is overriding a detected duplicate)
  let fingerprint: string | null = null;
  if (!overrideDuplicate) {
    try {
      fingerprint = await generateRecipeFingerprint({
        ingredients: recipe.ingredients,
        steps: recipe.steps,
      });
    } catch (err) {
      console.warn('[SpiceStrong] Fingerprint generation failed, proceeding without:', err);
    }
  }

  const clientSafeSource = recipe.source === 'user' ? 'user' : 'ai';

  const row: Record<string, unknown> = {
    id: recipe.id,
    name: recipe.name,
    protein_id: recipe.proteinId,
    protein_name: recipe.proteinName,
    protein_emoji: recipe.proteinEmoji,
    description: recipe.description ?? null,
    chef_tip: recipe.chefTip || null,
    meal_type: recipe.mealType ?? null,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    source: clientSafeSource,
    is_active: true,
    is_published: false,
    is_pro: false,
    // DB CHECK constraint only allows 'building' or 'ready'
    status: (recipe.status === 'building') ? 'building' : 'ready',
    device_id: deviceId,
    ai_nutrition: recipe.aiNutrition ?? null,
    fingerprint,
  };

  const { error } = await supabase
    .from('recipes')
    .upsert(row, { onConflict: 'id' });

  // Handle duplicate fingerprint (unique constraint violation)
  if (error && error.code === '23505' && error.message?.includes('fingerprint')) {
    console.log(`[SpiceStrong] Duplicate recipe detected: ${recipe.name}`);
    return { success: false, duplicate: true, message: 'A similar recipe already exists in SpiceStrong!' };
  }

  if (error) {
    console.error('[SpiceStrong] Failed to sync recipe to Supabase:', error.message);
    throw error;
  }

  console.log(`[SpiceStrong] Recipe synced to Supabase: ${recipe.id}`);
  return { success: true };
}

/**
 * Add a recipe ID to the pending sync list.
 */
async function addToPendingSync(recipeId: string): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    let pending: string[];
    try { pending = data ? JSON.parse(data) : []; } catch { console.warn('[SpiceStrong] Corrupted pending sync data, resetting'); pending = []; }
    if (!pending.includes(recipeId)) {
      pending.push(recipeId);
      await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending));
    }
  } catch { /* non-critical */ }
}

/**
 * Sync any locally-created AI recipes that haven't been pushed to Supabase.
 * Called on app startup.
 */
export async function syncPendingAIRecipes(): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    if (!data) return;
    let pending: string[];
    try { pending = JSON.parse(data); } catch { console.warn('[SpiceStrong] Corrupted pending sync data, clearing'); await AsyncStorage.removeItem(PENDING_SYNC_KEY); return; }
    if (pending.length === 0) return;

    const isAvailable = await checkRecipeTableAvailable();
    if (!isAvailable) return;

    const localRecipes = await getLocalRecipes();
    const synced: string[] = [];

    for (const recipeId of pending) {
      const recipe = localRecipes.find((r) => r.id === recipeId);
      if (!recipe) {
        synced.push(recipeId); // Recipe was deleted locally, remove from pending
        continue;
      }
      try {
        await syncRecipeToSupabase(recipe);
        synced.push(recipeId);
      } catch {
        // Will retry next app launch
      }
    }

    // Remove synced recipes from pending list
    if (synced.length > 0) {
      const remaining = pending.filter((id) => !synced.includes(id));
      await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(remaining));
      console.log(`[SpiceStrong] Synced ${synced.length} pending recipes`);
    }
  } catch (e) {
    console.warn('[SpiceStrong] Pending sync failed:', e);
  }
}

/**
 * Force refresh the recipe cache from Supabase.
 * Fetches ALL active recipes and updates the per-protein caches.
 * Called on app startup.
 */
export async function refreshRecipeCache(): Promise<void> {
  try {
    await repairAdminDeletedRecipeBlocklist();

    const isAvailable = await checkRecipeTableAvailable();
    if (!isAvailable) return;

    const deviceId = await getDeviceId();
    const admin = await isAdmin();
    let query = supabase
      .from('recipes')
      .select('*, recipe_images(*)')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (!admin) {
      // Regular devices fetch public recipes plus their own private AI/user recipes.
      // Some older curated rows were published before `source` was consistently backfilled.
      query = query.or(`source.eq.curated,is_published.eq.true,device_id.eq.${deviceId}`);
    }

    const { data, error } = await query;

    if (error || !data) return;

    // Group by protein_id and update per-protein caches
    const byProtein: Record<string, SavedRecipe[]> = {};
    for (const row of data as SupabaseRecipeRow[]) {
      const recipe = mapSupabaseRowToRecipe(row);
      const pid = row.protein_id;
      if (!byProtein[pid]) byProtein[pid] = [];
      byProtein[pid].push(recipe);

      // Cache image URLs
      const urls = extractImageUrls(row.recipe_images);
      await cacheImageUrls(row.id, urls);
    }

    // Write per-protein caches
    for (const [proteinId, recipes] of Object.entries(byProtein)) {
      // Merge with local-only AI recipes
      const localRecipes = await getLocalRecipes();
      const localForProtein = localRecipes.filter((r) => r.proteinId === proteinId);
      const supabaseIds = new Set(recipes.map((r) => r.id));
      const localOnly = localForProtein.filter((r) => !supabaseIds.has(r.id));
      await setCachedRecipes(proteinId, [...recipes, ...localOnly]);
    }

    console.log(`[SpiceStrong] Recipe cache refreshed: ${data.length} recipes across ${Object.keys(byProtein).length} proteins`);
  } catch (e) {
    console.warn('[SpiceStrong] Recipe cache refresh failed:', e);
  }
}

/**
 * Get image URLs for a recipe from cache or Supabase.
 */
export async function getRecipeImageUrls(recipeId: string): Promise<RecipeImageUrls> {
  // 1. Check cached URLs — only use cache if it has a heroUrl
  const cached = await getCachedImageUrls(recipeId);
  if (cached?.heroUrl) return cached;

  // 2. Try Supabase (always re-check if cached heroUrl is null)
  try {
    const isAvailable = await checkRecipeTableAvailable();
    if (isAvailable) {
      const { data, error } = await supabase
        .from('recipe_images')
        .select('*')
        .eq('recipe_id', recipeId);

      if (!error && data) {
        const urls = extractImageUrls(data as SupabaseImageRow[]);
        await cacheImageUrls(recipeId, urls);
        return urls;
      }
    }
  } catch { /* fallback */ }

  return cached ?? { heroUrl: null, stepUrls: {} };
}

/**
 * Upload AI recipe hero image to Supabase Storage and record in recipe_images table.
 * Called after DALL-E image generation completes.
 *
 * @param recipeId - The recipe ID
 * @param localUri - The local file URI from DALL-E download
 * @returns The public URL of the uploaded image, or null on failure
 */
export async function uploadRecipeHeroImage(
  recipeId: string,
  localUri: string,
): Promise<string | null> {
  try {
    const isAvailable = await checkRecipeTableAvailable();
    if (!isAvailable) return null;

    // Read the local file and upload to Supabase Storage
    const response = await fetch(localUri);
    const blob = await response.blob();

    const storagePath = `${recipeId}/hero.png`;
    const { error: uploadError } = await supabase.storage
      .from('recipe-images')
      .upload(storagePath, blob, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('[SpiceStrong] Hero image upload failed:', uploadError.message);
      return null;
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('recipe-images')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Insert into recipe_images table
    // Insert image record (ignore duplicate — no UPDATE/DELETE RLS policy)
    const { error: imgError } = await supabase.from('recipe_images').insert({
      recipe_id: recipeId,
      image_type: 'hero',
      step_index: null,
      storage_url: publicUrl,
    });
    if (imgError && !imgError.message?.includes('duplicate')) {
      console.warn('[SpiceStrong] Hero image record insert failed:', imgError.message);
    }

    console.log(`[SpiceStrong] Hero image uploaded: ${recipeId} -> ${publicUrl}`);
    return publicUrl;
  } catch (e) {
    console.warn('[SpiceStrong] Hero image upload failed:', e);
    return null;
  }
}

/**
 * Upload a step image to Supabase Storage and register it in recipe_images.
 */
export async function uploadStepImage(
  recipeId: string,
  stepIndex: number,
  localUri: string,
): Promise<string | null> {
  try {
    const isAvailable = await checkRecipeTableAvailable();
    if (!isAvailable) return null;

    const response = await fetch(localUri);
    const blob = await response.blob();

    const storagePath = `${recipeId}/step_${stepIndex}.png`;
    const { error: uploadError } = await supabase.storage
      .from('recipe-images')
      .upload(storagePath, blob, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error(`[SpiceStrong] Step ${stepIndex} image upload failed:`, uploadError.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('recipe-images')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Insert image record (ignore duplicate — no UPDATE/DELETE RLS policy)
    const { error: imgError } = await supabase.from('recipe_images').insert({
      recipe_id: recipeId,
      image_type: 'step',
      step_index: stepIndex,
      storage_url: publicUrl,
    });
    if (imgError && !imgError.message?.includes('duplicate')) {
      console.warn(`[SpiceStrong] Step ${stepIndex} image record insert failed:`, imgError.message);
    }

    try {
      await adminUpsertRecipeImage(recipeId, 'step', publicUrl, stepIndex);
    } catch (error) {
      console.warn('[SpiceStrong] Admin step image metadata update failed:', error);
    }

    console.log(`[SpiceStrong] Step ${stepIndex} image uploaded: ${recipeId} -> ${publicUrl}`);
    return publicUrl;
  } catch (e) {
    console.warn(`[SpiceStrong] Step ${stepIndex} image upload failed:`, e);
    return null;
  }
}

/**
 * Fully delete an AI recipe from all layers:
 *   1. Local AsyncStorage (spicestrong_recipes)
 *   2. Per-protein recipe cache (spicestrong_recipe_cache_[proteinId])
 *   3. Image URL cache (spicestrong_recipe_img_urls_[recipeId])
 *   4. Supabase database (set is_active = false)
 *
 * @returns true if deletion succeeded at the local level
 */
export async function deleteAIRecipe(
  recipeId: string,
  proteinId: string,
  skipSupabaseDeactivation = false,
  addToDeletedBlocklist = true,
): Promise<boolean> {
  try {
    // 1. Remove from local AsyncStorage
    const data = await AsyncStorage.getItem('spicestrong_recipes');
    if (data) {
      let all: Array<{ id: string }>;
      try { all = JSON.parse(data); } catch { console.warn('[SpiceStrong] Corrupted local recipes data during delete, skipping local cleanup'); all = []; }
      const updated = all.filter((r) => r.id !== recipeId);
      await AsyncStorage.setItem('spicestrong_recipes', JSON.stringify(updated));
    }

    // Also remove from pending sync so a deleted local-only recipe cannot be uploaded later.
    const pendingData = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    if (pendingData) {
      let pending: string[];
      try { pending = JSON.parse(pendingData); } catch { pending = []; }
      await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending.filter((id) => id !== recipeId)));
    }

    // 2. Remove from per-protein recipe cache
    const cached = await getCachedRecipes(proteinId);
    if (cached) {
      const updatedCache = cached.filter((r) => r.id !== recipeId);
      await setCachedRecipes(proteinId, updatedCache);
    }

    // 3. Remove image URL cache + invalidate protein cache timestamp
    await AsyncStorage.removeItem(`${IMAGE_CACHE_KEY_PREFIX}${recipeId}`);
    await AsyncStorage.removeItem(`${CACHE_META_PREFIX}${proteinId}`);

    // 4. Deactivate in Supabase (soft delete — set is_active = false)
    if (!skipSupabaseDeactivation) {
      try {
        const isAvailable = await checkRecipeTableAvailable();
        if (isAvailable) {
          const { error, count } = await supabase
            .from('recipes')
            .update({ is_active: false })
            .eq('id', recipeId);
          if (error) {
            console.warn(`[SpiceStrong] Supabase deactivation failed (RLS?):`, error.message);
          } else {
            console.log(`[SpiceStrong] Recipe deactivated in Supabase: ${recipeId}`);
          }
        }
      } catch {
        console.warn(`[SpiceStrong] Could not deactivate recipe in Supabase: ${recipeId}`);
      }
    }

    // 5. Track deleted user/AI IDs in a persistent blocklist so local refresh cannot bring them back.
    if (addToDeletedBlocklist) {
      try {
        const existing = await AsyncStorage.getItem(DELETED_RECIPES_KEY);
        let blocked: string[];
        try { blocked = existing ? JSON.parse(existing) : []; } catch { console.warn('[SpiceStrong] Corrupted deleted recipes blocklist, resetting'); blocked = []; }
        if (!blocked.includes(recipeId)) {
          blocked.push(recipeId);
          await AsyncStorage.setItem(DELETED_RECIPES_KEY, JSON.stringify(blocked));
        }
      } catch { /* best effort */ }
    }

    console.log(`[SpiceStrong] Recipe fully deleted: ${recipeId}`);
    return true;
  } catch (e) {
    console.error('[SpiceStrong] Recipe deletion failed:', e);
    return false;
  }
}

async function adminRecipePatch(recipeId: string, payload: Record<string, unknown>): Promise<void> {
  const admin = await isAdmin();
  if (!admin) throw new Error('Admin access required');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase is not configured');

  const deviceId = await getAdminDeviceId();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/spicestrong_admin_update_recipe`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      p_recipe_id: recipeId,
      p_admin_device_id: deviceId,
      p_payload: payload,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 404 || body.includes('spicestrong_admin_update_recipe')) {
      throw new Error('Admin database function is missing. Run supabase/admin-device-policies.sql in Supabase SQL Editor.');
    }
    throw new Error(body || `Supabase admin update failed (${res.status})`);
  }

  const updatedRows = await res.json().catch(() => null);
  if (Array.isArray(updatedRows) && updatedRows.length === 0) {
    throw new Error('No matching recipe row was updated. Sync this recipe to Supabase first.');
  }
}

function isAdminDatabaseFunctionMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Admin database function is missing')
    || message.includes('Admin image database function is missing')
    || message.includes('spicestrong_admin_update_recipe')
    || message.includes('spicestrong_admin_upsert_recipe_image')
    || message.includes('PGRST202');
}

async function invalidateRecipeCaches(proteinId: string, recipeId?: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${CACHE_META_PREFIX}${proteinId}`);
    await AsyncStorage.removeItem(`${CACHE_KEY_PREFIX}${proteinId}`);
    if (recipeId) await AsyncStorage.removeItem(`${IMAGE_CACHE_KEY_PREFIX}${recipeId}`);
  } catch {
    // Cache invalidation is best-effort; backend writes are authoritative.
  }
}

async function adminUpsertRecipeImage(
  recipeId: string,
  imageType: 'hero' | 'step' | 'ingredient',
  storageUrl: string,
  stepIndex: number | null = null,
): Promise<void> {
  if (!(await isAdmin())) return;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase is not configured');

  const deviceId = await getAdminDeviceId();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/spicestrong_admin_upsert_recipe_image`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_recipe_id: recipeId,
      p_admin_device_id: deviceId,
      p_image_type: imageType,
      p_step_index: stepIndex,
      p_storage_url: storageUrl,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 404 || body.includes('spicestrong_admin_upsert_recipe_image')) {
      throw new Error('Admin image database function is missing. Run supabase/admin-device-policies.sql in Supabase SQL Editor.');
    }
    throw new Error(body || `Supabase admin image update failed (${res.status})`);
  }
}

export async function adminDeactivateRecipe(recipeId: string, proteinId: string): Promise<void> {
  // Always remove local AsyncStorage copies/caches too. Some admin-created or
  // imported recipes may exist only on this device and never reach Supabase.
  await deleteAIRecipe(recipeId, proteinId, true, false);

  try {
    await adminRecipePatch(recipeId, { is_active: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('No matching recipe row')) {
      console.log(`[SpiceStrong] Admin delete: ${recipeId} was local-only`);
      return;
    }
    if (isAdminDatabaseFunctionMissing(error)) {
      console.warn(`[SpiceStrong] Admin delete hidden locally; Supabase admin RPC is not deployed for ${recipeId}.`);
      return;
    }
    throw error;
  }
}

export async function adminPublishRecipe(recipe: SavedRecipe): Promise<void> {
  const publishPayload = {
    source: 'curated',
    is_published: true,
    is_active: true,
    status: 'ready',
    name: recipe.name,
    protein_id: recipe.proteinId,
    protein_name: recipe.proteinName,
    protein_emoji: recipe.proteinEmoji,
    description: recipe.description ?? null,
    chef_tip: recipe.chefTip || null,
    meal_type: recipe.mealType ?? null,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    ai_nutrition: recipe.aiNutrition ?? null,
  };

  try {
    await adminRecipePatch(recipe.id, publishPayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('No matching recipe row')) throw error;

    // Local-only/offline-created recipes need a backend row before the admin RPC can publish them.
    const syncResult = await syncRecipeToSupabase(recipe, true);
    if (!syncResult.success) {
      throw new Error(syncResult.message || 'Could not sync recipe before publishing.');
    }
    await adminRecipePatch(recipe.id, publishPayload);
  }

  await invalidateRecipeCaches(recipe.proteinId);
}

// ─── Classification System Prompt ───
// Mirrors scripts/pipeline/classifyRecipe.js — keep in sync
export async function adminUpdateRecipeSteps(
  recipeId: string,
  proteinId: string,
  steps: CookingStep[],
): Promise<void> {
  await adminRecipePatch(recipeId, { steps });

  try {
    await AsyncStorage.removeItem(`${CACHE_META_PREFIX}${proteinId}`);
    const cached = await getCachedRecipes(proteinId);
    if (cached) {
      await setCachedRecipes(
        proteinId,
        cached.map((recipe) => recipe.id === recipeId ? { ...recipe, steps } : recipe),
      );
    }
  } catch {
    // Cache refresh is best-effort; the database update above is authoritative.
  }
}

export async function setCachedRecipeStepImageUrl(
  recipeId: string,
  stepIndex: number,
  url: string,
): Promise<void> {
  const cached = await getCachedImageUrls(recipeId);
  await cacheImageUrls(recipeId, {
    heroUrl: cached?.heroUrl ?? null,
    stepUrls: {
      ...(cached?.stepUrls ?? {}),
      [stepIndex]: url,
    },
  });
}

const CLASSIFICATION_SYSTEM_PROMPT = `You are a recipe classification engine for SpiceStrong, a high-protein cooking app.

Given a recipe name, ingredients list, and cooking instructions, you must classify the recipe across 10 dimensions.

Return ONLY valid JSON — no preamble, no markdown backticks, no explanation. Just the raw JSON object.

The JSON must have this exact shape:
{
  "cuisine_type": string,
  "spice_level": string,
  "difficulty": string,
  "cook_time_bucket": string,
  "meal_type": string[],
  "dietary_tags": string[],
  "allergen_tags": string[],
  "cooking_method": string,
  "fitness_goal": string[],
  "storage_tags": string[]
}

ALLOWED VALUES for each field:

1. cuisine_type (pick exactly ONE):
   "Indian", "South Indian", "Korean", "Japanese", "Chinese",
   "Vietnamese", "Thai", "Filipino", "Mediterranean", "Italian", "Greek",
   "Lebanese", "Turkish", "American", "Mexican", "Brazilian", "AI Fusion"

2. spice_level (pick exactly ONE):
   "No spice", "Mild", "Medium", "Hot", "Extra hot"

3. difficulty (pick exactly ONE):
   "Beginner", "Intermediate", "Advanced", "Chef level"

4. cook_time_bucket (pick exactly ONE):
   "Under 15 min", "15-30 min", "30-60 min", "1-2 hours", "2+ hours"

5. meal_type (pick 1-4 from this list):
   "Breakfast", "Lunch", "Dinner", "Snack", "Pre-workout", "Post-workout", "Meal prep", "Bulk cooking"

6. dietary_tags (pick ALL that apply):
   "High protein", "Low fat", "Low carb", "Keto", "Low calorie", "Low cholesterol", "Low sodium", "Low sugar", "High fiber"
   Threshold rules:
   — "High protein": >= 30g protein per serving
   — "High fiber": >= 5g fiber per serving
   — "Low carb": < 25g carbs per serving
   — "Keto": carbs < 20g AND fat is dominant macro
   — "Low fat": fat < 10g per serving
   — "Low calorie": calories < 400 per serving

7. allergen_tags (pick ALL that apply — "free-from" labels):
   "Gluten free", "Dairy free", "Nut free", "Egg free", "Soy free", "Shellfish free", "Vegetarian", "Vegan", "Paleo", "Whole30"
   IMPORTANT: Seafood is NON-VEGETARIAN. Fish, prawns, shrimp, crab, lobster, shellfish, chicken, meat, and eggs must NEVER be tagged "Vegetarian" or "Vegan".

8. cooking_method (pick exactly ONE):
   "Grilled", "Baked", "Stovetop", "Air fryer", "Slow cooker", "Instant pot", "Steamed", "Stir-fried", "Raw / No cook", "Smoked", "Broiled", "Pan-seared"

9. fitness_goal (pick ALL that apply):
   "Muscle gain", "Fat loss", "Maintenance", "Endurance", "Recovery", "Weight loss", "Body recomp"

10. storage_tags (pick ALL that apply, empty array if none):
    "Freezer friendly", "Fridge 3-5 days", "Make ahead", "Meal prep ready", "Kid friendly", "Office lunch"

IMPORTANT: Return ONLY the JSON object. No other text.`;

/**
 * Difficulty mapping: Claude returns Beginner/Intermediate/Advanced/Chef level,
 * DB CHECK constraint allows only Easy/Medium/Hard.
 */
const DIFFICULTY_MAP: Record<string, string> = {
  'Beginner': 'Easy',
  'Intermediate': 'Medium',
  'Advanced': 'Hard',
  'Chef level': 'Hard',
};

/**
 * Classify an AI-generated recipe and update its Supabase row with the new
 * category columns (cuisine_type, dietary_tags, allergen_tags, fitness_goal, etc.)
 * and Edamam-style nutrition columns (calories, protein_g, carbs_g, fat_g, fiber_g).
 *
 * This now goes through the Supabase proxy via invokeAnthropicMessages.
 *
 * @param recipe - The saved recipe to classify
 * @returns true if classification succeeded, false otherwise
 */
export async function classifyAndEnrichRecipe(recipe: SavedRecipe): Promise<boolean> {
  try {
    const isAvailable = await checkRecipeTableAvailable();
    if (!isAvailable) return false;

    // Extract flat ingredient strings and instruction strings
    const ingredientTier = recipe.ingredients['2-3 servings'] ?? [];
    const flatIngredients = ingredientTier.map(
      (ing) => (ing.quantity ? `${ing.quantity} ${ing.name}` : ing.name)
    );
    const flatInstructions = recipe.steps.map((s) => s.description);

    if (flatIngredients.length === 0 || flatInstructions.length === 0) {
      console.warn('[SpiceStrong] Recipe has no ingredients or steps — skipping classification');
      return false;
    }

    // ─── Step 1: Call Claude for classification ───
    console.log(`[SpiceStrong] Classifying recipe: ${recipe.name}...`);

    const userMessage = `Classify this recipe:

Recipe Name: ${recipe.name}

Ingredients:
${flatIngredients.map((ing, i) => `${i + 1}. ${ing}`).join('\n')}

Instructions:
${flatInstructions.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;

    const data = await invokeAnthropicMessages({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: CLASSIFICATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });
    let rawText = (data.content?.[0]?.text ?? '').trim();

    // Strip markdown fences if present
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      rawText = rawText.substring(firstBrace, lastBrace + 1);
    }

    let classification;
    try { classification = JSON.parse(rawText); } catch { console.warn('[SpiceStrong] Corrupted classification response, could not parse JSON'); return false; }

    // ─── Step 2: Build the update payload ───
    const updatePayload: Record<string, unknown> = {};

    if (classification.cuisine_type) updatePayload.cuisine_type = classification.cuisine_type;
    if (classification.spice_level) updatePayload.spice_level = classification.spice_level;
    if (classification.difficulty) {
      updatePayload.difficulty = DIFFICULTY_MAP[classification.difficulty] || classification.difficulty;
    }
    if (classification.cook_time_bucket) updatePayload.cook_time_bucket = classification.cook_time_bucket;
    if (classification.meal_type) updatePayload.meal_type_tags = classification.meal_type;
    if (classification.dietary_tags) updatePayload.dietary_tags = classification.dietary_tags;
    if (classification.allergen_tags) updatePayload.allergen_tags = classification.allergen_tags;
    if (classification.cooking_method) updatePayload.cooking_method = classification.cooking_method;
    if (classification.fitness_goal) updatePayload.fitness_goal = classification.fitness_goal;
    if (classification.storage_tags) updatePayload.storage_tags = classification.storage_tags;

    // ─── Step 3: Map AI nutrition to the normalized nutrition columns ───
    // AI recipes store nutrition in aiNutrition (total for 2-3 servings batch).
    // Normalize to per-serving (divide by 2.5 as default serving count)
    if (recipe.aiNutrition) {
      const servings = 2.5; // 2-3 servings tier midpoint
      const ai = recipe.aiNutrition;
      if (ai.calories > 0) updatePayload.calories = Math.round(ai.calories / servings);
      if (ai.proteinG > 0) updatePayload.protein_g = parseFloat((ai.proteinG / servings).toFixed(1));
      if (ai.carbsG > 0) updatePayload.carbs_g = parseFloat((ai.carbsG / servings).toFixed(1));
      if (ai.fatG > 0) updatePayload.fat_g = parseFloat((ai.fatG / servings).toFixed(1));
      if (ai.fiberG > 0) updatePayload.fiber_g = parseFloat((ai.fiberG / servings).toFixed(1));
    }

    // Mark as AI-generated
    updatePayload.is_ai_generated = true;
    updatePayload.recipe_source = 'ai';

    // ─── Step 4: Update the Supabase row ───
    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabase
        .from('recipes')
        .update(updatePayload)
        .eq('id', recipe.id);

      if (updateError) {
        console.warn(`[SpiceStrong] Classification update failed: ${updateError.message}`);
        return false;
      }

      console.log(`[SpiceStrong] Recipe classified: ${recipe.name} — ${Object.keys(updatePayload).length} fields updated`);
      console.log(`[SpiceStrong]   cuisine=${classification.cuisine_type}, spice=${classification.spice_level}, method=${classification.cooking_method}`);
      return true;
    }

    return false;
  } catch (err) {
    console.warn('[SpiceStrong] Classification failed:', err);
    return false;
  }
}

/**
 * Update a recipe's status in Supabase (e.g., 'building' -> 'ready').
 */
export async function updateRecipeStatus(
  recipeId: string,
  status: 'building' | 'ready' | 'pending_review' | 'rejected',
): Promise<void> {
  try {
    const isAvailable = await checkRecipeTableAvailable();
    if (!isAvailable) return;

    // DB CHECK constraint only allows 'building' or 'ready'
    const dbStatus = (status === 'building') ? 'building' : 'ready';

    await supabase
      .from('recipes')
      .update({ status: dbStatus })
      .eq('id', recipeId);
  } catch {
    // non-critical
  }
}

/**
 * Upload a user-submitted step photo to Supabase Storage.
 * Follows the same pattern as uploadRecipeHeroImage.
 */
export async function uploadRecipeStepImage(
  recipeId: string,
  stepIndex: number,
  localUri: string,
): Promise<string | null> {
  try {
    const isAvailable = await checkRecipeTableAvailable();
    if (!isAvailable) return null;

    const response = await fetch(localUri);
    const blob = await response.blob();

    const storagePath = `${recipeId}/step_${stepIndex}.png`;
    const { error: uploadError } = await supabase.storage
      .from('recipe-images')
      .upload(storagePath, blob, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error(`[SpiceStrong] Step ${stepIndex} image upload failed:`, uploadError.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('recipe-images')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Insert image record (ignore duplicate — no UPDATE/DELETE RLS policy)
    const { error: imgError } = await supabase.from('recipe_images').insert({
      recipe_id: recipeId,
      image_type: 'step',
      step_index: stepIndex,
      storage_url: publicUrl,
    });
    if (imgError && !imgError.message?.includes('duplicate')) {
      console.warn(`[SpiceStrong] Step ${stepIndex} image record insert failed:`, imgError.message);
    }

    try {
      await adminUpsertRecipeImage(recipeId, 'step', publicUrl, stepIndex);
    } catch (error) {
      console.warn('[SpiceStrong] Admin step image metadata update failed:', error);
    }

    console.log(`[SpiceStrong] Step ${stepIndex} image uploaded: ${recipeId} -> ${publicUrl}`);
    return publicUrl;
  } catch (e) {
    console.warn(`[SpiceStrong] Step ${stepIndex} image upload failed:`, e);
    return null;
  }
}
