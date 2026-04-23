/**
 * proteinTiers.ts — SpiceStrong
 *
 * Protein Source Quality Tier System
 *
 * S-Tier (Supreme): Highest protein, very low fat/calories, highly bioavailable
 * A-Tier (Excellent): Very high quality, slightly less lean or convenient
 * B-Tier (Good): Good protein but more fat or lower density
 * C-Tier (Average): Protein with significant fats/carbs or lower quality
 * D-Tier (Low): Perceived as high protein but primarily fat or low-density
 * F-Tier (Skip): Low protein, high fat/sugar, low nutritional value
 */

export type ProteinTier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface TierInfo {
  tier: ProteinTier;
  label: string;
  color: string;
  emoji: string;
  description: string;
}

export const TIER_CONFIG: Record<ProteinTier, TierInfo> = {
  S: { tier: 'S', label: 'Supreme', color: '#22C55E', emoji: '🏆', description: 'Highest protein, very low fat/calories, highly bioavailable' },
  A: { tier: 'A', label: 'Excellent', color: '#4ADE80', emoji: '🥇', description: 'Very high quality, slightly less lean than S-tier' },
  B: { tier: 'B', label: 'Good', color: '#FACC15', emoji: '🥈', description: 'Good protein but with more fat or lower density' },
  C: { tier: 'C', label: 'Average', color: '#F97316', emoji: '🥉', description: 'Protein with significant fats or carbs' },
  D: { tier: 'D', label: 'Low', color: '#EF4444', emoji: '⚠️', description: 'Perceived as protein but primarily fat or low-density' },
  F: { tier: 'F', label: 'Skip', color: '#DC2626', emoji: '🚫', description: 'Low protein, high fat/sugar, avoid for fitness goals' },
};

// ── Food → Tier mapping ──
// Keys are lowercase, partial matching supported
const TIER_MAP: Record<string, ProteinTier> = {
  // S-Tier: Supreme
  'chicken breast': 'S',
  'turkey breast': 'S',
  'turkey': 'S',
  'tuna': 'S',
  'canned tuna': 'S',
  'tuna in water': 'S',
  'whey protein isolate': 'S',
  'whey isolate': 'S',
  'egg whites': 'S',
  'egg white': 'S',
  'tilapia': 'S',
  'cod': 'S',
  'bison': 'S',
  'venison': 'S',

  // A-Tier: Excellent
  'lean ground beef': 'A',
  'ground beef 93': 'A',
  'ground beef 95': 'A',
  'shrimp': 'A',
  'prawns': 'A',
  'prawn': 'A',
  'greek yogurt': 'A',
  'nonfat greek yogurt': 'A',
  'white fish': 'A',
  'sea bass': 'A',
  'halibut': 'A',
  'chicken thigh': 'A',
  'lean chicken': 'A',
  'whey protein': 'A',
  'whey': 'A',
  'protein powder': 'A',
  'casein': 'A',
  'tofu': 'A',
  'firm tofu': 'A',
  'tempeh': 'A',
  'paneer': 'A',
  'cottage cheese': 'A',
  'skyr': 'A',

  // B-Tier: Good
  'whole eggs': 'B',
  'eggs': 'B',
  'egg': 'B',
  'salmon': 'B',
  'lean pork': 'B',
  'pork tenderloin': 'B',
  'pork loin': 'B',
  'lamb': 'B',
  'lean lamb': 'B',
  'goat': 'B',
  'goat meat': 'B',
  'beef': 'B',
  'steak': 'B',
  'sirloin': 'B',
  'flank steak': 'B',
  'milk': 'B',
  'skim milk': 'B',
  'yogurt': 'B',
  'edamame': 'B',
  'soy chunks': 'B',
  'chickpeas': 'B',
  'lentils': 'B',
  'dal': 'B',

  // C-Tier: Average
  'protein bar': 'C',
  'ground beef': 'C',
  'ground beef 80': 'C',
  'chicken thighs': 'C',
  'dark meat': 'C',
  'beans': 'C',
  'black beans': 'C',
  'kidney beans': 'C',
  'rajma': 'C',
  'pork': 'C',
  'pork chop': 'C',
  'cheese': 'C',
  'cheddar': 'C',
  'mozzarella': 'C',
  'quinoa': 'C',
  'hummus': 'C',

  // D-Tier: Low
  'peanut butter': 'D',
  'peanuts': 'D',
  'almonds': 'D',
  'cashews': 'D',
  'walnuts': 'D',
  'nuts': 'D',
  'mixed nuts': 'D',
  'sausage': 'D',
  'bacon': 'D',
  'salami': 'D',
  'pepperoni': 'D',
  'full fat milk': 'D',
  'cream': 'D',
  'cream cheese': 'D',
  'granola': 'D',

  // F-Tier: Skip
  'hot dog': 'F',
  'hot dogs': 'F',
  'fried chicken': 'F',
  'breaded chicken': 'F',
  'chicken nuggets': 'F',
  'chicken fingers': 'F',
  'corn dog': 'F',
  'spam': 'F',
  'bologna': 'F',
  'processed meat': 'F',
  'coke': 'F',
  'soda': 'F',
  'cola': 'F',
  'candy': 'F',
  'chips': 'F',
  'fries': 'F',
  'french fries': 'F',
  'pizza': 'F',
  'ice cream': 'F',
  'donut': 'F',
  'cake': 'F',
  'cookies': 'F',
  'chocolate bar': 'F',
};

/**
 * Get protein tier for a food item.
 * Checks exact match, then partial match.
 * Returns null if no match found (unknown food).
 */
export function getProteinTier(foodName: string): TierInfo | null {
  const lower = foodName.toLowerCase().trim();

  // Exact match
  if (TIER_MAP[lower]) return TIER_CONFIG[TIER_MAP[lower]];

  // Partial match — check if any key is in the food name
  for (const [key, tier] of Object.entries(TIER_MAP)) {
    if (lower.includes(key)) return TIER_CONFIG[tier];
  }

  // Reverse — check if food name is in any key
  for (const [key, tier] of Object.entries(TIER_MAP)) {
    if (key.includes(lower) && lower.length >= 3) return TIER_CONFIG[tier];
  }

  return null;
}

/**
 * Calculate tier from nutrition values (fallback when food not in lookup).
 * Uses calories per 25g protein as the metric.
 */
export function calculateTierFromNutrition(proteinG: number, calories: number): TierInfo {
  if (proteinG <= 0 || calories <= 0) return TIER_CONFIG['F'];

  const calPer25g = (25 / proteinG) * calories;

  if (calPer25g <= 150) return TIER_CONFIG['S'];
  if (calPer25g <= 250) return TIER_CONFIG['A'];
  if (calPer25g <= 350) return TIER_CONFIG['B'];
  if (calPer25g <= 600) return TIER_CONFIG['C'];
  if (calPer25g <= 900) return TIER_CONFIG['D'];
  return TIER_CONFIG['F'];
}

/**
 * Get tier for a scanned product — tries name lookup first, falls back to nutrition calculation.
 */
export function getProductTier(productName: string, proteinG: number, calories: number): TierInfo {
  const nameTier = getProteinTier(productName);
  if (nameTier) return nameTier;
  return calculateTierFromNutrition(proteinG, calories);
}
