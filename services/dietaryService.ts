/**
 * dietaryService.ts — SpiceStrong
 * Persists user dietary restrictions to Supabase (keyed by device ID).
 * Falls back to AsyncStorage when Supabase is unavailable.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const LOCAL_KEY = 'spicestrong_dietary_restrictions';
const DEVICE_ID_KEY = 'spicestrong_device_id';

export interface DietaryRestrictions {
  dietaryTags: string[];   // e.g. "Keto", "Low carb"
  allergenTags: string[];  // e.g. "Gluten free", "Vegan"
}

async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export async function getDietaryRestrictions(): Promise<DietaryRestrictions> {
  try {
    const deviceId = await getDeviceId();
    const { data, error } = await supabase
      .from('user_dietary_restrictions')
      .select('dietary_tags, allergen_tags')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (!error && data) {
      const result = {
        dietaryTags: Array.isArray(data.dietary_tags) ? data.dietary_tags : [],
        allergenTags: Array.isArray(data.allergen_tags) ? data.allergen_tags : [],
      };
      // Keep local cache in sync
      await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(result));
      return result;
    }
  } catch {
    // Fall through to local cache
  }

  // Fallback: local AsyncStorage
  try {
    const stored = await AsyncStorage.getItem(LOCAL_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}

  return { dietaryTags: [], allergenTags: [] };
}

export async function saveDietaryRestrictions(restrictions: DietaryRestrictions): Promise<void> {
  // Always save locally first for instant reads
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(restrictions));

  try {
    const deviceId = await getDeviceId();
    await supabase
      .from('user_dietary_restrictions')
      .upsert({
        device_id: deviceId,
        dietary_tags: restrictions.dietaryTags,
        allergen_tags: restrictions.allergenTags,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'device_id' });
  } catch {
    // Local save already done; Supabase sync will happen on next load
  }
}

/**
 * Ingredient keywords that, if found in a recipe's ingredients, EXCLUDE it
 * for each lifestyle/allergen restriction. Matched as whole words, case-insensitive.
 * This is the authoritative check — stored tags on Supabase can be wrong.
 */
const BLOCKED_INGREDIENT_KEYWORDS: Record<string, string[]> = {
  Vegetarian: [
    'chicken', 'beef', 'pork', 'lamb', 'mutton', 'fish', 'prawn', 'shrimp',
    'crab', 'lobster', 'salmon', 'tuna', 'sardine', 'anchovy', 'bacon',
    'turkey', 'duck', 'goat', 'veal', 'mince', 'seafood', 'gelatin',
    'egg', 'eggs',
  ],
  Vegan: [
    'chicken', 'beef', 'pork', 'lamb', 'mutton', 'fish', 'prawn', 'shrimp',
    'crab', 'lobster', 'salmon', 'tuna', 'sardine', 'anchovy', 'bacon',
    'turkey', 'duck', 'goat', 'veal', 'mince', 'seafood', 'gelatin',
    'egg', 'eggs', 'milk', 'cream', 'butter', 'cheese', 'yogurt', 'yoghurt',
    'whey', 'casein', 'honey', 'ghee', 'paneer', 'curd',
  ],
  'Egg free': ['egg', 'eggs', 'mayonnaise', 'mayo'],
  'Gluten free': [
    'wheat', 'pasta', 'noodles', 'barley', 'rye', 'seitan',
    'breadcrumb', 'bread crumb', 'soy sauce', 'teriyaki sauce',
  ],
  'Dairy free': [
    'milk', 'cream', 'butter', 'cheese', 'yogurt', 'yoghurt',
    'ghee', 'paneer', 'curd', 'whey', 'casein',
  ],
  'Nut free': [
    'almond', 'cashew', 'walnut', 'peanut', 'pistachio', 'pecan',
    'hazelnut', 'macadamia', 'pine nut',
  ],
  'Soy free': ['soy sauce', 'soybean', 'tofu', 'edamame', 'tempeh', 'miso'],
  'Shellfish free': [
    'shrimp', 'prawn', 'crab', 'lobster', 'oyster', 'clam', 'scallop', 'mussel',
  ],
  Paleo: [
    'oat', 'oats', 'rice', 'corn', 'bean', 'lentil', 'peanut',
    'soy sauce', 'tofu', 'milk', 'cream', 'butter', 'cheese', 'yogurt',
    'paneer', 'ghee', 'sugar', 'bread', 'pasta',
  ],
  Whole30: [
    'oat', 'oats', 'rice', 'corn', 'bean', 'lentil', 'peanut',
    'soy sauce', 'tofu', 'milk', 'cream', 'butter', 'cheese', 'yogurt',
    'paneer', 'ghee', 'sugar', 'bread', 'pasta', 'alcohol',
  ],
};

/**
 * Nutrition thresholds for dietary goal tags.
 * Applied per-serving. Recipe passes if it meets the condition OR has no nutrition data.
 */
