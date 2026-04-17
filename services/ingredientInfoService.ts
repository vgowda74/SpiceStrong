/**
 * ingredientInfoService.ts — SpiceStrong
 *
 * Caches ingredient education info locally (AsyncStorage) and globally (Supabase).
 * Lookup chain: Local cache → Supabase → Claude API → cache everywhere.
 * Cost: ~$0.003 per unique ingredient, $0 for repeats forever.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const LOCAL_CACHE_PREFIX = 'spicestrong_ingredient_info_';
const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

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
  const apiKey = ANTHROPIC_KEY;
  if (!apiKey) return 'AI is not configured.';

  console.log(`[SpiceStrong] Ingredient info cache miss — calling API: ${key}`);

  const prompt = `You are a brutally honest fitness nutritionist. Give the real truth about "${name}" — no sugarcoating. Use emojis for visual appeal.

PROTEIN QUALITY FRAMEWORK (use this to rate protein sources):
- Superior (S tier): ~120-180 cal per 25g protein — whey, egg whites, chicken breast, lean fish, Greek yogurt
- High-Efficiency (A tier): ~180-250 cal per 25g — tofu, tempeh, low-fat paneer, chicken thigh
- Moderate (B tier): ~250-350 cal per 25g — whole eggs, skimmed milk
- Low-Efficiency (C/D tier): 400-900 cal per 25g — legumes, nuts, seeds (good for fiber/micros, bad as primary protein)
- No Protein (F tier): Junk food, sugary drinks, processed snacks

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

  // Retry up to 2 times on 529
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (res.status !== 529 || attempt === 2) break;
    await new Promise((r) => setTimeout(r, (attempt + 1) * 3000));
  }

  if (!res!.ok) {
    const errBody = await res!.text().catch(() => '');
    console.error(`[SpiceStrong] Ingredient info API error ${res!.status}:`, errBody);
    return res!.status === 529
      ? 'Server is busy, please try again in a moment.'
      : 'Could not load info. Please try again.';
  }

  const data = await res!.json();
  const infoText = data.content?.[0]?.text || 'Could not generate info.';

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
