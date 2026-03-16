import AsyncStorage from '@react-native-async-storage/async-storage';

const RATINGS_KEY = 'spicestrong_ratings';
const FAVOURITES_KEY = 'spicestrong_favourites';
const COOK_COUNT_KEY = 'spicestrong_cook_counts';

/** Ratings: recipeId (string) -> 1-5 stars */
export type RatingsMap = Record<string, number>;

export async function getRatings(): Promise<RatingsMap> {
  try {
    const data = await AsyncStorage.getItem(RATINGS_KEY);
    if (!data) return {};
    const parsed = JSON.parse(data);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function setRating(recipeId: string, stars: number): Promise<void> {
  const ratings = await getRatings();
  const next = { ...ratings, [recipeId]: Math.max(1, Math.min(5, stars)) };
  await AsyncStorage.setItem(RATINGS_KEY, JSON.stringify(next));
}

export async function getFavourites(): Promise<string[]> {
  try {
    const data = await AsyncStorage.getItem(FAVOURITES_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function setFavourites(recipeIds: string[]): Promise<void> {
  await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify(recipeIds));
}

/** Cook counts: recipeId -> number of times cooked */
export type CookCountMap = Record<string, number>;

export async function getCookCounts(): Promise<CookCountMap> {
  try {
    const data = await AsyncStorage.getItem(COOK_COUNT_KEY);
    if (!data) return {};
    const parsed = JSON.parse(data);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Increment cook count for a recipe. Returns the new count. */
export async function incrementCookCount(recipeId: string): Promise<number> {
  const counts = await getCookCounts();
  const newCount = (counts[recipeId] ?? 0) + 1;
  const next = { ...counts, [recipeId]: newCount };
  await AsyncStorage.setItem(COOK_COUNT_KEY, JSON.stringify(next));
  return newCount;
}

/** Toggle favourite for recipeId. Returns new state: true if now favourited. */
export async function toggleFavourite(recipeId: string): Promise<boolean> {
  const list = await getFavourites();
  const idx = list.indexOf(recipeId);
  const next = idx >= 0 ? list.filter((_, i) => i !== idx) : [...list, recipeId];
  await setFavourites(next);
  return idx < 0;
}
