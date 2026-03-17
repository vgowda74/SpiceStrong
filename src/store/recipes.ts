import AsyncStorage from '@react-native-async-storage/async-storage';

export const QUANTITY_TIERS = ['2-3 servings', '4-6 servings'] as const;
export type QuantityTier = (typeof QUANTITY_TIERS)[number];

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

/** Get all recipes (saved + built-in) for a given protein. */
export async function getAllRecipesForProtein(proteinId: string): Promise<SavedRecipe[]> {
  const saved = await getRecipes();
  const savedForProtein = saved.filter((r) => r.proteinId === proteinId);
  const builtIn = getBuiltInRecipesForProtein(proteinId);
  // Merge — built-in first, then user-saved (skip duplicates by id)
  const ids = new Set(builtIn.map((r) => r.id));
  const userOnly = savedForProtein.filter((r) => !ids.has(r.id));
  return [...builtIn, ...userOnly];
}

export async function getRecipeById(recipeId: string): Promise<SavedRecipe | null> {
  // Check built-in first
  const builtIn = getBuiltInRecipeById(recipeId);
  if (builtIn) return builtIn;
  const saved = await getRecipes();
  return saved.find((r) => r.id === recipeId) ?? null;
}

/** Completion stats helper — used by CookingModeScreen. */
export function getCompletionStats(recipe: SavedRecipe): {
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
} {
  // Try to get full nutrition from built-in recipe
  const builtIn = BUILTIN_RECIPES.find((r) => r.id === recipe.id);
  if (builtIn?.nutrition) {
    const n = builtIn.nutrition;
    return {
      proteinG: n.proteinG,
      calories: n.calories,
      carbsG: n.carbsG,
      fatG: n.fatG,
      fiberG: n.fiberG,
      sugarG: n.sugarG,
      sodiumMg: n.sodiumMg,
      cholesterolMg: n.cholesterolMg ?? 0,
      saturatedFatG: n.saturatedFatG ?? 0,
      ironMg: n.ironMg ?? 0,
      calciumMg: n.calciumMg ?? 0,
      servings: 1,
    };
  }
  // Try AI-generated nutrition data
  if (recipe.aiNutrition) {
    const a = recipe.aiNutrition;
    return {
      proteinG: a.proteinG,
      calories: a.calories,
      carbsG: a.carbsG,
      fatG: a.fatG,
      fiberG: a.fiberG,
      sugarG: a.sugarG,
      sodiumMg: a.sodiumMg,
      cholesterolMg: 0,
      saturatedFatG: 0,
      ironMg: 0,
      calciumMg: 0,
      servings: 1,
    };
  }
  // Fallback: parse from description text
  const desc = recipe.chefTip || recipe.description || '';
  const proteinMatch = desc.match(/(\d+)g?\s*protein/i);
  const calMatch = desc.match(/(\d+)\s*kcal/i);
  return {
    proteinG: proteinMatch ? parseInt(proteinMatch[1], 10) : 0,
    calories: calMatch ? parseInt(calMatch[1], 10) : 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    sugarG: 0,
    sodiumMg: 0,
    cholesterolMg: 0,
    saturatedFatG: 0,
    ironMg: 0,
    calciumMg: 0,
    servings: 1,
  };
}
