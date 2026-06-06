/**
 * supabase.ts — SpiceStrong
 * Supabase client for community ratings, reviews, and future features.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('SpiceStrong: Supabase credentials not set. Community ratings will use fallback data.');
}
if (__DEV__) console.log(`[SpiceStrong] Supabase URL: ${SUPABASE_URL?.slice(0, 30)}...`);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export { SUPABASE_ANON_KEY, SUPABASE_URL };
