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
