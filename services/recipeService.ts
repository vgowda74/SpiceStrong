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

// ─── Cache Constants ───
const CACHE_KEY_PREFIX = 'spicestrong_recipe_cache_';
const CACHE_META_PREFIX = 'spicestrong_recipe_cache_meta_';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const PENDING_SYNC_KEY = 'spicestrong_pending_sync';
const IMAGE_CACHE_KEY_PREFIX = 'spicestrong_recipe_img_urls_';
const DEVICE_ID_KEY = 'spicestrong_device_id';

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
  source: 'curated' | 'ai';
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
    aiNutrition: aiNutrition,
    communityCookCount: row.cook_count ?? 0,

    // BuiltInRecipe extended fields
    timeMinutes: row.time_minutes ?? undefined,
    difficulty,
    proteinPer100g: row.protein_per_100g ? Number(row.protein_per_100g) : undefined,
    gradient: gradient as readonly [string, string] | undefined,
    nutrition,
    caloriesPerServing: nutrition?.calories,
    proteinGPerServing: nutrition?.proteinG,
  };
}

// ─── Cache Helpers ───

async function getCachedRecipes(proteinId: string): Promise<SavedRecipe[] | null> {
  try {
    const data = await AsyncStorage.getItem(`${CACHE_KEY_PREFIX}${proteinId}`);
    if (!data) return null;
    return JSON.parse(data) as SavedRecipe[];
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
    const { lastFetched } = JSON.parse(meta);
    return Date.now() - lastFetched > CACHE_TTL_MS;
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
    return JSON.parse(data) as RecipeImageUrls;
  } catch {
    return null;
  }
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
  // 1. Get cached recipes (or built-in + local fallback)
  const cached = await getCachedRecipes(proteinId);
  const localRecipes = await getLocalRecipes();
  const localForProtein = localRecipes.filter((r) => r.proteinId === proteinId);
  const builtIn = getBuiltInRecipesForProtein(proteinId);

  // Merge: cached Supabase recipes + local-only AI recipes
  let immediate: SavedRecipe[];
  if (cached && cached.length > 0) {
    const cachedIds = new Set(cached.map((r) => r.id));
    // Add any local AI recipes not in the cache (offline-created, not yet synced)
    const localOnly = localForProtein.filter((r) => !cachedIds.has(r.id));
    immediate = [...cached, ...localOnly];
  } else {
    // No cache — use built-in + local
    const builtInIds = new Set(builtIn.map((r) => r.id));
    const localOnly = localForProtein.filter((r) => !builtInIds.has(r.id));
    immediate = [...builtIn, ...localOnly];
  }

  // 2. Always revalidate in background (true stale-while-revalidate)
  const refresh: Promise<SavedRecipe[] | null> = (async () => {
        try {
          const isAvailable = await checkRecipeTableAvailable();
          if (!isAvailable) return null;

          const { data, error } = await supabase
            .from('recipes')
            .select('*, recipe_images(*)')
            .eq('protein_id', proteinId)
            .eq('is_active', true)
            .order('created_at', { ascending: true });

          if (error || !data) return null;

          const supabaseRecipes = (data as SupabaseRecipeRow[]).map(mapSupabaseRowToRecipe);

          // Cache image URLs for each recipe
          for (const row of data as SupabaseRecipeRow[]) {
            const urls = extractImageUrls(row.recipe_images);
            await cacheImageUrls(row.id, urls);
          }

          // Merge with local-only AI recipes
          const supabaseIds = new Set(supabaseRecipes.map((r) => r.id));
          const localOnlyAI = localForProtein.filter((r) => !supabaseIds.has(r.id));
          const merged = [...supabaseRecipes, ...localOnlyAI];

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
  // 1. Check built-in first (always available offline)
  const builtIn = getBuiltInRecipeById(recipeId);
  if (builtIn) return builtIn;

  // 2. Check local AsyncStorage
  const localRecipes = await getLocalRecipes();
  const local = localRecipes.find((r) => r.id === recipeId);
  if (local) return local;

  // 3. Check all caches
  try {
    for (const protein of ['chicken', 'paneer', 'eggs', 'lamb', 'goat', 'pork', 'fish', 'prawns', 'tofu', 'soy', 'beans', 'milk', 'whey']) {
      const cached = await getCachedRecipes(protein);
      if (cached) {
        const found = cached.find((r) => r.id === recipeId);
        if (found) return found;
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
        const urls = extractImageUrls((data as SupabaseRecipeRow).recipe_images);
        await cacheImageUrls(recipeId, urls);
        return recipe;
      }
    }
  } catch { /* fallback */ }

  return null;
}

/**
 * Save an AI-generated recipe to both AsyncStorage (immediate) and Supabase (background).
 * If Supabase upsert fails, recipe ID is added to pending sync list.
 *
 * @param recipe - The recipe to save
 * @param overrideDuplicate - If true, allows saving even if a duplicate fingerprint exists
 * @returns RecipeSyncResult — check `.duplicate` to show user-facing message
 */
export async function saveAIRecipe(
  recipe: SavedRecipe,
  overrideDuplicate = false
): Promise<RecipeSyncResult> {
  // 1. Save locally — immediate, offline-safe
  await localSaveRecipe(recipe);

  // 2. Sync to Supabase — check for duplicates
  try {
    const result = await syncRecipeToSupabase(recipe, overrideDuplicate);
    if (result.duplicate) {
      return result; // Caller decides whether to show UI and retry with override
    }
    return { success: true };
  } catch {
    // Network error — mark as pending sync
    addToPendingSync(recipe.id).catch(() => {});
    return { success: true }; // Local save succeeded, sync will retry later
  }
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

  const deviceId = await getDeviceId();

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
    source: 'ai' as const,
    is_active: true,
    is_pro: false,
    status: recipe.status ?? 'ready',
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
    const pending: string[] = data ? JSON.parse(data) : [];
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
    const pending: string[] = JSON.parse(data);
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
    const isAvailable = await checkRecipeTableAvailable();
    if (!isAvailable) return;

    const { data, error } = await supabase
      .from('recipes')
      .select('*, recipe_images(*)')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

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
    await supabase.from('recipe_images').upsert(
      {
        recipe_id: recipeId,
        image_type: 'hero',
        step_index: null,
        storage_url: publicUrl,
      },
      { onConflict: 'recipe_id,image_type,step_index' },
    );

    console.log(`[SpiceStrong] Hero image uploaded: ${recipeId} -> ${publicUrl}`);
    return publicUrl;
  } catch (e) {
    console.warn('[SpiceStrong] Hero image upload failed:', e);
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
export async function deleteAIRecipe(recipeId: string, proteinId: string): Promise<boolean> {
  try {
    // 1. Remove from local AsyncStorage
    const data = await AsyncStorage.getItem('spicestrong_recipes');
    if (data) {
      const all = JSON.parse(data) as Array<{ id: string }>;
      const updated = all.filter((r) => r.id !== recipeId);
      await AsyncStorage.setItem('spicestrong_recipes', JSON.stringify(updated));
    }

    // 2. Remove from per-protein recipe cache
    const cached = await getCachedRecipes(proteinId);
    if (cached) {
      const updatedCache = cached.filter((r) => r.id !== recipeId);
      await setCachedRecipes(proteinId, updatedCache);
    }

    // 3. Remove image URL cache
    await AsyncStorage.removeItem(`${IMAGE_CACHE_KEY_PREFIX}${recipeId}`);

    // 4. Deactivate in Supabase (soft delete — set is_active = false)
    try {
      const isAvailable = await checkRecipeTableAvailable();
      if (isAvailable) {
        await supabase
          .from('recipes')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', recipeId);
        console.log(`[SpiceStrong] Recipe deactivated in Supabase: ${recipeId}`);
      }
    } catch {
      // Supabase deletion is best-effort; local deletion already succeeded
      console.warn(`[SpiceStrong] Could not deactivate recipe in Supabase: ${recipeId}`);
    }

    console.log(`[SpiceStrong] Recipe fully deleted: ${recipeId}`);
    return true;
  } catch (e) {
    console.error('[SpiceStrong] Recipe deletion failed:', e);
    return false;
  }
}

// ─── Classification System Prompt ───
// Mirrors scripts/pipeline/classifyRecipe.js — keep in sync
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
 * This runs client-side using the EXPO_PUBLIC_ANTHROPIC_KEY that's already
 * available for the AI recipe builder.
 *
 * @param recipe - The saved recipe to classify
 * @returns true if classification succeeded, false otherwise
 */
export async function classifyAndEnrichRecipe(recipe: SavedRecipe): Promise<boolean> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
  if (!apiKey) {
    console.warn('[SpiceStrong] No EXPO_PUBLIC_ANTHROPIC_KEY — skipping classification');
    return false;
  }

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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: CLASSIFICATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SpiceStrong] Classification API error (${response.status}):`, errorText);
      return false;
    }

    const data = await response.json();
    let rawText = (data.content?.[0]?.text ?? '').trim();

    // Strip markdown fences if present
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      rawText = rawText.substring(firstBrace, lastBrace + 1);
    }

    const classification = JSON.parse(rawText);

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
  status: 'building' | 'ready',
): Promise<void> {
  try {
    const isAvailable = await checkRecipeTableAvailable();
    if (!isAvailable) return;

    await supabase
      .from('recipes')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', recipeId);
  } catch {
    // non-critical
  }
}