const DIETARY_GOAL_CHECKS: Record<string, (perServing: { calories: number; proteinG: number; fatG: number; carbsG: number; sodiumMg: number; sugarG: number; fiberG: number }) => boolean> = {
  'High protein': (n) => n.proteinG >= 25,
  'Low fat':      (n) => n.fatG < 12,
  'Low carb':     (n) => n.carbsG < 25,
  Keto:           (n) => n.carbsG < 20,
  'Low calorie':  (n) => n.calories < 450,
  'Low sodium':   (n) => n.sodiumMg < 600,
  'Low sugar':    (n) => n.sugarG < 6,
  'High fiber':   (n) => n.fiberG >= 4,
};

function getIngredientNames(recipe: { ingredients?: Record<string, Array<{ name: string }>> }): string[] {
  const tier = (recipe.ingredients ?? {})['2-3 servings'] ?? Object.values(recipe.ingredients ?? {})[0] ?? [];
  return (tier as Array<{ name: string }>).map((i) => i.name.toLowerCase());
}

function ingredientContainsKeyword(ingredientNames: string[], keyword: string): boolean {
  // Escape special regex chars, then match as a whole word
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'i');
  return ingredientNames.some((name) => re.test(name));
}

function getPerServingNutrition(recipe: Record<string, unknown>) {
  // Pipeline nutrition is per-serving already
  if (typeof recipe.pipelineCalories === 'number') {
    return {
      calories: recipe.pipelineCalories,
      proteinG: (recipe.pipelineProteinG as number) ?? 0,
      fatG: (recipe.pipelineFatG as number) ?? 0,
      carbsG: (recipe.pipelineCarbsG as number) ?? 0,
      sodiumMg: 0,
      sugarG: 0,
      fiberG: 0,
    };
  }
  // Built-in nutrition is stored as a 2-3 serving batch (÷2.5 = per serving)
  const n = recipe.nutrition as Record<string, number> | undefined;
  if (n && typeof n.calories === 'number') {
    return {
      calories: n.calories / 2.5,
      proteinG: (n.proteinG ?? 0) / 2.5,
      fatG: (n.fatG ?? 0) / 2.5,
      carbsG: (n.carbsG ?? 0) / 2.5,
      sodiumMg: (n.sodiumMg ?? 0) / 2.5,
      sugarG: (n.sugarG ?? 0) / 2.5,
      fiberG: (n.fiberG ?? 0) / 2.5,
    };
  }
  // AI nutrition — also stored as a batch (÷2.5)
  const ai = recipe.aiNutrition as Record<string, number> | undefined;
  if (ai && typeof ai.calories === 'number') {
    return {
      calories: ai.calories / 2.5,
      proteinG: (ai.proteinG ?? 0) / 2.5,
      fatG: (ai.fatG ?? 0) / 2.5,
      carbsG: (ai.carbsG ?? 0) / 2.5,
      sodiumMg: (ai.sodiumMg ?? 0) / 2.5,
      sugarG: (ai.sugarG ?? 0) / 2.5,
      fiberG: (ai.fiberG ?? 0) / 2.5,
    };
  }
  return null;
}

/**
 * Filter a list of recipes by the user's saved dietary restrictions.
 *
 * - Allergen/lifestyle restrictions (Vegetarian, Vegan, Egg free, etc.) are
 *   checked by scanning ingredient names for blocked keywords. This is more
 *   reliable than stored tags, which can be missing or wrong.
 *
 * - Dietary goal tags (High protein, Low carb, etc.) are checked against
 *   per-serving nutrition when available. If no nutrition data exists the
 *   recipe passes (benefit of the doubt — don't hide valid recipes).
 */
export function applyDietaryFilter<T extends {
  ingredients?: Record<string, Array<{ name: string; quantity: string }>>;
}>(recipes: T[], restrictions: DietaryRestrictions): T[] {
  const { dietaryTags, allergenTags } = restrictions;
  if (dietaryTags.length === 0 && allergenTags.length === 0) return recipes;

  return recipes.filter((recipe) => {
    const ingredientNames = getIngredientNames(recipe as { ingredients?: Record<string, Array<{ name: string }>> });

    // ── Allergen / lifestyle restrictions ──────────────────────────────────
    for (const restriction of allergenTags) {
      const blockedKeywords = BLOCKED_INGREDIENT_KEYWORDS[restriction];
      if (!blockedKeywords) continue; // unknown restriction — skip
      const hasBlockedIngredient = blockedKeywords.some((kw) =>
        ingredientContainsKeyword(ingredientNames, kw)
      );
      if (hasBlockedIngredient) return false;
    }

    // ── Dietary goal tags ──────────────────────────────────────────────────
    if (dietaryTags.length > 0) {
      const nutrition = getPerServingNutrition(recipe as Record<string, unknown>);
      if (nutrition) {
        // Recipe has nutrition data — must satisfy AT LEAST ONE selected goal
        const passesAnyGoal = dietaryTags.some((tag) => {
          const check = DIETARY_GOAL_CHECKS[tag];
          return check ? check(nutrition) : true; // unknown goal → pass
        });
        if (!passesAnyGoal) return false;
      }
      // No nutrition data → pass (don't penalise untagged recipes)
    }

    return true;
  });
}
