import AsyncStorage from '@react-native-async-storage/async-storage';

export const QUANTITY_TIERS = ['2-3 servings', '4-6 servings'] as const;
export type QuantityTier = (typeof QUANTITY_TIERS)[number];

/**
 * Default servings per tier.
 * Nutrition is stored as the whole "2-3 servings" batch.
 * "4-6 servings" = 2× the batch (double ingredients = double nutrition).
 * To get per-serving: batchNutrition × tierFactor ÷ SERVINGS_PER_TIER[tier]
 */
export const SERVINGS_PER_TIER: Record<QuantityTier, number> = {
  '2-3 servings': 2.5,
  '4-6 servings': 5,
};

/** Tier multiplier: how many batches of the base "2-3" recipe. */
export const TIER_FACTOR: Record<QuantityTier, number> = {
  '2-3 servings': 1,
  '4-6 servings': 2,
};

/** Meal type for serving logic — desserts use single-serving mode. */
export type MealType = 'breakfast' | 'lunch_dinner' | 'snack_dessert';

/** Dessert/snack meal types that use single-serving (no tier selector). */
export function isDessertRecipe(mealType?: string): boolean {
  return mealType === 'snack_dessert';
}

export type IngredientsByTier = Record<QuantityTier, { name: string; quantity: string }[]>;

/** Grouped ingredients for built-in recipe display. */
export interface IngredientGroup {
  emoji: string;
  category: string;
  items: { name: string; quantity: string }[];
}

/** Optional per-step fields for cooking mode (emoji, timer, tip). */
export interface CookingStep {
  title: string;
  description: string;
  emoji?: string;
  timerMinutes?: number;
  tip?: string;
  ingredientsUsed?: string;
  cookingMethod?: string;
}

export interface SavedRecipe {
  id: string;
  name: string;
  proteinId: string;
  proteinName: string;
  proteinEmoji: string;
  description?: string;
  ingredients: IngredientsByTier;
  steps: CookingStep[];
  chefTip: string;
  createdAt: number;
  mealType?: MealType;
  /** Recipe generation status: 'building' while AI is generating, undefined/'ready' when complete. */
  status?: 'building' | 'ready';
  /** Community-wide cook count from Supabase. */
  communityCookCount?: number;
  /** AI-generated nutrition data (optional). */
  aiNutrition?: {
    calories: number;
    proteinG: number;
    fatG: number;
    carbsG: number;
    fiberG: number;
    sugarG: number;
    sodiumMg: number;
  };
}

function defaultIngredientsByTier(): IngredientsByTier {
  return { '2-3 servings': [], '4-6 servings': [] };
}

function normalizeIngredients(ingredients: unknown): IngredientsByTier {
  const def = defaultIngredientsByTier();
  if (ingredients && typeof ingredients === 'object' && !Array.isArray(ingredients)) {
    const obj = ingredients as Record<string, unknown>;
    // Handle new tier keys
    (QUANTITY_TIERS as readonly string[]).forEach((tier) => {
      if (Array.isArray(obj[tier])) {
        def[tier as QuantityTier] = (obj[tier] as { name: string; quantity: string }[]).map(
          (item) =>
            item && typeof item === 'object' && 'name' in item
              ? { name: String(item.name ?? ''), quantity: String(item.quantity ?? '') }
              : { name: '', quantity: '' }
        );
      }
    });
    // Migrate legacy '1lb' data to '2-3 servings' if new tier is empty
    if (def['2-3 servings'].length === 0 && Array.isArray(obj['1lb'])) {
      def['2-3 servings'] = (obj['1lb'] as { name: string; quantity: string }[]).map(
        (item) =>
          item && typeof item === 'object' && 'name' in item
            ? { name: String(item.name ?? ''), quantity: String(item.quantity ?? '') }
            : { name: '', quantity: '' }
      );
    }
    return def;
  }
  if (Array.isArray(ingredients)) {
    def['2-3 servings'] = ingredients.map((item: unknown) =>
      item && typeof item === 'object' && item !== null && 'name' in (item as object)
        ? {
            name: String((item as { name?: string }).name ?? ''),
            quantity: String((item as { quantity?: string }).quantity ?? ''),
          }
        : { name: '', quantity: '' }
    );
    return def;
  }
  return def;
}

const KEY = 'spicestrong_recipes';

export async function getRecipes(): Promise<SavedRecipe[]> {
  try {
    const data = await AsyncStorage.getItem(KEY);
    const raw: unknown[] = data ? JSON.parse(data) : [];
    return raw.map((r: unknown) => {
      const recipe = r as Record<string, unknown>;
      return {
        ...recipe,
        ingredients: normalizeIngredients(recipe.ingredients),
      } as SavedRecipe;
    });
  } catch {
    return [];
  }
}

export async function saveRecipe(recipe: SavedRecipe): Promise<void> {
  try {
    const existing = await getRecipes();
    const index = existing.findIndex((r) => r.id === recipe.id);
    const updated = index >= 0
      ? [...existing.slice(0, index), { ...recipe, ingredients: recipe.ingredients }, ...existing.slice(index + 1)]
      : [...existing, recipe];
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save recipe', e);
  }
}

// Re-export built-in data from the dedicated module.
import {
  BUILTIN_RECIPES,
  BUILTIN_INGREDIENT_GROUPS as _BUILTIN_GROUPS,
  getBuiltInRecipeById as _getBuiltIn,
  getBuiltInRecipesForProtein,
} from '../data/builtInRecipes';

export const BUILTIN_INGREDIENT_GROUPS = _BUILTIN_GROUPS;
export { getBuiltInRecipesForProtein };

