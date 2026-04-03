/**
 * autoMealPlanService.ts — SpiceStrong
 * Auto-generates a 7-day meal plan using library-first matching.
 *
 * Strategy:
 * 1. Score existing recipes against user's calorie/macro targets per meal slot
 * 2. Fill slots from library (free, instant, already has images)
 * 3. For unfilled slots, create placeholder entries with AI-generated hero image
 * 4. Full recipe is generated lazily when user taps the card
 */

import { fetchRecipesByProtein } from './recipeService';
import { applyDietaryFilter, getDietaryRestrictions } from './dietaryService';
import { getPantryIngredientNames } from './pantryService';
import { addToMealPlan, getMealPlanForDate, removeFromMealPlan, SLOT_LIMITS, type MealSlot } from './mealPlanService';
import { getCompletionStats, type SavedRecipe } from '../src/store/recipes';
import { BUILTIN_RECIPES } from '../src/data/builtInRecipes';
import { generateAllRecipeImages, saveRecipeImages } from './imageGenerationService';
import { saveAIRecipe } from './recipeService';

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

export interface AutoPlanPreferences {
  dailyCalories: number;       // e.g. 2000
  dailyProteinG: number;       // e.g. 150
  dailyCarbsG: number;         // e.g. 200
  dailyFatG: number;           // e.g. 65
  slots: MealSlot[];           // which slots to fill per day
  startDate: string;           // YYYY-MM-DD
  samePlanEveryDay: boolean;   // replicate day 1 across all 7 days
  pantryOnly: boolean;         // only use recipes matching pantry items
  servingCount: number;        // exact number of servings (1-6)
}

export interface AutoPlanResult {
  totalFilled: number;
  fromLibrary: number;
  aiGenerated: number;
  errors: string[];
}

// ═══════════════════════════════════════
// CALORIE SPLIT PER SLOT
// ═══════════════════════════════════════

const SLOT_CALORIE_SPLIT: Record<MealSlot, number> = {
  breakfast: 0.25,
  lunch_dinner: 0.30,      // each lunch/dinner gets 30%
  snack_dessert: 0.15,
};

function getSlotTargets(prefs: AutoPlanPreferences) {
  return prefs.slots.map((slot) => {
    const split = SLOT_CALORIE_SPLIT[slot] || 0.25;
    return {
      slot,
      targetCal: Math.round(prefs.dailyCalories * split),
      targetProtein: Math.round(prefs.dailyProteinG * split),
      targetCarbs: Math.round(prefs.dailyCarbsG * split),
      targetFat: Math.round(prefs.dailyFatG * split),
    };
  });
}

// ═══════════════════════════════════════
// RECIPE SCORING
// ═══════════════════════════════════════

function scoreRecipeForSlot(
  recipe: SavedRecipe,
  targetCal: number,
  targetProtein: number,
  targetCarbs: number,
  targetFat: number,
  pantryNames: string[],
  pantryOnly: boolean,
): number {
  const stats = getCompletionStats(recipe, '2-3 servings');
  if (stats.calories === 0) return 0;

  // Pantry ingredient match
  let pantryScore = 0;
  const recipeIngs = (recipe.ingredients?.['2-3 servings'] ?? []).map((i) => i.name.toLowerCase());
  if (pantryNames.length > 0 && recipeIngs.length > 0) {
    const matched = recipeIngs.filter((ing) =>
      pantryNames.some((pn) => ing.includes(pn) || pn.includes(ing))
    );
    pantryScore = matched.length / recipeIngs.length;
  }

  // If pantryOnly and less than 50% match, reject
  if (pantryOnly && pantryScore < 0.5) return 0;

  // Calorie proximity (±20% is ideal)
  const calDiff = Math.abs(stats.calories - targetCal) / Math.max(targetCal, 1);
  const calScore = Math.max(0, 1 - calDiff);

  // Protein proximity
  const protDiff = Math.abs(stats.proteinG - targetProtein) / Math.max(targetProtein, 1);
  const protScore = Math.max(0, 1 - protDiff);

  // Carbs proximity
  const carbDiff = Math.abs(stats.carbsG - targetCarbs) / Math.max(targetCarbs, 1);
  const carbScore = Math.max(0, 1 - carbDiff);

  // Fat proximity
  const fatDiff = Math.abs(stats.fatG - targetFat) / Math.max(targetFat, 1);
  const fatScore = Math.max(0, 1 - fatDiff);

  // Weighted: cal 25%, protein 35%, carbs 15%, fat 10%, pantry 15%
  return calScore * 0.25 + protScore * 0.35 + carbScore * 0.15 + fatScore * 0.10 + pantryScore * 0.15;
}

