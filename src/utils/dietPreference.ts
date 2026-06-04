import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROTEINS, type ProteinCategory } from '../theme';
import type { SavedRecipe } from '../store/recipes';

export type DietPreference = 'veg' | 'nonveg';

export const DIET_PREFERENCE_KEY = 'spicestrong_diet_preference';

export const NON_VEG_PROTEIN_IDS = [
  'chicken',
  'fish',
  'lamb',
  'goat',
  'pork',
  'beef',
  'prawns',
  'eggs',
] as const;

export const VEG_PROTEIN_IDS = [
  'paneer',
  'tofu',
  'soy',
  'beans',
  'milk',
  'whey',
] as const;

const NON_VEG_KEYWORDS = [
  'chicken',
  'turkey',
  'duck',
  'fish',
  'seafood',
  'salmon',
  'tuna',
  'cod',
  'tilapia',
  'prawn',
  'shrimp',
  'crab',
  'lobster',
  'lamb',
  'mutton',
  'goat',
  'pork',
  'bacon',
  'beef',
  'steak',
  'meat',
  'egg',
];

/**
 * Diet classification for a packaged product / scanned label.
 * `unknown` is used when ingredients are ambiguous (e.g. "natural flavors",
 * mono- & diglycerides) — we never guess "vegan" without evidence.
 */
export type DietType = 'vegan' | 'vegetarian' | 'non-vegetarian' | 'unknown';

/**
 * Phrases that CONTAIN a non-veg keyword but are actually vegetarian/vegan.
 * Checked before keyword matching so the hard block never rejects a legit veg item
 * (e.g. "eggplant" contains "egg", "goat cheese" contains "goat").
 */
const VEG_OVERRIDE_TERMS = [
  'eggplant', 'egg plant',
  'meatless', 'meat-free', 'meat free', 'meat substitute', 'meat alternative',
  'mock meat', 'soy meat', 'plant meat', 'plant-based meat', 'plant based meat',
  'beyond meat', 'impossible meat', 'wheat meat',
  'vegan', 'vegetarian', 'veggie',
  'crabapple', 'crab apple',
  'beefsteak tomato', 'beef tomato',
  'goat cheese', 'goat milk', 'goat curd', 'goat yogurt', 'goat butter',
  "lamb's lettuce", 'lambs lettuce', "lamb's quarter", 'lambs quarter',
  'fishless', 'fish-free', 'fish free',
];

/**
 * Whether a SINGLE ingredient/product name looks non-vegetarian.
 * Used for the hard block when adding to pantry/grocery as a veg user.
 * Errs toward catching non-veg items, but protects known veg false-positives above.
 */
export function isNonVegIngredientName(name?: string | null): boolean {
  if (!name) return false;
  const lower = name.toLowerCase().trim();
  if (!lower) return false;
  if (VEG_OVERRIDE_TERMS.some((term) => lower.includes(term))) return false;
  return NON_VEG_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/** Normalize a raw diet string (e.g. from the label scanner AI) into a DietType. */
export function normalizeDietType(raw?: string | null): DietType {
  const v = (raw ?? '').toLowerCase().trim();
  if (v === 'vegan') return 'vegan';
  if (v === 'vegetarian' || v === 'veg') return 'vegetarian';
  if (v === 'non-vegetarian' || v === 'nonveg' || v === 'non-veg' || v === 'non vegetarian') {
    return 'non-vegetarian';
  }
  return 'unknown';
}

export function isNonVegProteinId(proteinId?: string | null): boolean {
  return !!proteinId && NON_VEG_PROTEIN_IDS.includes(proteinId as typeof NON_VEG_PROTEIN_IDS[number]);
}

export function isVegProteinId(proteinId?: string | null): boolean {
  return !!proteinId && VEG_PROTEIN_IDS.includes(proteinId as typeof VEG_PROTEIN_IDS[number]);
}

export function getProteinCategory(proteinId?: string | null): ProteinCategory | null {
  if (!proteinId) return null;
  return PROTEINS.find((p) => p.id === proteinId)?.category ?? null;
}

export function getAllowedProteinIds(preference: DietPreference | null | undefined): string[] {
  return PROTEINS
    .filter((protein) => preference !== 'veg' || protein.category === 'VEG')
    .map((protein) => protein.id);
}

export function filterProteinsForPreference<T extends { category: ProteinCategory }>(
  proteins: T[],
  preference: DietPreference | null | undefined,
): T[] {
  if (preference !== 'veg') return proteins;
  return proteins.filter((protein) => protein.category === 'VEG');
}

export function hasNonVegText(text: string): boolean {
  const lower = text.toLowerCase();
  return NON_VEG_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function isNonVegRecipe(recipe: Pick<SavedRecipe, 'proteinId' | 'name' | 'proteinName' | 'ingredients'>): boolean {
  if (isNonVegProteinId(recipe.proteinId)) return true;
  if (hasNonVegText(`${recipe.name} ${recipe.proteinName}`)) return true;

  const ingredientNames = [
    ...(recipe.ingredients?.['2-3 servings'] ?? []),
    ...(recipe.ingredients?.['4-6 servings'] ?? []),
  ].map((ingredient) => ingredient.name).join(' ');

  return hasNonVegText(ingredientNames);
}

export function filterRecipesForPreference<T extends SavedRecipe>(
  recipes: T[],
  preference: DietPreference | null | undefined,
): T[] {
  if (preference !== 'veg') return recipes;
  return recipes.filter((recipe) => !isNonVegRecipe(recipe));
}

export async function getDietPreference(): Promise<DietPreference | null> {
  try {
    const value = await AsyncStorage.getItem(DIET_PREFERENCE_KEY);
    return value === 'veg' || value === 'nonveg' ? value : null;
  } catch {
    return null;
  }
}

export async function setDietPreference(preference: DietPreference): Promise<void> {
  await AsyncStorage.setItem(DIET_PREFERENCE_KEY, preference);
}

export async function shouldHideNonVeg(): Promise<boolean> {
  return (await getDietPreference()) === 'veg';
}