export function getBuiltInRecipeById(recipeId: string): SavedRecipe | null {
  return _getBuiltIn(recipeId);
}

/** Get all recipes for a given protein.
 *  Delegates to recipeService for Supabase-backed stale-while-revalidate fetching.
 *  Returns cached/built-in data immediately; Supabase refresh happens in background.
 */
export async function getAllRecipesForProtein(proteinId: string): Promise<SavedRecipe[]> {
  try {
    const { fetchRecipesByProtein } = await import('../../services/recipeService');
    const { recipes } = await fetchRecipesByProtein(proteinId);
    return recipes;
  } catch {
    // Fallback to local-only if recipeService fails to load
    const saved = await getRecipes();
    const savedForProtein = saved.filter((r) => r.proteinId === proteinId);
    const builtIn = getBuiltInRecipesForProtein(proteinId);
    const ids = new Set(builtIn.map((r) => r.id));
    const userOnly = savedForProtein.filter((r) => !ids.has(r.id));
    return [...builtIn, ...userOnly];
  }
}

/**
 * Get all recipes for a protein with stale-while-revalidate support.
 * Returns cached data + a refresh promise that resolves when Supabase data is ready.
 */
export async function getAllRecipesForProteinWithRefresh(proteinId: string): Promise<{
  recipes: SavedRecipe[];
  refresh: Promise<SavedRecipe[] | null>;
}> {
  try {
    const { fetchRecipesByProtein } = await import('../../services/recipeService');
    return await fetchRecipesByProtein(proteinId);
  } catch {
    const recipes = await getAllRecipesForProtein(proteinId);
    return { recipes, refresh: Promise.resolve(null) };
  }
}

export async function getRecipeById(recipeId: string): Promise<SavedRecipe | null> {
  try {
    const { fetchRecipeById } = await import('../../services/recipeService');
    return await fetchRecipeById(recipeId);
  } catch {
    // Fallback to local-only
    const builtIn = getBuiltInRecipeById(recipeId);
    if (builtIn) return builtIn;
    const saved = await getRecipes();
    return saved.find((r) => r.id === recipeId) ?? null;
  }
}

/**
 * Completion stats helper — used by CookingModeScreen.
 *
 * Nutrition is stored as the whole "2-3 servings" batch.
 * This function returns PER-SERVING values for the selected tier:
 *   perServing = batchValue × tierFactor ÷ servingsInTier
 *
 * @param recipe   The recipe with nutrition data
 * @param tier     Selected serving tier (default: '2-3 servings')
 */
export function getCompletionStats(recipe: SavedRecipe, tier: QuantityTier = '2-3 servings'): {
  proteinG: number;
  calories: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  cholesterolMg: number;
  saturatedFatG: number;
  ironMg: number;
  calciumMg: number;
  servings: number;
  batchCalories: number;
  batchProteinG: number;
} {
  const factor = TIER_FACTOR[tier];
  const servings = SERVINGS_PER_TIER[tier];

  // Helper: convert batch nutrition to per-serving for the selected tier
  const perServing = (batchVal: number) => Math.round(batchVal * factor / servings);

  // Try to get full nutrition from built-in recipe
  const builtIn = BUILTIN_RECIPES.find((r) => r.id === recipe.id);
  if (builtIn?.nutrition) {
    const n = builtIn.nutrition;
    return {
      proteinG: perServing(n.proteinG),
      calories: perServing(n.calories),
      carbsG: perServing(n.carbsG),
      fatG: perServing(n.fatG),
      fiberG: perServing(n.fiberG),
      sugarG: perServing(n.sugarG),
      sodiumMg: perServing(n.sodiumMg),
      cholesterolMg: perServing(n.cholesterolMg ?? 0),
      saturatedFatG: perServing(n.saturatedFatG ?? 0),
      ironMg: perServing(n.ironMg ?? 0),
      calciumMg: perServing(n.calciumMg ?? 0),
      servings,
      batchCalories: n.calories * factor,
      batchProteinG: n.proteinG * factor,
    };
  }
  // Try AI-generated nutrition data
  if (recipe.aiNutrition) {
    const a = recipe.aiNutrition;
    return {
      proteinG: perServing(a.proteinG),
      calories: perServing(a.calories),
      carbsG: perServing(a.carbsG),
      fatG: perServing(a.fatG),
      fiberG: perServing(a.fiberG),
      sugarG: perServing(a.sugarG),
      sodiumMg: perServing(a.sodiumMg),
      cholesterolMg: 0,
      saturatedFatG: 0,
      ironMg: 0,
      calciumMg: 0,
      servings,
      batchCalories: a.calories * factor,
      batchProteinG: a.proteinG * factor,
    };
  }
  // Fallback: parse from description text (treat as batch values)
  const desc = recipe.chefTip || recipe.description || '';
  const proteinMatch = desc.match(/(\d+)g?\s*protein/i);
  const calMatch = desc.match(/(\d+)\s*kcal/i);
  const batchProtein = proteinMatch ? parseInt(proteinMatch[1], 10) : 0;
  const batchCal = calMatch ? parseInt(calMatch[1], 10) : 0;
  return {
    proteinG: perServing(batchProtein),
    calories: perServing(batchCal),
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    sugarG: 0,
    sodiumMg: 0,
    cholesterolMg: 0,
    saturatedFatG: 0,
    ironMg: 0,
    calciumMg: 0,
    servings,
    batchCalories: batchCal * factor,
    batchProteinG: batchProtein * factor,
  };
}