// ═══════════════════════════════════════
// LIBRARY RECIPE FETCHING
// ═══════════════════════════════════════

const ALL_PROTEIN_IDS = [
  'chicken', 'eggs', 'paneer', 'lamb', 'goat', 'fish', 'prawns',
  'pork', 'tofu', 'soy', 'beans', 'milk', 'whey', 'beef',
];

async function getAllRecipes(): Promise<SavedRecipe[]> {
  const all: SavedRecipe[] = [];
  const seen = new Set<string>();

  // Built-in first (instant)
  for (const r of BUILTIN_RECIPES) {
    if (!seen.has(r.id)) { all.push(r); seen.add(r.id); }
  }

  // Fetch from Supabase for all proteins
  const fetches = ALL_PROTEIN_IDS.map(async (pid) => {
    try {
      const { recipes } = await fetchRecipesByProtein(pid);
      return recipes;
    } catch { return []; }
  });

  const results = await Promise.all(fetches);
  for (const recipes of results) {
    for (const r of recipes) {
      if (!seen.has(r.id)) { all.push(r); seen.add(r.id); }
    }
  }

  return all;
}

// ═══════════════════════════════════════
// PLACEHOLDER RECIPE FOR AI GENERATION
// ═══════════════════════════════════════

function createPlaceholderRecipe(slot: MealSlot, targetCal: number, targetProtein: number, targetCarbs: number, targetFat: number): SavedRecipe {
  const slotNames: Record<MealSlot, string> = {
    breakfast: 'High-Protein Breakfast',
    lunch_dinner: 'High-Protein Meal',
    snack_dessert: 'Protein Snack',
  };

  const id = `autoplan_${slot}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  return {
    id,
    name: slotNames[slot],
    proteinId: 'chicken',
    proteinName: 'Auto Plan',
    proteinEmoji: '🍽',
    description: `Auto-planned meal (~${targetCal} cal, ~${targetProtein}g protein). Tap to generate full recipe.`,
    ingredients: { '2-3 servings': [], '4-6 servings': [] },
    steps: [],
    chefTip: '',
    createdAt: Date.now(),
    mealType: slot,
    status: 'building',
    source: 'ai',
    // Store target macros as batch values (×2.5 so getCompletionStats divides back to per-serving)
    aiNutrition: {
      calories: Math.round(targetCal * 2.5),
      proteinG: Math.round(targetProtein * 2.5),
      carbsG: Math.round(targetCarbs * 2.5),
      fatG: Math.round(targetFat * 2.5),
      fiberG: 0,
      sugarG: 0,
      sodiumMg: 0,
    },
  };
}

// ═══════════════════════════════════════
// MAIN: GENERATE AUTO MEAL PLAN
// ═══════════════════════════════════════

export async function generateAutoMealPlan(
  prefs: AutoPlanPreferences,
  onProgress?: (msg: string) => void,
): Promise<AutoPlanResult> {
  const result: AutoPlanResult = { totalFilled: 0, fromLibrary: 0, aiGenerated: 0, errors: [] };

  try {
    onProgress?.('Loading your recipes...');
    const [allRecipes, dietary, pantryNames] = await Promise.all([
      getAllRecipes(),
      getDietaryRestrictions(),
      getPantryIngredientNames(),
    ]);

    // Apply dietary filter
    const eligible = applyDietaryFilter(allRecipes, dietary);
    console.log(`[SpiceStrong] Auto plan: ${eligible.length} eligible recipes`);

    const slotTargets = getSlotTargets(prefs);

    // Day 1 picks — reused for all 7 days when samePlanEveryDay is true
    let day1Picks: { slot: MealSlot; recipeId: string; recipeName: string; proteinName: string; proteinEmoji: string; mealType?: string; isPlaceholder: boolean }[] = [];

    // Generate for 7 days
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const d = new Date(prefs.startDate);
      d.setDate(d.getDate() + dayOffset);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];

      onProgress?.(`Planning ${dayName}...`);

      // Clear existing entries for this day
      const existing = await getMealPlanForDate(dateStr);
      for (const entry of existing) {
        await removeFromMealPlan(entry.id, entry.date);
      }

      // If same plan every day and we already have day 1 picks, replicate
      if (prefs.samePlanEveryDay && dayOffset > 0 && day1Picks.length > 0) {
        for (const pick of day1Picks) {
          const addResult = await addToMealPlan(dateStr, pick.slot, {
            id: pick.recipeId,
            name: pick.recipeName,
            proteinName: pick.proteinName,
            proteinEmoji: pick.proteinEmoji,
            mealType: pick.mealType,
            servingCount: prefs.servingCount,
          });
          if (addResult.success) {
            result.totalFilled++;
            if (pick.isPlaceholder) result.aiGenerated++;
            else result.fromLibrary++;
          }
        }
        continue;
      }

      // Track used recipe IDs this week to avoid repeats (only when different each day)
      const usedThisWeek = new Set<string>();

      for (const { slot, targetCal, targetProtein, targetCarbs, targetFat } of slotTargets) {
        // Score all eligible recipes for this slot
        const slotRecipes = eligible
          .filter((r) => {
            if (slot === 'breakfast' && r.mealType && r.mealType !== 'breakfast') return false;
            if (slot === 'snack_dessert' && r.mealType && r.mealType !== 'snack_dessert') return false;
            return true;
          })
          .filter((r) => !usedThisWeek.has(r.id))
          .map((r) => ({
            recipe: r,
            score: scoreRecipeForSlot(r, targetCal, targetProtein, targetCarbs, targetFat, pantryNames, prefs.pantryOnly),
          }))
          .filter((r) => r.score > 0) // Remove zero-scored (pantryOnly rejects)
          .sort((a, b) => b.score - a.score);

        const bestMatch = slotRecipes[0];

        if (bestMatch && bestMatch.score > 0.4) {
          const r = bestMatch.recipe;
          const addResult = await addToMealPlan(dateStr, slot, {
            id: r.id,
            name: r.name,
            proteinName: r.proteinName,
            proteinEmoji: r.proteinEmoji,
            mealType: r.mealType,
            servingCount: prefs.servingCount,
          });
          if (addResult.success) {
            result.fromLibrary++;
            result.totalFilled++;
            usedThisWeek.add(r.id);
            if (dayOffset === 0) day1Picks.push({ slot, recipeId: r.id, recipeName: r.name, proteinName: r.proteinName, proteinEmoji: r.proteinEmoji, mealType: r.mealType, isPlaceholder: false });
          }
        } else {
          // Create placeholder — hero image only, full recipe generated on tap
          const placeholder = createPlaceholderRecipe(slot, targetCal, targetProtein, targetCarbs, targetFat);

          try {
            // Generate hero image only
            onProgress?.(`Creating image for ${dayName} ${slot === 'breakfast' ? 'breakfast' : slot === 'snack_dessert' ? 'snack' : 'meal'}...`);
            const images = await generateAllRecipeImages({
              id: placeholder.id,
              name: placeholder.name,
              ingredients: placeholder.ingredients,
              steps: [], // No steps yet — hero only
            });
            await saveRecipeImages(placeholder.id, { dishImage: images.dishImage, ingredientImages: {}, stepImages: {} });
          } catch (imgErr) {
            console.warn('[SpiceStrong] Auto plan image generation failed:', imgErr);
          }

          // Save placeholder locally
          await saveAIRecipe(placeholder);

          const addResult = await addToMealPlan(dateStr, slot, {
            id: placeholder.id,
            name: placeholder.name,
            proteinName: placeholder.proteinName,
            proteinEmoji: placeholder.proteinEmoji,
            mealType: placeholder.mealType,
            servingCount: prefs.servingCount,
          });
          if (addResult.success) {
            result.aiGenerated++;
            result.totalFilled++;
            if (dayOffset === 0) day1Picks.push({ slot, recipeId: placeholder.id, recipeName: placeholder.name, proteinName: placeholder.proteinName, proteinEmoji: placeholder.proteinEmoji, mealType: placeholder.mealType, isPlaceholder: true });
          }
        }
      }
    }

    onProgress?.('Meal plan ready!');
    console.log(`[SpiceStrong] Auto plan complete: ${result.totalFilled} filled (${result.fromLibrary} library, ${result.aiGenerated} AI)`);
  } catch (err: any) {
    console.error('[SpiceStrong] Auto plan failed:', err);
    result.errors.push(err?.message ?? 'Unknown error');
  }

  return result;
}
