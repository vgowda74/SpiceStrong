/**
 * firebaseAnalytics.ts — SpiceStrong
 *
 * Thin wrapper around Firebase Analytics (@react-native-firebase/analytics).
 * Purpose: install/open conversion tracking for Google Ads App campaigns.
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
  if (isExpoGo) return; // Firebase native module isn't present in Expo Go
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
 * Log a custom Firebase event (for richer Google Ads conversions later,
 * e.g. sign-up or purchase). No-ops in Expo Go.
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
