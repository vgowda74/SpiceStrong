import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedRecipe {
  id: string;
  name: string;
  proteinId: string;
  proteinName: string;
  proteinEmoji: string;
  ingredients: { name: string; quantity: string }[];
  steps: { title: string; description: string }[];
  chefTip: string;
  createdAt: number;
}

const KEY = 'spicestrong_recipes';

export async function getRecipes(): Promise<SavedRecipe[]> {
  try {
    const data = await AsyncStorage.getItem(KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveRecipe(recipe: SavedRecipe): Promise<void> {
  try {
    const existing = await getRecipes();
    const updated = [...existing, recipe];
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save recipe', e);
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  try {
    const existing = await getRecipes();
    const updated = existing.filter(r => r.id !== id);
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to delete recipe', e);
  }
}