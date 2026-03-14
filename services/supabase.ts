/**
 * supabase.ts — SpiceStrong
 * Supabase client for community ratings, reviews, and future features.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('SpiceStrong: Supabase credentials not set. Community ratings will use fallback data.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
