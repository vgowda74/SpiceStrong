/**
 * firebaseAnalytics.ts — SpiceStrong
 *
 * Thin wrapper around Firebase Analytics (@react-native-firebase/analytics).
 * Purpose: install/open conversion tracking for Google Ads App campaigns,
 * plus user properties and screen views for GA4 audience segmentation.
 *
 * - `first_open` is logged automatically by the SDK on the first launch after
 *   install — that is the "download" conversion Google Ads attributes.
 * - We also log `app_open` and enable collection explicitly here.
 * - The native module is unavailable in Expo Go, so we guard + lazy-require it
 *   to avoid crashing the JS-only dev client.
 */

import Constants from 'expo-constants';

const isExpoGo = Constants.appOwnership === 'expo';

/** Enable Firebase Analytics collection and log an app_open event. Safe to call always. */
export async function initFirebaseAnalytics(): Promise<void> {
  if (isExpoGo) return;
  try {
    const analytics = require('@react-native-firebase/analytics').default;
    await analytics().setAnalyticsCollectionEnabled(true);
    await analytics().logAppOpen();
  } catch (error) {
    if (__DEV__) {
      console.warn('[SpiceStrong] Firebase analytics unavailable', error);
    }
  }
}

/**
 * Log a custom Firebase event. No-ops in Expo Go.
 */
export async function logFirebaseEvent(
  name: string,
  params?: Record<string, string | number | boolean>,
): Promise<void> {
  if (isExpoGo) return;
  try {
    const analytics = require('@react-native-firebase/analytics').default;
    await analytics().logEvent(name, params);
  } catch (error) {
    if (__DEV__) {
      console.warn(`[SpiceStrong] Firebase event failed: ${name}`, error);
    }
  }
}

/**
 * Set a stable user ID so GA4 can link events across sessions.
 * Use device ID (not PII) as the identifier.
 */
export async function setFirebaseUserId(deviceId: string): Promise<void> {
  if (isExpoGo) return;
  try {
    const analytics = require('@react-native-firebase/analytics').default;
    await analytics().setUserId(deviceId);
  } catch {}
}

/**
 * Set user-scoped properties for GA4 audience segmentation.
 * These persist across sessions and retroactively apply to all events.
 */
export async function setFirebaseUserProperties(props: {
  fitness_goal?: string;
  dietary_tags?: string;
  subscription?: string;
  platform?: string;
}): Promise<void> {
  if (isExpoGo) return;
  try {
    const analytics = require('@react-native-firebase/analytics').default;
    if (props.fitness_goal)  await analytics().setUserProperty('fitness_goal', props.fitness_goal);
    if (props.dietary_tags)  await analytics().setUserProperty('dietary_tags', props.dietary_tags);
    if (props.subscription)  await analytics().setUserProperty('subscription', props.subscription);
    if (props.platform)      await analytics().setUserProperty('platform', props.platform);
  } catch {}
}

/**
 * Log a screen view — populates GA4's Engagement → Screens and views report
 * and enables navigation funnel analysis.
 */
export async function logScreenView(screenName: string): Promise<void> {
  if (isExpoGo) return;
  try {
    const analytics = require('@react-native-firebase/analytics').default;
    await analytics().logScreenView({ screen_name: screenName, screen_class: screenName });
  } catch {}
}
