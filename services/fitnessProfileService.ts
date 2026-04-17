/**
 * fitnessProfileService.ts — SpiceStrong
 * Stores user fitness profile and calculates daily calorie/macro targets.
 * Uses Mifflin-St Jeor equation for BMR + activity multiplier for TDEE.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = 'spicestrong_fitness_profile';

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

export type FitnessGoal = 'fat_loss' | 'maintenance' | 'muscle_gain' | 'recomposition';
export type Gender = 'male' | 'female' | 'other';
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active';

export interface FitnessProfile {
  goal: FitnessGoal;
  gender: Gender;
  age: number;              // years
  heightCm: number;         // always stored in cm
  weightKg: number;         // always stored in kg
  targetWeightKg?: number;  // optional
  bodyFatPercent?: number;  // optional
  activityLevel: ActivityLevel;
  updatedAt: number;        // timestamp
}

export interface MacroTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  tdee: number;
  bmr: number;
}

// ═══════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extremely_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, { label: string; desc: string }> = {
  sedentary: { label: 'Sedentary', desc: 'Desk job, little to no exercise' },
  lightly_active: { label: 'Lightly Active', desc: '1-3 workouts per week' },
  moderately_active: { label: 'Moderately Active', desc: '3-5 workouts per week' },
  very_active: { label: 'Very Active', desc: '6-7 workouts per week' },
  extremely_active: { label: 'Extremely Active', desc: 'Athlete / physical job + daily training' },
};

export const GOAL_LABELS: Record<FitnessGoal, { label: string; desc: string }> = {
  fat_loss: { label: 'Fat Loss', desc: 'Lose body fat while preserving muscle' },
  maintenance: { label: 'Maintenance', desc: 'Maintain current weight and composition' },
  muscle_gain: { label: 'Muscle Gain', desc: 'Build lean muscle mass' },
  recomposition: { label: 'Body Recomposition', desc: 'Lose fat and gain muscle simultaneously' },
};

// ═══════════════════════════════════════
// CALCULATIONS
// ═══════════════════════════════════════

/**
 * Mifflin-St Jeor BMR equation.
 * Male:   10 × weight(kg) + 6.25 × height(cm) - 5 × age - 5 + 161 (wait, let me get this right)
 * Male:   10 × weight(kg) + 6.25 × height(cm) - 5 × age + 5
 * Female: 10 × weight(kg) + 6.25 × height(cm) - 5 × age - 161
 */
function calculateBMR(profile: FitnessProfile): number {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  if (profile.gender === 'male') return base + 5;
  if (profile.gender === 'female') return base - 161;
  return base - 78; // average for 'other'
}

/**
 * Calculate daily calorie and macro targets based on fitness profile.
 */
export function calculateMacroTargets(profile: FitnessProfile): MacroTargets {
  const bmr = calculateBMR(profile);
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[profile.activityLevel]);

  // Calorie adjustment based on goal
  // Use ~20% deficit for fat loss (scales with body size) instead of flat 500
  let calories: number;
  switch (profile.goal) {
    case 'fat_loss':
      calories = Math.round(tdee * 0.80); // 20% deficit — scales with body size
      break;
    case 'muscle_gain':
      calories = Math.round(tdee * 1.12); // 12% surplus
      break;
    case 'recomposition':
      calories = Math.round(tdee * 0.90); // 10% deficit
      break;
    case 'maintenance':
    default:
      calories = tdee;
  }

  // ── Weight-based protein calculation ──
  // Protein is set by body weight (g/kg), not a flat % of calories.
  // This prevents overshooting for lighter people and undershooting for heavier.
  const weightKg = profile.weightKg;
  let proteinPerKg: number;
  switch (profile.goal) {
    case 'fat_loss':
      proteinPerKg = 2.0;  // preserve muscle during deficit
      break;
    case 'muscle_gain':
      proteinPerKg = 2.2;  // support muscle synthesis
      break;
    case 'recomposition':
      proteinPerKg = 2.0;  // high protein, moderate deficit
      break;
    case 'maintenance':
    default:
      proteinPerKg = 1.6;  // active adult maintenance
  }
  const proteinG = Math.round(weightKg * proteinPerKg);
  const proteinCal = proteinG * 4;

  // ── Fat: minimum healthy amount based on body weight ──
  // ~0.8-1.0 g/kg for hormonal health, especially important for 40+ adults
  const fatPerKg = profile.goal === 'fat_loss' ? 0.8 : 1.0;
  const fatG = Math.round(weightKg * fatPerKg);
  const fatCal = fatG * 9;

  // ── Carbs: fill remaining calories ──
  const carbCal = Math.max(0, calories - proteinCal - fatCal);
  const carbsG = Math.round(carbCal / 4);

  return { calories, proteinG, carbsG, fatG, tdee, bmr };
}

// ═══════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════

export async function getFitnessProfile(): Promise<FitnessProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const BODY_STATS_HISTORY_KEY = 'spicestrong_body_stats_history';

export interface BodyStatsEntry {
  date: string;
  weightKg: number;
  bodyFatPercent?: number;
  timestamp: number;
}

export async function saveFitnessProfile(profile: FitnessProfile): Promise<void> {
  profile.updatedAt = Date.now();
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));

  // Save body stats to history for progress tracking
  try {
    const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
    const entry: BodyStatsEntry = {
      date: today,
      weightKg: profile.weightKg,
      bodyFatPercent: profile.bodyFatPercent,
      timestamp: Date.now(),
    };
    const raw = await AsyncStorage.getItem(BODY_STATS_HISTORY_KEY);
    const history: BodyStatsEntry[] = raw ? JSON.parse(raw) : [];
    // Replace if same date exists, else append
    const existingIdx = history.findIndex((h) => h.date === today);
    if (existingIdx >= 0) history[existingIdx] = entry;
    else history.push(entry);
    // Keep last 365 entries
    const trimmed = history.slice(-365);
    await AsyncStorage.setItem(BODY_STATS_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {}
}

export async function getBodyStatsHistory(): Promise<BodyStatsEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(BODY_STATS_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Get cached macro targets from saved profile.
 * Returns null if no profile is saved.
 */
export async function getSavedMacroTargets(): Promise<MacroTargets | null> {
  const profile = await getFitnessProfile();
  if (!profile) return null;
  return calculateMacroTargets(profile);
}

// ═══════════════════════════════════════
// UNIT CONVERSION HELPERS
// ═══════════════════════════════════════

export function lbsToKg(lbs: number): number { return Math.round(lbs * 0.453592 * 10) / 10; }
export function kgToLbs(kg: number): number { return Math.round(kg * 2.20462 * 10) / 10; }
export function ftInToCm(ft: number, inches: number): number { return Math.round((ft * 30.48 + inches * 2.54) * 10) / 10; }
export function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { ft, inches };
}
