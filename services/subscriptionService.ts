/**
 * subscriptionService.ts — SpiceStrong
 *
 * Manages freemium limits and premium subscription status.
 * Usage counts stored in AsyncStorage, keyed by feature + month.
 *
 * Free Tier:
 *   - Curated recipes: unlimited (225+ recipes, $0 to serve)
 *   - AI recipes (SpiceBuilder): 5
 *   - Nutrition/menu scans: 10
 *   - Meal plans: 2
 *   - Nutrition IQ reports: 5
 *   - Ingredient info: unlimited (cached, pennies)
 *
 * Premium ($29.99/year):
 *   - AI recipes: 50/year
 *   - Scans: unlimited
 *   - Meal plans: unlimited
 *   - Nutrition IQ: unlimited
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREMIUM_KEY = 'spicestrong_premium_status';
const USAGE_PREFIX = 'spicestrong_usage_';

export type Feature = 'ai_recipe' | 'scan' | 'meal_plan' | 'nutrition_iq';

interface UsageData {
  count: number;
  resetDate: string; // ISO date string — monthly reset for free, yearly for premium
}

// ── Limits ──
const FREE_LIMITS: Record<Feature, number> = {
  ai_recipe: 5,
  scan: 10,
  meal_plan: 2,
  nutrition_iq: 5,
};

const PREMIUM_LIMITS: Record<Feature, number> = {
  ai_recipe: 50,       // per year
  scan: 999999,         // unlimited
  meal_plan: 999999,    // unlimited
  nutrition_iq: 999999, // unlimited
};

const FEATURE_LABELS: Record<Feature, string> = {
  ai_recipe: 'AI Recipes',
  scan: 'Nutrition Scans',
  meal_plan: 'Meal Plans',
  nutrition_iq: 'Nutrition IQ Reports',
};

const FREE_LABEL: Record<Feature, string> = {
  ai_recipe: '5 AI recipes',
  scan: '10 nutrition scans',
  meal_plan: '2 meal plans',
  nutrition_iq: '5 Nutrition IQ reports',
};

// ── Admin bypass — unlimited access for admin devices ──
const ADMIN_DEVICE_IDS = ['ios_1773504689845_bf8ebqh4'];

// ── Premium Status ──

export async function isPremium(): Promise<boolean> {
  // Admin devices always get premium
  try {
    const deviceId = await AsyncStorage.getItem('spicestrong_device_id');
    if (deviceId && ADMIN_DEVICE_IDS.includes(deviceId)) return true;
  } catch {}

  // Check RevenueCat subscription (source of truth for IAP)
  try {
    const { checkSubscription } = require('./purchaseService');
    const rcPremium = await checkSubscription();
    if (rcPremium) return true;
  } catch {}

  // Fallback: check local premium status (for testing / manual grants)
  try {
    const data = await AsyncStorage.getItem(PREMIUM_KEY);
    if (!data) return false;
    const parsed = JSON.parse(data);
    if (parsed.expiresAt && new Date(parsed.expiresAt) > new Date()) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function setPremium(expiresAt: string): Promise<void> {
  await AsyncStorage.setItem(PREMIUM_KEY, JSON.stringify({
    active: true,
    purchasedAt: new Date().toISOString(),
    expiresAt,
  }));
}

// For testing — remove before production
export async function grantPremiumForTesting(): Promise<void> {
  const oneYear = new Date();
  oneYear.setFullYear(oneYear.getFullYear() + 1);
  await setPremium(oneYear.toISOString());
}

export async function revokePremium(): Promise<void> {
  await AsyncStorage.removeItem(PREMIUM_KEY);
}

// ── Usage Tracking ──

function getUsageKey(feature: Feature, premium: boolean): string {
  // Free users reset monthly, premium users reset yearly
  const now = new Date();
  const period = premium
    ? `${now.getFullYear()}`
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `${USAGE_PREFIX}${feature}_${period}`;
}

async function getUsage(feature: Feature, premium: boolean): Promise<UsageData> {
  try {
    const key = getUsageKey(feature, premium);
    const data = await AsyncStorage.getItem(key);
    if (data) return JSON.parse(data);
  } catch {}
  return { count: 0, resetDate: new Date().toISOString() };
}

async function incrementUsage(feature: Feature, premium: boolean): Promise<number> {
  const key = getUsageKey(feature, premium);
  const current = await getUsage(feature, premium);
  current.count += 1;
  await AsyncStorage.setItem(key, JSON.stringify(current));
  return current.count;
}

// ── Public API ──

export interface LimitCheck {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  premium: boolean;
  featureLabel: string;
  freeLabel: string;
}

/**
 * Check if the user can use a feature. Call BEFORE the action.
 */
export async function checkLimit(feature: Feature): Promise<LimitCheck> {
  const premium = await isPremium();
  const limits = premium ? PREMIUM_LIMITS : FREE_LIMITS;
  const limit = limits[feature];
  const usage = await getUsage(feature, premium);

  return {
    allowed: usage.count < limit,
    used: usage.count,
    limit,
    remaining: Math.max(0, limit - usage.count),
    premium,
    featureLabel: FEATURE_LABELS[feature],
    freeLabel: FREE_LABEL[feature],
  };
}

/**
 * Record that the user used a feature. Call AFTER successful action.
 */
export async function recordUsage(feature: Feature): Promise<number> {
  const premium = await isPremium();
  return incrementUsage(feature, premium);
}

/**
 * Get usage summary for all features (for settings/profile screen).
 */
export async function getUsageSummary(): Promise<Record<Feature, LimitCheck>> {
  const features: Feature[] = ['ai_recipe', 'scan', 'meal_plan', 'nutrition_iq'];
  const result: Record<string, LimitCheck> = {};
  for (const f of features) {
    result[f] = await checkLimit(f);
  }
  return result as Record<Feature, LimitCheck>;
}
