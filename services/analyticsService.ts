/**
 * analyticsService.ts — SpiceStrong
 *
 * Lightweight, fire-and-forget feature-usage analytics.
 * Every event is one row in the `analytics_events` Supabase table.
 *
 * Design notes:
 * - `feature` is NOT NULL in the table, so it is ALWAYS supplied (derived from the event name).
 * - Admin device events are dropped so internal testing doesn't pollute the numbers.
 * - Tracking never throws and never blocks the UI — failures are swallowed (warned in __DEV__ only).
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getDeviceId, isAdminDeviceId, isAdminToolsBuild } from './adminService';
import { logFirebaseEvent } from './firebaseAnalytics';
import { supabase } from './supabase';

/**
 * The full event taxonomy. Each event maps to a `feature` bucket so usage can be
 * rolled up per feature in SQL. Add new events here — the compiler enforces a feature.
 */
const EVENT_FEATURE: Record<string, string> = {
  // app lifecycle
  app_open: 'app',
  // core cooking funnel
  protein_selected: 'protein',
  recipe_viewed: 'recipe',
  cooking_started: 'cooking',
  cooking_completed: 'cooking',
  // AI builder
  ai_recipe_generated: 'ai_builder',
  // scanners
  scan_label: 'scan',
  scan_fridge: 'scan',
  scan_menu: 'scan',
  food_order: 'scan',
  scan_food: 'daily_tracker',
  meal_saved: 'daily_tracker',
  // planning & lists
  auto_meal_plan_generated: 'meal_plan',
  pantry_opened: 'pantry',
  grocery_opened: 'grocery',
  // body scan
  body_scan_completed: 'body_scan',
  body_scan_photo_rejected: 'body_scan',
  // monetization & feedback
  paywall_viewed: 'paywall',
  feedback_submitted: 'feedback',
};

export type AnalyticsEventName = keyof typeof EVENT_FEATURE;

export interface AnalyticsEventOptions {
  /** Screen the event fired from, e.g. 'CookingModeScreen'. */
  screen?: string;
  /** Recipe involved, when relevant. */
  recipeId?: string;
  /** Protein involved, when relevant. */
  proteinId?: string;
  /** Anything else worth slicing on later (success/fail, counts, source, etc.). */
  metadata?: Record<string, unknown>;
}

const APP_VERSION = Constants.expoConfig?.version ?? 'unknown';

/**
 * Record a single feature-usage event. Fire-and-forget: callers do not need to await.
 */
export async function trackEvent(
  eventName: AnalyticsEventName,
  options: AnalyticsEventOptions = {},
): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    // In Expo Go / dev builds, always track so events can be tested.
    // In production, drop admin device events to keep metrics clean.
    if (!isAdminToolsBuild() && isAdminDeviceId(deviceId)) return;

    const feature = EVENT_FEATURE[eventName] ?? 'other';

    if (__DEV__) {
      console.log(`[SpiceStrong] trackEvent: ${eventName} (device: ...${deviceId.slice(-8)})`);
    }

    // Fire to both Supabase and Firebase in parallel — failures in either are independent
    const [supabaseResult] = await Promise.all([
      supabase.from('analytics_events').insert({
        event_name: eventName,
        feature,
        screen: options.screen ?? null,
        recipe_id: options.recipeId ?? null,
        protein_id: options.proteinId ?? null,
        device_id: deviceId,
        app_version: APP_VERSION,
        platform: Platform.OS,
        metadata: options.metadata ?? {},
      }),
      logFirebaseEvent(eventName, {
        feature,
        screen: options.screen ?? '',
        platform: Platform.OS,
        app_version: APP_VERSION,
      }),
    ]);

    if (supabaseResult.error) {
      console.warn(`[SpiceStrong] Analytics insert failed: ${eventName}`, supabaseResult.error.message);
    }
  } catch (error) {
    console.warn('[SpiceStrong] Analytics unavailable', error);
  }
}

/** Convenience wrapper kept for the existing app-open call site. */
export function trackAppOpen(): Promise<void> {
  return trackEvent('app_open');
}

/**
 * @deprecated Use `trackEvent` instead. Retained so older call sites keep compiling.
 */
export function trackAnalyticsEvent(
  eventName: AnalyticsEventName,
  options?: AnalyticsEventOptions,
): Promise<void> {
  return trackEvent(eventName, options);
}
