/**
 * Smart Shopping List Helper
 * Converts recipe quantities to purchasable quantities and provides Instacart deep links.
 */

import { Linking } from 'react-native';
import { INGREDIENT_MAP, CATEGORY_ORDER, CATEGORY_EMOJI, type PurchasableUnit } from '../data/ingredientMapping';

export interface SmartShoppingItem {
  originalName: string;
  originalQuantity: string;
  purchasableUnit: string;       // "1 jar (2.5 oz)"
  searchTerm: string;
  category: string;
  isPantryStaple: boolean;
  recipeName: string;
  instacartUrl: string;
  mapped: boolean;               // true if matched in INGREDIENT_MAP
}

/**
 * Normalize an ingredient name for fuzzy matching against the mapping table.
 * Strips prep instructions, quantities, and common suffixes.
 */
function normalizeIngredientName(name: string): string {
  let n = name.toLowerCase().trim();

  // Remove anything in parentheses: "Paneer (prefer low-fat)" → "paneer"
  n = n.replace(/\s*\([^)]*\)\s*/g, ' ');

  // Remove prep words at the end: "onion finely chopped" → "onion"
  const PREP_SUFFIXES = /\s*,?\s*(finely |roughly |thinly )?(chopped|sliced|diced|minced|crushed|grated|cubed|julienned|deveined|peeled|rinsed|soaked|drained|trimmed|cleaned|washed|halved|quartered|shredded|ground|cut|slit|deskinned|deboned)\s*$/gi;
  n = n.replace(PREP_SUFFIXES, '');

  // Remove leading "fresh", "dried", "frozen", "raw"
  n = n.replace(/^(fresh |dried |frozen |raw |whole |organic |low-fat |lowfat )/i, '');

  // Remove trailing "powder" if the base + powder is not a key (e.g., keep "turmeric powder")
  // We keep it — the map has both forms

  // Collapse whitespace
  n = n.replace(/\s+/g, ' ').trim();

  return n;
}

/**
 * Find the best mapping for an ingredient name using fuzzy matching.
 */
export function findMapping(ingredientName: string): PurchasableUnit | null {
  const normalized = normalizeIngredientName(ingredientName);

  // 1. Exact match
  if (INGREDIENT_MAP[normalized]) return INGREDIENT_MAP[normalized];

  // 2. Try without trailing 's' (singularize)
  const singular = normalized.endsWith('s') ? normalized.slice(0, -1) : normalized;
  if (INGREDIENT_MAP[singular]) return INGREDIENT_MAP[singular];

  // 3. Try with trailing 's' (pluralize)
  const plural = normalized + 's';
  if (INGREDIENT_MAP[plural]) return INGREDIENT_MAP[plural];

  // 4. Partial match — check if any key is contained in the name or vice versa
  const keys = Object.keys(INGREDIENT_MAP);
  // Prefer longer matches (more specific)
  const sortedKeys = keys.sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return INGREDIENT_MAP[key];
    }
  }

  // 5. Word-level match — check if main word overlaps
  const words = normalized.split(' ');
  for (const key of sortedKeys) {
    const keyWords = key.split(' ');
    const overlap = words.filter(w => keyWords.includes(w));
    if (overlap.length > 0 && overlap[0].length > 3) {
      return INGREDIENT_MAP[key];
    }
  }

  return null;
}

// Instacart functions removed — awaiting Developer API approval
// Will re-add buildInstacartSearchUrl, openInstacartSearch, openInstacart once API key is obtained

/**
 * Open Amazon Fresh with all shopping list items in a single search.
 * Combines item names (without pantry staples) into one search query.
 */
export async function openAmazonFresh(cartItems: Record<string, string>, showPantry: boolean = false): Promise<void> {
  const smartItems = buildSmartShoppingList(cartItems);
  const grouped = groupByCategory(smartItems, showPantry);
  const allItems = Object.values(grouped).flat();

  if (allItems.length === 0) return;

  // Build search query from item names (skip pantry staples)
  const searchTerms = allItems
    .filter(item => item.category?.toLowerCase() !== 'pantry')
    .map(item => item.searchTerm || item.originalName)
    .join(' ');

  const url = `https://www.amazon.com/s?k=${encodeURIComponent(searchTerms)}&i=amazonfresh`;

  try {
    await Linking.openURL(url);
  } catch (err) {
    console.warn('[SpiceStrong] Could not open Amazon Fresh:', err);
  }
}

/**
 * Convert cart items (recipe quantities) to smart shopping list items
 * with purchasable quantities and Instacart links.
 */
export function buildSmartShoppingList(
  cartItems: Record<string, string>  // key = "name|||qty", value = recipeName
): SmartShoppingItem[] {
  const items: SmartShoppingItem[] = [];
  const seen = new Map<string, SmartShoppingItem>(); // dedup by searchTerm

  Object.entries(cartItems).forEach(([key, recipeName]) => {
    const [name, qty] = key.split('|||');
    const mapping = findMapping(name);

    if (mapping && mapping.isPantryStaple && !mapping.searchTerm) {
      // Skip water, ice, etc. — no purchase needed
      return;
    }

    const searchTerm = mapping?.searchTerm || name;
    const dedupeKey = searchTerm.toLowerCase();

    // Combine duplicates — if same ingredient appears from multiple recipes,
    // we still only need one purchasable unit (e.g., one jar of cumin covers all)
    if (seen.has(dedupeKey)) {
      const existing = seen.get(dedupeKey)!;
      if (!existing.recipeName.includes(recipeName)) {
        existing.recipeName += `, ${recipeName}`;
      }
      return;
    }

    const item: SmartShoppingItem = {
      originalName: name,
      originalQuantity: qty,
      purchasableUnit: mapping
        ? `1 ${mapping.minUnit} (${mapping.minSize})`
        : qty,
      searchTerm,
      category: mapping?.category || 'other',
      isPantryStaple: mapping?.isPantryStaple || false,
      recipeName,
      instacartUrl: '', // Instacart integration pending — awaiting Developer API
      mapped: !!mapping,
    };

    seen.set(dedupeKey, item);
    items.push(item);
  });

  // Sort by category order
  return items.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    return ai - bi;
  });
}

/**
 * Group smart shopping items by category for display.
 */
export function groupByCategory(
  items: SmartShoppingItem[],
  showPantryStaples: boolean = false,
): Record<string, SmartShoppingItem[]> {
  const grouped: Record<string, SmartShoppingItem[]> = {};

  items.forEach(item => {
    if (!showPantryStaples && item.isPantryStaple) return;

    const label = item.category.toUpperCase();
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(item);
  });

  return grouped;
}

/**
 * Build a formatted share message with purchasable quantities.
 */
export function buildSmartShareMessage(items: SmartShoppingItem[], showPantryStaples: boolean = false): string {
  const grouped = groupByCategory(items, showPantryStaples);
  const sections: string[] = [];

  CATEGORY_ORDER.forEach(cat => {
    const key = cat.toUpperCase();
    if (!grouped[key] || grouped[key].length === 0) return;
    const emoji = CATEGORY_EMOJI[cat] || '📦';
    const itemLines = grouped[key].map(item =>
      `  • ${item.mapped ? item.purchasableUnit + ' ' : item.originalQuantity + ' '}${item.originalName}`
    );
    sections.push(`${emoji} ${key}\n${itemLines.join('\n')}`);
  });

  return `🛒 Shopping List\n\n${sections.join('\n\n')}\n\n🏪 Order on Instacart → instacart.com\n\nCooked with SpiceStrong 💪`;
}
