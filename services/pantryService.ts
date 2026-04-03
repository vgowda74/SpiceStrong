/**
 * pantryService.ts — SpiceStrong
 * Persistent pantry inventory stored in AsyncStorage.
 * Populated via Scan My Grocery or manual entry.
 * Used by recipe matching, grocery list subtraction, and auto meal planner.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PANTRY_KEY = 'spicestrong_pantry';
const GROCERY_LIST_KEY = 'spicestrong_grocery_shopping_list';

export interface PantryItem {
  name: string;
  category: 'PROTEIN' | 'VEGETABLE' | 'FRUIT' | 'DAIRY' | 'GRAIN' | 'CONDIMENT' | 'SPICE' | 'PANTRY';
  quantity: string;
  state?: 'raw' | 'cooked' | 'frozen' | 'canned';
  addedAt: number; // timestamp
}

export interface GroceryItem {
  name: string;
  quantity: string;
  fromRecipe?: string; // recipe name that needs this
  checked: boolean;
}

// ═══════════════════════════════════════
// PANTRY CRUD
// ═══════════════════════════════════════

export async function getPantryItems(): Promise<PantryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(PANTRY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function savePantryItems(items: PantryItem[]): Promise<void> {
  await AsyncStorage.setItem(PANTRY_KEY, JSON.stringify(items));
}

export async function addPantryItem(item: Omit<PantryItem, 'addedAt'>): Promise<void> {
  const items = await getPantryItems();
  // Update if exists (by name, case-insensitive), else add
  const existingIdx = items.findIndex((i) => i.name.toLowerCase() === item.name.toLowerCase());
  if (existingIdx >= 0) {
    items[existingIdx] = { ...items[existingIdx], ...item, addedAt: items[existingIdx].addedAt };
  } else {
    items.push({ ...item, addedAt: Date.now() });
  }
  await savePantryItems(items);
}

export async function addPantryItemsBatch(newItems: Omit<PantryItem, 'addedAt'>[]): Promise<void> {
  const items = await getPantryItems();
  const existingNames = new Set(items.map((i) => i.name.toLowerCase()));
  const now = Date.now();
  for (const item of newItems) {
    if (existingNames.has(item.name.toLowerCase())) {
      // Update existing
      const idx = items.findIndex((i) => i.name.toLowerCase() === item.name.toLowerCase());
      if (idx >= 0) items[idx] = { ...items[idx], ...item, addedAt: items[idx].addedAt };
    } else {
      items.push({ ...item, addedAt: now });
      existingNames.add(item.name.toLowerCase());
    }
  }
  await savePantryItems(items);
}

export async function removePantryItem(name: string): Promise<void> {
  const items = await getPantryItems();
  await savePantryItems(items.filter((i) => i.name.toLowerCase() !== name.toLowerCase()));
}

export async function clearPantry(): Promise<void> {
  await AsyncStorage.removeItem(PANTRY_KEY);
}

// ═══════════════════════════════════════
// GROCERY SHOPPING LIST
// ═══════════════════════════════════════

export async function getGroceryList(): Promise<GroceryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(GROCERY_LIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveGroceryList(items: GroceryItem[]): Promise<void> {
  await AsyncStorage.setItem(GROCERY_LIST_KEY, JSON.stringify(items));
}

export async function addToGroceryList(item: Omit<GroceryItem, 'checked'>): Promise<void> {
  const list = await getGroceryList();
  const existingIdx = list.findIndex((i) => i.name.toLowerCase() === item.name.toLowerCase());
  if (existingIdx >= 0) {
    // Update quantity if from different recipe
    if (item.fromRecipe && list[existingIdx].fromRecipe !== item.fromRecipe) {
      list[existingIdx].quantity = `${list[existingIdx].quantity}, ${item.quantity}`;
    }
  } else {
    list.push({ ...item, checked: false });
  }
  await saveGroceryList(list);
}

export async function removeFromGroceryList(name: string): Promise<void> {
  const list = await getGroceryList();
  await saveGroceryList(list.filter((i) => i.name.toLowerCase() !== name.toLowerCase()));
}

export async function toggleGroceryItem(name: string): Promise<void> {
  const list = await getGroceryList();
  const idx = list.findIndex((i) => i.name.toLowerCase() === name.toLowerCase());
  if (idx >= 0) {
    list[idx].checked = !list[idx].checked;
    await saveGroceryList(list);
  }
}

// ═══════════════════════════════════════
// PANTRY-AWARE GROCERY LIST
// ═══════════════════════════════════════

/**
 * Given a list of needed ingredients (from recipes), subtract what's
 * already in the pantry and return only what needs to be bought.
 */
export async function generateSmartGroceryList(
  neededIngredients: { name: string; quantity: string; fromRecipe?: string }[],
): Promise<GroceryItem[]> {
  const pantry = await getPantryItems();
  const pantryNames = new Set(pantry.map((i) => i.name.toLowerCase()));

  const toBuy: GroceryItem[] = [];
  for (const ing of neededIngredients) {
    // Skip if already in pantry
    const inPantry = pantryNames.has(ing.name.toLowerCase()) ||
      Array.from(pantryNames).some((pn) => ing.name.toLowerCase().includes(pn) || pn.includes(ing.name.toLowerCase()));
    if (!inPantry) {
      toBuy.push({ name: ing.name, quantity: ing.quantity, fromRecipe: ing.fromRecipe, checked: false });
    }
  }

  // Save and return
  await saveGroceryList(toBuy);
  return toBuy;
}

// ═══════════════════════════════════════
// PANTRY RECIPE MATCHING
// ═══════════════════════════════════════

/**
 * Get pantry item names as lowercase strings for recipe matching.
 */
export async function getPantryIngredientNames(): Promise<string[]> {
  const items = await getPantryItems();
  return items.map((i) => i.name.toLowerCase());
}
