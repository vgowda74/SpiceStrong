/**
 * ingredientInfoService.ts — SpiceStrong
 *
 * Caches ingredient education info locally (AsyncStorage) and globally (Supabase).
 * Lookup chain: Local cache → Supabase → Claude API → cache everywhere.
 * Cost: ~$0.003 per unique ingredient, $0 for repeats forever.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { invokeAnthropicMessages } from './anthropicService';

const LOCAL_CACHE_PREFIX = 'spicestrong_ingredient_info_';

/**
 * Get ingredient info with 3-tier caching:
 * 1. Local AsyncStorage (instant, device-only)
 * 2. Supabase (fast, shared across all users)
 * 3. Claude API (slow, costs money — only on first-ever lookup)
 */
export async function getIngredientInfo(name: string): Promise<string> {
  const key = name.toLowerCase().trim();
  if (!key) return 'No ingredient specified.';

  // 1. Check local cache
  try {
    const local = await AsyncStorage.getItem(`${LOCAL_CACHE_PREFIX}${key}`);
    if (local) {
      console.log(`[SpiceStrong] Ingredient info cache hit (local): ${key}`);
      return local;
    }
  } catch {}

  // 2. Check Supabase
  try {
    const { data, error } = await supabase
      .from('ingredient_info')
      .select('info_text')
      .eq('name', key)
      .maybeSingle();

    if (!error && data?.info_text) {
      console.log(`[SpiceStrong] Ingredient info cache hit (supabase): ${key}`);
      // Save to local cache for next time
      await AsyncStorage.setItem(`${LOCAL_CACHE_PREFIX}${key}`, data.info_text).catch(() => {});
      return data.info_text;
    }
  } catch (e) {
    console.log('[SpiceStrong] Supabase ingredient lookup failed (non-blocking):', e);
  }

  // 3. Call Claude API
  console.log(`[SpiceStrong] Ingredient info cache miss — calling API: ${key}`);

  const prompt = `You are a brutally honest fitness nutritionist. Give the real truth about "${name}" — no sugarcoating. Use emojis for visual appeal.

PROTEIN TIER SYSTEM:
- S-Tier (Supreme): Highest protein, very low fat/calories, highly bioavailable. Examples: chicken breast, turkey breast, tuna in water, whey isolate, egg whites, tilapia, cod.
- A-Tier (Excellent): Very high quality, slightly less lean. Examples: lean ground beef 93/7, shrimp/prawns, non-fat Greek yogurt, white fish, cottage cheese, tofu, tempeh, paneer.
- B-Tier (Good): Good protein but more fat or lower density. Examples: whole eggs, salmon, lean pork tenderloin, lamb, edamame, lentils.
- C-Tier (Average): Protein with significant fats/carbs. Examples: protein bars, ground beef 80/20, beans, cheese, quinoa, hummus.
- D-Tier (Low): Perceived as protein but primarily fat. Examples: peanut butter, nuts, sausage, bacon, cream cheese, granola.
- F-Tier (Skip): Low protein, high fat/sugar, avoid. Examples: hot dogs, fried chicken, chicken nuggets, processed meat, junk food.

If this is junk food, processed food, sugary drinks — say so directly. Be blunt about the damage.
If this is a whole food, be enthusiastic and educational.

Include ALL of these:
- Nutrition per 100g (calories, protein, carbs, fat, sugar, fiber)
- Protein Quality Tier (S/A/B/C/D/F) with calories needed for 25g protein
- Honest verdict: helping or hurting fitness goals?
- If healthy: surprising benefit + best food pairings for nutrient absorption
- If unhealthy: what damage it does + what to replace it with
- Storage tip (skip for junk food)
- One fun fact

Keep it under 250 words. Be the honest friend, not the polite nutritionist.`;

  let infoText: string;
  try {
    const data = await invokeAnthropicMessages({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
    infoText = data.content?.[0]?.text || 'Could not generate info.';
  } catch (err: any) {
    console.error('[SpiceStrong] Ingredient info API error:', err);
    return 'Could not load info. Please try again.';
  }

  // Cache locally
  await AsyncStorage.setItem(`${LOCAL_CACHE_PREFIX}${key}`, infoText).catch(() => {});

  // Cache to Supabase (non-blocking, shared with all users)
  supabase
    .from('ingredient_info')
    .upsert({ name: key, info_text: infoText, created_at: new Date().toISOString() }, { onConflict: 'name' })
    .then(({ error }) => {
      if (error) console.warn('[SpiceStrong] Failed to cache ingredient info to Supabase:', error.message);
      else console.log(`[SpiceStrong] Ingredient info cached to Supabase: ${key}`);
    });

  return infoText;
}
