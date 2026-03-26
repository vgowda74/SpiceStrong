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
 * Filter a list of recipes by the user's saved dietary restrictions.
 * A recipe passes if it does NOT contain any allergen the user wants to avoid
 * and — if dietary tags are set — it has at least one matching dietary tag.
 */
export function applyDietaryFilter<T extends {
  allergenTags?: string[];
  dietaryTags?: string[];
}>(recipes: T[], restrictions: DietaryRestrictions): T[] {
  const { dietaryTags, allergenTags } = restrictions;
  if (dietaryTags.length === 0 && allergenTags.length === 0) return recipes;

  return recipes.filter((recipe) => {
    // Block if any required allergen-free tag is missing
    if (allergenTags.length > 0) {
      const recipeAllergens = recipe.allergenTags ?? [];
      const missingTag = allergenTags.some((tag) => !recipeAllergens.includes(tag));
      if (missingTag) return false;
    }
    // If dietary preferences set, recipe must match at least one
    if (dietaryTags.length > 0) {
      const recipeDietary = recipe.dietaryTags ?? [];
      const hasMatch = dietaryTags.some((tag) => recipeDietary.includes(tag));
      if (!hasMatch) return false;
    }
    return true;
  });
}
