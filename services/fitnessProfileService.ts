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
  let calories: number;
  switch (profile.goal) {
    case 'fat_loss':
      calories = Math.round(tdee - 500); // 500 cal deficit
      break;
    case 'muscle_gain':
      calories = Math.round(tdee + 300); // 300 cal surplus
      break;
    case 'recomposition':
      calories = Math.round(tdee - 200); // slight deficit
      break;
    case 'maintenance':
    default:
      calories = tdee;
  }

  // Macro splits based on goal (protein-focused for SpiceStrong)
  let proteinPct: number, carbsPct: number, fatPct: number;
  switch (profile.goal) {
    case 'fat_loss':
      proteinPct = 0.40; carbsPct = 0.30; fatPct = 0.30;
      break;
    case 'muscle_gain':
      proteinPct = 0.35; carbsPct = 0.40; fatPct = 0.25;
      break;
    case 'recomposition':
      proteinPct = 0.40; carbsPct = 0.35; fatPct = 0.25;
      break;
    case 'maintenance':
    default:
      proteinPct = 0.30; carbsPct = 0.40; fatPct = 0.30;
  }

  // Protein: 4 cal/g, Carbs: 4 cal/g, Fat: 9 cal/g
  const proteinG = Math.round((calories * proteinPct) / 4);
  const carbsG = Math.round((calories * carbsPct) / 4);
  const fatG = Math.round((calories * fatPct) / 9);

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

export async function saveFitnessProfile(profile: FitnessProfile): Promise<void> {
  profile.updatedAt = Date.now();
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
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
