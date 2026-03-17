/**
 * ratingsService.ts — SpiceStrong
 * Community ratings service powered by Supabase.
 * Falls back to mock data if Supabase is not configured or tables don't exist yet.
 */

import { supabase } from './supabase';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ───
export interface ReviewItem {
  id: string;
  username: string;
  rating: number;
  comment: string;
  createdAt: string; // ISO date string
}

export interface RecipeRatings {
  averageRating: number;
  totalCount: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  reviews: ReviewItem[];
}

const EMPTY_RATINGS: RecipeRatings = {
  averageRating: 0,
  totalCount: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  reviews: [],
};

// ─── Device ID (anonymous user identifier) ───
const DEVICE_ID_KEY = 'spicestrong_device_id';

async function getDeviceId(): Promise<string> {
  try {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      // Generate a random device ID
      id = `${Platform.OS}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `fallback_${Date.now()}`;
  }
}

// Track whether Supabase tables are available
// Only cache success — failures are retried on every call
let supabaseAvailable = false;

/**
 * Check if Supabase tables exist by attempting a lightweight query.
 * Only caches a successful result so the app recovers automatically
 * if tables are created after the app starts.
 */
async function checkSupabaseAvailable(): Promise<boolean> {
  if (supabaseAvailable) return true;
  try {
    const { error } = await supabase
      .from('ratings')
      .select('id')
      .limit(1);
    if (!error) {
      supabaseAvailable = true;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Fetch community ratings for a recipe.
 * Uses Supabase if available, falls back to mock data.
 */
export async function getRecipeRatings(recipeId: string): Promise<RecipeRatings> {
  const isAvailable = await checkSupabaseAvailable();

  if (!isAvailable) {
    // Fallback to mock data
    return EMPTY_RATINGS;
  }

  try {
    // Fetch rating summary
    const { data: summaryData } = await supabase
      .from('recipe_rating_summary')
      .select('*')
      .eq('recipe_id', recipeId)
      .single();

    // Fetch reviews
    const { data: reviewsData } = await supabase
      .from('reviews')
      .select('*')
      .eq('recipe_id', recipeId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!summaryData) {
      return EMPTY_RATINGS;
    }

    return {
      averageRating: Number(summaryData.average_rating) || 0,
      totalCount: Number(summaryData.total_count) || 0,
      distribution: {
        5: Number(summaryData.five_star) || 0,
        4: Number(summaryData.four_star) || 0,
        3: Number(summaryData.three_star) || 0,
        2: Number(summaryData.two_star) || 0,
        1: Number(summaryData.one_star) || 0,
      },
      reviews: (reviewsData ?? []).map((r) => ({
        id: r.id,
        username: r.username,
        rating: r.stars,
        comment: r.comment,
        createdAt: r.created_at,
      })),
    };
  } catch {
    // If Supabase query fails, fall back to mock
    return EMPTY_RATINGS;
  }
}

/**
 * Submit a rating for a recipe.
 * Uses upsert so each device can only rate once per recipe (updates on re-rate).
 */
export async function submitRating(recipeId: string, stars: number): Promise<boolean> {
  const isAvailable = await checkSupabaseAvailable();
  if (!isAvailable) return false;

  try {
    const deviceId = await getDeviceId();
    const { error } = await supabase
      .from('ratings')
      .upsert(
        {
          recipe_id: recipeId,
          device_id: deviceId,
          stars: Math.max(1, Math.min(5, stars)),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'recipe_id,device_id' }
      );
    return !error;
  } catch {
    return false;
  }
}

/**
 * Submit a review for a recipe.
 * Each device can only leave one review per recipe.
 */
export async function submitReview(
  recipeId: string,
  stars: number,
  comment: string,
  username?: string
): Promise<boolean> {
  const isAvailable = await checkSupabaseAvailable();
  if (!isAvailable) return false;

  try {
    const deviceId = await getDeviceId();
    const displayName = username || `SpiceChef_${Math.floor(Math.random() * 9000 + 1000)}`;

    // Upsert both the review and the rating
    const [reviewResult, ratingResult] = await Promise.all([
      supabase.from('reviews').upsert(
        {
          recipe_id: recipeId,
          device_id: deviceId,
          username: displayName,
          stars: Math.max(1, Math.min(5, stars)),
          comment: comment.slice(0, 500),
        },
        { onConflict: 'recipe_id,device_id' }
      ),
      supabase.from('ratings').upsert(
        {
          recipe_id: recipeId,
          device_id: deviceId,
          stars: Math.max(1, Math.min(5, stars)),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'recipe_id,device_id' }
      ),
    ]);

    return !reviewResult.error && !ratingResult.error;
  } catch {
    return false;
  }
}

// ─── Community Cook Count ───

/**
 * Atomically increment the community cook count for a recipe in Supabase.
 * Uses an RPC function for safe concurrent increments.
 * Returns the new count, or -1 on failure (caller should ignore failures).
 */
export async function submitCookCount(recipeId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('increment_cook_count', {
      p_recipe_id: recipeId,
    });
    if (error) {
      console.warn('[SpiceStrong] submitCookCount failed:', error.message);
      return -1;
    }
    return typeof data === 'number' ? data : -1;
  } catch (e) {
    console.warn('[SpiceStrong] submitCookCount error:', e);
    return -1;
  }
}

/**
 * Format relative time (e.g., "2 days ago", "1 week ago")
 */
export function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
  if (diffMonths === 1) return '1 month ago';
  return `${diffMonths} months ago`;
}
