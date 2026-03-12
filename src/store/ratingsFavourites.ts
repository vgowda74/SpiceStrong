import AsyncStorage from '@react-native-async-storage/async-storage';

const RATINGS_KEY = 'spicestrong_ratings';
const FAVOURITES_KEY = 'spicestrong_favourites';

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

/** Toggle favourite for recipeId. Returns new state: true if now favourited. */
export async function toggleFavourite(recipeId: string): Promise<boolean> {
  const list = await getFavourites();
  const idx = list.indexOf(recipeId);
  const next = idx >= 0 ? list.filter((_, i) => i !== idx) : [...list, recipeId];
  await setFavourites(next);
  return idx < 0;
}
