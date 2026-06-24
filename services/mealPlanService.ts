/**
 * mealPlanService.ts — SpiceStrong
 * Manages the user's meal plan in Supabase with AsyncStorage fallback.
 *
 * Slot limits per day:
 *   breakfast:     1
 *   lunch_dinner:  2
 *   snack_dessert: 2
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const LOCAL_KEY_PREFIX = 'spicestrong_mealplan_';
const DEVICE_ID_KEY = 'spicestrong_device_id';

export type MealSlot = 'breakfast' | 'lunch_dinner' | 'snack_dessert' | 'others';

export const SLOT_LIMITS: Record<MealSlot, number> = {
  breakfast: 1,
  lunch_dinner: 2,
  snack_dessert: 1,
  others: 10,
};

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch_dinner: 'Lunch / Dinner',
  snack_dessert: 'Snack / Dessert',
  others: 'Others',
};

export interface MealPlanEntry {
  id: string;          // uuid
  date: string;        // ISO date string YYYY-MM-DD
  slot: MealSlot;
  recipeId: string;
  recipeName: string;
  proteinName: string;
  proteinEmoji: string;
  mealType?: string;
  servingCount?: number; // exact serving count for autoplan (e.g., 2)
}

async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function localKey(date: string): string {
  return `${LOCAL_KEY_PREFIX}${date}`;
}

/** Load all meal plan entries for a specific date. */
export async function getMealPlanForDate(date: string): Promise<MealPlanEntry[]> {
  try {
    const deviceId = await getDeviceId();
    const { data, error } = await supabase
      .from('meal_plan')
      .select('*')
      .eq('device_id', deviceId)
      .eq('date', date)
      .order('created_at', { ascending: true });

    if (!error && data) {
      const entries: MealPlanEntry[] = data.map((row) => ({
        id: row.id,
        date: row.date,
        slot: row.slot as MealSlot,
        recipeId: row.recipe_id,
        recipeName: row.recipe_name,
        proteinName: row.protein_name,
        proteinEmoji: row.protein_emoji,
        mealType: row.meal_type,
      }));
      await AsyncStorage.setItem(localKey(date), JSON.stringify(entries));
      return entries;
    }
  } catch {}

  // Fallback: local cache
  try {
    const stored = await AsyncStorage.getItem(localKey(date));
    if (stored) {
      let data;
      try { data = JSON.parse(stored); } catch { console.warn('[SpiceStrong] Corrupted meal plan data for', date, '— using fallback'); data = []; }
      return data;
    }
  } catch {}
  return [];
}

/** Load meal plan entries for a range of dates (for calendar preview). */
export async function getMealPlanForMonth(year: number, month: number): Promise<Record<string, MealPlanEntry[]>> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  try {
    const deviceId = await getDeviceId();
    const { data, error } = await supabase
      .from('meal_plan')
      .select('*')
      .eq('device_id', deviceId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (!error && data) {
      const byDate: Record<string, MealPlanEntry[]> = {};
      data.forEach((row) => {
        const entry: MealPlanEntry = {
          id: row.id,
          date: row.date,
          slot: row.slot as MealSlot,
          recipeId: row.recipe_id,
          recipeName: row.recipe_name,
          proteinName: row.protein_name,
          proteinEmoji: row.protein_emoji,
          mealType: row.meal_type,
        };
        if (!byDate[row.date]) byDate[row.date] = [];
        byDate[row.date].push(entry);
      });
      return byDate;
    }
  } catch {}
  return {};
}

/** Add a recipe to the meal plan. Returns error string if slot is full. */
export async function addToMealPlan(
  date: string,
  slot: MealSlot,
  recipe: { id: string; name: string; proteinName: string; proteinEmoji: string; mealType?: string; servingCount?: number }
): Promise<{ success: boolean; entryId?: string; error?: string }> {
  // Check slot capacity
  const existing = await getMealPlanForDate(date);
  const slotEntries = existing.filter((e) => e.slot === slot);
  if (slotEntries.length >= SLOT_LIMITS[slot]) {
    const label = SLOT_LABELS[slot];
    const limit = SLOT_LIMITS[slot];
    return {
      success: false,
      error: `${label} already has ${limit} recipe${limit > 1 ? 's' : ''} planned for this day.`,
    };
  }

  // Check for duplicate recipe on same day
  const alreadyAdded = existing.some((e) => e.recipeId === recipe.id);
  if (alreadyAdded) {
    return { success: false, error: 'This recipe is already in your meal plan for this day.' };
  }

  const newEntry: MealPlanEntry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    date,
    slot,
    recipeId: recipe.id,
    recipeName: recipe.name,
    proteinName: recipe.proteinName,
    proteinEmoji: recipe.proteinEmoji,
    mealType: recipe.mealType,
    servingCount: recipe.servingCount,
  };

  // Save locally first
  const updated = [...existing, newEntry];
  await AsyncStorage.setItem(localKey(date), JSON.stringify(updated));

  // Sync to Supabase
  try {
    const deviceId = await getDeviceId();
    await supabase.from('meal_plan').insert({
      id: newEntry.id,
      device_id: deviceId,
      date,
      slot,
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      protein_name: recipe.proteinName,
      protein_emoji: recipe.proteinEmoji,
      meal_type: recipe.mealType ?? null,
    });
  } catch {}

  return { success: true, entryId: newEntry.id };
}

/** Remove a meal plan entry by ID. */
export async function removeFromMealPlan(entryId: string, date: string): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(localKey(date));
    if (stored) {
      let entries: MealPlanEntry[];
      try { entries = JSON.parse(stored); } catch { console.warn('[SpiceStrong] Corrupted meal plan data for', date, '— skipping local update'); return; }
      await AsyncStorage.setItem(
        localKey(date),
        JSON.stringify(entries.filter((e) => e.id !== entryId))
      );
    }
  } catch {}

  try {
    await supabase.from('meal_plan').delete().eq('id', entryId);
  } catch {}
}
