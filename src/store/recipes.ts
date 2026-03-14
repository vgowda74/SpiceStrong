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

/** Built-in ingredient groups keyed by recipe ID. Currently empty — hero recipes will be added later. */
export const BUILTIN_INGREDIENT_GROUPS: Partial<Record<string, IngredientGroup[]>> = {};

/** Built-in recipes array. Currently empty — hero recipes will be added later. */
const BUILTIN_RECIPES: SavedRecipe[] = [];

export function getBuiltInRecipeById(recipeId: string): SavedRecipe | null {
  return BUILTIN_RECIPES.find((r) => r.id === recipeId) ?? null;
}

export async function getRecipeById(recipeId: string): Promise<SavedRecipe | null> {
  const saved = await getRecipes();
  const found = saved.find((r) => r.id === recipeId);
  if (found) return found;
  return getBuiltInRecipeById(recipeId);
}

/** Completion stats helper — used by CookingModeScreen. */
export function getCompletionStats(recipe: SavedRecipe): {
  proteinG: number;
  calories: number;
  cookTimeMin: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  servings: number;
} {
  const desc = recipe.chefTip || recipe.description || '';
  const proteinMatch = desc.match(/(\d+)g?\s*protein/i);
  const calMatch = desc.match(/(\d+)\s*kcal/i);
  const timeMatch = desc.match(/(\d+)m?\s*cook/i);
  return {
    proteinG: proteinMatch ? parseInt(proteinMatch[1], 10) : 0,
    calories: calMatch ? parseInt(calMatch[1], 10) : 0,
    cookTimeMin: timeMatch ? parseInt(timeMatch[1], 10) : recipe.steps.reduce((a, s) => a + (s.timerMinutes ?? 0), 0),
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    servings: 1,
  };
}
