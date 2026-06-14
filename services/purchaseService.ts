/**
 * purchaseService.ts — SpiceStrong
 *
 * RevenueCat integration for IAP subscription management.
 * Handles: initialization, purchase flow, restore, subscription status.
 *
 * Product: com.spicestrong.premium.yearly ($29.99/year)
 *
 * Setup required:
 * 1. App Store Connect: create subscription product
 * 2. RevenueCat: create project, add Apple platform
 * 3. Set EXPO_PUBLIC_REVENUECAT_KEY in .env
 */

import Constants from 'expo-constants';
import type {
  CustomerInfo,
  PurchasesPackage,
} from 'react-native-purchases';

const RC_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_KEY ?? '';
const ENTITLEMENT_ID = 'premium'; // Must match RevenueCat entitlement identifier
let initialized = false;
let unavailableReason: string | null = null;

function isRunningInExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

function getPurchasesModule() {
  const mod = require('react-native-purchases');
  return {
    Purchases: mod.default ?? mod,
    LOG_LEVEL: mod.LOG_LEVEL,
  };
}

/**
 * Initialize RevenueCat. Call once on app startup.
 */
export async function initPurchases(): Promise<void> {
  if (isRunningInExpoGo()) {
    unavailableReason = 'RevenueCat native purchases are disabled in Expo Go. Use a development build for IAP testing.';
    if (__DEV__) console.log(`[SpiceStrong] ${unavailableReason}`);
    return;
  }

  if (initialized || !RC_API_KEY) {
    if (!RC_API_KEY) unavailableReason = 'RevenueCat key not set - IAP disabled';
    if (!RC_API_KEY) console.warn('[SpiceStrong] RevenueCat key not set — IAP disabled');
    return;
  }
  try {
    const { Purchases, LOG_LEVEL } = getPurchasesModule();
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey: RC_API_KEY });
    initialized = true;
    console.log('[SpiceStrong] RevenueCat initialized');
  } catch (e) {
    unavailableReason = e instanceof Error ? e.message : 'RevenueCat init failed';
    console.error('[SpiceStrong] RevenueCat init failed:', e);
  }
}

/**
 * Check if the current user has an active premium subscription.
 */
export async function checkSubscription(): Promise<boolean> {
  if (isRunningInExpoGo()) return false;
  if (!initialized) return false;
  try {
    const { Purchases } = getPurchasesModule();
    const info: CustomerInfo = await Purchases.getCustomerInfo();
    const isPremium = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
    console.log(`[SpiceStrong] Subscription check: ${isPremium ? 'PREMIUM' : 'FREE'}`);
    return isPremium;
  } catch (e) {
    console.error('[SpiceStrong] Subscription check failed:', e);
    return false;
  }
}

/**
 * Get available packages (offerings) for display in the paywall.
 */
export async function getOfferings(): Promise<PurchasesPackage | null> {
  if (isRunningInExpoGo()) return null;
  if (!initialized) return null;
  try {
    const { Purchases } = getPurchasesModule();
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current || !current.availablePackages.length) {
      console.warn('[SpiceStrong] No offerings available');
      return null;
    }
    const annual = current.annual ?? current.availablePackages[0];
    return annual;
  } catch (e) {
    console.error('[SpiceStrong] Get offerings failed:', e);
    return null;
  }
}

/**
 * Get all available packages (annual + monthly).
 */
export async function getAllOfferings(): Promise<{ annual: PurchasesPackage | null; monthly: PurchasesPackage | null }> {
  if (isRunningInExpoGo()) return { annual: null, monthly: null };
  if (!initialized) return { annual: null, monthly: null };
  try {
    const { Purchases } = getPurchasesModule();
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return { annual: null, monthly: null };
    return {
      annual: current.annual ?? null,
      monthly: current.monthly ?? null,
    };
  } catch (e) {
    console.error('[SpiceStrong] Get all offerings failed:', e);
    return { annual: null, monthly: null };
  }
}

/**
 * Purchase the premium subscription.
 * @param plan - 'yearly' or 'monthly'
 * Returns true if purchase succeeded.
 */
export async function purchasePremium(plan: 'yearly' | 'monthly' = 'yearly'): Promise<{ success: boolean; error?: string }> {
  if (isRunningInExpoGo()) return { success: false, error: unavailableReason ?? 'Store not available in Expo Go' };
  if (!initialized) return { success: false, error: unavailableReason ?? 'Store not available' };
  try {
    const { annual, monthly } = await getAllOfferings();
    const pkg = plan === 'monthly' ? (monthly ?? annual) : (annual ?? monthly);
    if (!pkg) return { success: false, error: 'No subscription package available' };

    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

    if (isPremium) {
      console.log('[SpiceStrong] Purchase successful — premium activated');
      return { success: true };
    }
    return { success: false, error: 'Purchase completed but entitlement not found' };
  } catch (e: any) {
    if (e.userCancelled) {
      return { success: false, error: 'cancelled' };
    }
    console.error('[SpiceStrong] Purchase failed:', e);
    return { success: false, error: e.message || 'Purchase failed' };
  }
}

/**
 * Restore previous purchases (e.g., after reinstall or new device).
 */
export async function restorePurchases(): Promise<{ success: boolean; isPremium: boolean }> {
  if (isRunningInExpoGo()) return { success: false, isPremium: false };
  if (!initialized) return { success: false, isPremium: false };
  try {
    const { Purchases } = getPurchasesModule();
    const info: CustomerInfo = await Purchases.restorePurchases();
    const isPremium = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
    console.log(`[SpiceStrong] Restore: ${isPremium ? 'PREMIUM found' : 'no premium'}`);
    return { success: true, isPremium };
  } catch (e) {
    console.error('[SpiceStrong] Restore failed:', e);
    return { success: false, isPremium: false };
  }
}
