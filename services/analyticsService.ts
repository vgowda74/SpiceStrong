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
import { getDeviceId, isAdminDeviceId } from './adminService';
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
  // planning & lists
  auto_meal_plan_generated: 'meal_plan',
  pantry_opened: 'pantry',
  grocery_opened: 'grocery',
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
    if (isAdminDeviceId(deviceId)) return;

    const feature = EVENT_FEATURE[eventName] ?? 'other';

    const { error } = await supabase.from('analytics_events').insert({
      event_name: eventName,
      feature,
      screen: options.screen ?? null,
      recipe_id: options.recipeId ?? null,
      protein_id: options.proteinId ?? null,
      device_id: deviceId,
      app_version: APP_VERSION,
      platform: Platform.OS,
      metadata: options.metadata ?? {},
    });

    if (error && __DEV__) {
      console.warn(`[SpiceStrong] Analytics event failed: ${eventName}`, error.message);
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[SpiceStrong] Analytics unavailable', error);
    }
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
