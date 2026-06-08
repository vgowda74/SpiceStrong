/**
 * fridgeScanService.ts — SpiceStrong
 *
 * Powers the "Scan My Fridge" feature:
 * 1. Image tiling (stitch up to 4 photos into a single 2x2 grid)
 * 2. Claude Vision ingredient identification (with state + quantity)
 * 3. Weighted recipe matching (protein-first scoring)
 * 4. Smart high-protein substitutions
 *
 * Dependencies: expo-image-manipulator (install: npx expo install expo-image-manipulator)
 */

import { FRIDGE_SCAN_SYSTEM_PROMPT, FRIDGE_SCAN_USER_PROMPT } from '../src/prompts/fridgeScanPrompt';
import { applyDietaryFilter, getDietaryRestrictions } from './dietaryService';
import { fetchRecipesByProtein } from './recipeService';
import { type SavedRecipe } from '../src/store/recipes';
import { BUILTIN_RECIPES } from '../src/data/builtInRecipes';
import { filterRecipesForPreference, getAllowedProteinIds, getDietPreference } from '../src/utils/dietPreference';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

export type IngredientCategory = 'PROTEIN' | 'VEGETABLE' | 'FRUIT' | 'DAIRY' | 'GRAIN' | 'CONDIMENT' | 'SPICE' | 'PANTRY';
export type IngredientState = 'raw' | 'cooked' | 'frozen' | 'canned';

export interface ScannedIngredient {
  name: string;
  category: IngredientCategory;
  state: IngredientState;
  quantity: string;
  confidence: 'high' | 'low';
}

export interface MatchedRecipe {
  recipe: SavedRecipe;
  matchPercent: number;
  matchedIngredients: string[];
  missingIngredients: string[];
  tier: 'ready' | 'almost' | 'trip';
}

// ═══════════════════════════════════════
// 1. IMAGE TILING — Cost & Token Optimization
// ═══════════════════════════════════════

/**
 * Resize images to max 768px wide and prepare base64 for API.
 * If expo-image-manipulator is available, uses it for resizing.
 * Falls back to raw base64 read if not.
 *
 * For true 2x2 grid tiling, install react-native-view-shot and
 * render a <View> with 4 images, then capture. The current approach
 * sends multiple small images in one API call — similar token cost
 * but simpler implementation.
 */
/**
 * Prepares images for the Claude API.
 * Tries picker base64 first, falls back to reading file via expo-file-system File API.
 */
export function prepareImagesFromBase64(
  base64Images: { base64: string | null | undefined; uri: string }[],
): { base64: string; mediaType: string }[] {
  const results: { base64: string; mediaType: string }[] = [];
  for (const img of base64Images) {
    let b64 = img.base64;
    // Fallback: read from file if picker didn't return base64
    if (!b64) {
      try {
        const { File } = require('expo-file-system');
        b64 = new File(img.uri).base64();
      } catch (e) {
        console.warn('[SpiceStrong] Could not read base64 from file:', e);
      }
    }
    if (!b64 || typeof b64 !== 'string') {
      console.warn('[SpiceStrong] Skipping image — no base64 available:', img.uri);
      continue;
    }
    let mediaType = 'image/jpeg';
    if (b64.startsWith('iVBOR')) mediaType = 'image/png';
    else if (b64.startsWith('UklGR')) mediaType = 'image/webp';
    results.push({ base64: b64, mediaType });
  }
  return results;
}

// ═══════════════════════════════════════
// 2. CLAUDE VISION — Ingredient Identification
// ═══════════════════════════════════════

export async function identifyIngredients(
  base64Images: { base64: string; uri: string }[],
): Promise<ScannedIngredient[]> {
  if (!ANTHROPIC_KEY) throw new Error('No API key — set EXPO_PUBLIC_ANTHROPIC_KEY');
  if (base64Images.length === 0) throw new Error('No photos provided');

  const images = prepareImagesFromBase64(base64Images);
  if (images.length === 0) throw new Error('Could not process any photos');

  // Build multi-image content array
  const content: any[] = [];
  for (const img of images) {
    console.log(`[SpiceStrong] Fridge image: mediaType=${img.mediaType}, base64Length=${img.base64?.length ?? 0}, starts=${img.base64?.substring(0, 20)}`);
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    });
  }
  content.push({ type: 'text', text: FRIDGE_SCAN_USER_PROMPT() });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: FRIDGE_SCAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(`[SpiceStrong] Fridge scan API error ${res.status}:`, errBody);
    // Parse error message from Claude API response
    let errMsg = `API returned ${res.status}`;
    try {
      const errJson = JSON.parse(errBody);
      errMsg = errJson.error?.message || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  console.log('[SpiceStrong] Fridge scan response:', text);

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*?"ingredients"[\s\S]*?\]/);
  if (!jsonMatch) throw new Error('Could not parse ingredients from response');

  // Find the complete JSON object (match opening { to closing })
  let depth = 0;
  let endIdx = 0;
  const start = text.indexOf(jsonMatch[0]);
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
  }

  let parsed;
  try { parsed = JSON.parse(text.slice(start, endIdx)); } catch { console.warn('[SpiceStrong] Corrupted fridge scan response, could not parse JSON'); throw new Error('Could not parse ingredients from response'); }
  return (parsed.ingredients || []).map((ing: any) => ({
    name: String(ing.name ?? '').toLowerCase().trim(),
    category: ing.category ?? 'PANTRY',
    state: ing.state ?? 'raw',
    quantity: String(ing.quantity ?? 'some'),
    confidence: ing.confidence ?? 'low',
  }));
}

// ═══════════════════════════════════════
// 2B. RECEIPT / LIST SCANNING
// ═══════════════════════════════════════

/**
 * Scan a receipt or handwritten grocery list image and extract items.
 * mode: 'receipt' = grocery receipt → items go to pantry
 *       'list' = handwritten/screenshot shopping list → items go to grocery list
 */
export async function scanReceiptOrList(
  base64Images: { base64: string; uri: string }[],
  mode: 'receipt' | 'list',
): Promise<ScannedIngredient[]> {
  if (!ANTHROPIC_KEY) throw new Error('No API key — set EXPO_PUBLIC_ANTHROPIC_KEY');
  if (base64Images.length === 0) throw new Error('No photos provided');

  const images = prepareImagesFromBase64(base64Images);
  if (images.length === 0) throw new Error('Could not process any photos');

  const systemPrompt = mode === 'receipt'
    ? `You are a multilingual grocery receipt reader for a fitness cooking app. Extract FOOD ITEMS ONLY from the receipt photo. The receipt may be in ANY language.

RULES:
- Only include food/drink items — skip non-food items (bags, cleaning supplies, etc.)
- ALWAYS translate item names to English regardless of receipt language
- Normalize names: "BNLS CHKN BRST" → "chicken breast", "ORG EGGS 12CT" → "eggs", "दूध" → "milk", "arroz" → "rice"
- Extract quantity from the receipt if visible (e.g. "2x", "1kg", "500g")
- If quantity isn't clear, use "1" as default
- Categorize each item: PROTEIN, VEGETABLE, FRUIT, DAIRY, GRAIN, CONDIMENT, SPICE, or PANTRY
- State should be "raw" unless item is clearly frozen, canned, or cooked

Return ONLY this JSON:
{
  "ingredients": [
    {"name": "chicken breast", "category": "PROTEIN", "state": "raw", "quantity": "500g", "confidence": "high"}
  ]
}

IMPORTANT: NEVER refuse to read a receipt. Even if blurry or partially unclear:
- Try your BEST to read every food item — guess if needed
- Use "low" confidence for items you're unsure about
- Return whatever you CAN read, even partial results
- Only return an error if the image contains absolutely NO text at all`
    : `You are a multilingual shopping list reader for a fitness cooking app. Extract items from this handwritten list, printed list, SMS screenshot, or note. The list may be in ANY language — Hindi, Tamil, Telugu, Kannada, Malayalam, Arabic, Chinese, Spanish, French, or any other language.

RULES:
- Extract every food item mentioned regardless of language
- ALWAYS translate item names to English (e.g. "मुर्गी" → "chicken", "தக்காளி" → "tomato", "양파" → "onion", "cebolla" → "onion", "atta" → "wheat flour", "daal" → "lentils", "chawal" → "rice", "gosht" → "meat")
- Normalize abbreviations and shorthand (e.g. "tom" → "tomato", "chx" → "chicken", "pnr" → "paneer")
- Extract quantity if written (e.g. "2kg rice", "6 eggs", "½ kg चिकन" → "500g chicken")
- If quantity isn't written, use "1" as default
- Categorize each item: PROTEIN, VEGETABLE, FRUIT, DAIRY, GRAIN, CONDIMENT, SPICE, or PANTRY

Return ONLY this JSON:
{
  "ingredients": [
    {"name": "chicken breast", "category": "PROTEIN", "state": "raw", "quantity": "1kg", "confidence": "high"}
  ]
}

IMPORTANT: NEVER refuse to read a list. Even if handwriting is messy or partially unclear:
- Try your BEST to read every item — guess if needed
- Use "low" confidence for items you're unsure about
- Return whatever you CAN read, even if only 2-3 items
- Only return an error if the image contains absolutely NO text or food items at all (e.g. a photo of a car)
- Messy handwriting is EXPECTED — do your best, don't give up`;

  const content: any[] = [];
  for (const img of images) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    });
  }
  content.push({ type: 'text', text: mode === 'receipt' ? 'Read this grocery receipt and extract all food items.' : 'Read this shopping list and extract all items.' });

  // Retry up to 2 times on 529 overloaded errors
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content }],
      }),
    });
    if (res.status !== 529 || attempt === 2) break;
    console.log(`[SpiceStrong] ${mode} scan overloaded, retrying in ${(attempt + 1) * 3}s...`);
    await new Promise((r) => setTimeout(r, (attempt + 1) * 3000));
  }

  if (!res!.ok) {
    const errBody = await res!.text().catch(() => '');
    console.error(`[SpiceStrong] ${mode} scan API error ${res!.status}:`, errBody);
    let errMsg = res!.status === 529 ? 'Server is busy, please try again in a moment.' : `API returned ${res!.status}`;
    try { const errJson = JSON.parse(errBody); errMsg = errJson.error?.message || errMsg; } catch {}
    throw new Error(errMsg);
  }

  const data = await res!.json();
  const text = data.content?.[0]?.text || '';
  console.log(`[SpiceStrong] ${mode} scan response:`, text);

  const jsonMatch = text.match(/\{[\s\S]*?"ingredients"[\s\S]*?\]/);
  if (!jsonMatch) throw new Error('Could not parse items from response');

  let depth = 0;
  let endIdx = 0;
  const start = text.indexOf(jsonMatch[0]);
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
  }

  let parsed;
  try { parsed = JSON.parse(text.slice(start, endIdx)); } catch { console.warn('[SpiceStrong] Corrupted receipt/list scan response, could not parse JSON'); throw new Error('Could not parse items from response'); }
  // Only throw if truly no ingredients AND an error message — don't throw if we got partial results
  if (parsed.error && (!parsed.ingredients || parsed.ingredients.length === 0)) {
    throw new Error(parsed.error);
  }

  return (parsed.ingredients || []).map((ing: any) => ({
    name: String(ing.name ?? '').toLowerCase().trim(),
    category: ing.category ?? 'PANTRY',
    state: ing.state ?? 'raw',
    quantity: String(ing.quantity ?? '1'),
    confidence: ing.confidence ?? 'low',
  }));
}

// ═══════════════════════════════════════
// 3. SMART HIGH-PROTEIN SUBSTITUTIONS
// ═══════════════════════════════════════

/**
 * Bidirectional substitution map for high-protein cooking.
 * Key = ingredient found in scan, Values = recipe ingredients it can replace.
 * All entries are lowercase.
 */
const PROTEIN_SUBSTITUTIONS: Record<string, string[]> = {
  // Poultry
  'chicken breast': ['chicken thigh', 'chicken', 'boneless chicken', 'turkey breast'],
  'chicken thigh': ['chicken breast', 'chicken', 'boneless chicken'],
  'ground turkey': ['ground beef', 'ground chicken', 'ground pork', 'minced meat', 'mince'],
  'ground chicken': ['ground turkey', 'ground beef', 'minced meat', 'mince'],

  // Red meat
  'ground beef': ['ground turkey', 'ground chicken', 'ground lamb', 'minced meat', 'mince'],
  'beef steak': ['beef', 'sirloin', 'ribeye', 'flank steak'],
  'lamb': ['goat', 'mutton'],
  'goat': ['lamb', 'mutton'],

  // Seafood
  'salmon': ['tuna steak', 'cod', 'tilapia', 'fish fillet', 'fish'],
  'tuna': ['salmon', 'cod', 'fish'],
  'shrimp': ['prawns'],
  'prawns': ['shrimp'],

  // Plant proteins
  'tofu': ['paneer', 'tempeh', 'cottage cheese'],
  'paneer': ['tofu', 'halloumi', 'cottage cheese'],
  'tempeh': ['tofu', 'paneer'],
  'chickpeas': ['lentils', 'black beans', 'kidney beans', 'white beans'],
  'lentils': ['chickpeas', 'black beans', 'kidney beans'],
  'black beans': ['kidney beans', 'chickpeas', 'lentils', 'pinto beans'],

  // Dairy swaps
  'greek yogurt': ['sour cream', 'plain yogurt', 'yogurt', 'curd'],
  'cottage cheese': ['ricotta', 'paneer', 'tofu'],
  'curd': ['yogurt', 'greek yogurt', 'plain yogurt'],

  // Egg alternatives
  'eggs': ['egg whites', 'egg'],
  'egg whites': ['eggs', 'egg'],

  // Grains
  'brown rice': ['white rice', 'rice', 'quinoa', 'cauliflower rice'],
  'quinoa': ['brown rice', 'couscous', 'bulgur'],
  'pasta': ['noodles', 'spaghetti', 'penne'],

  // Vegetables (common swaps)
  'spinach': ['kale', 'swiss chard', 'collard greens'],
  'kale': ['spinach', 'swiss chard'],
  'bell pepper': ['capsicum'],
  'capsicum': ['bell pepper'],
  'cilantro': ['coriander', 'parsley'],
  'coriander': ['cilantro'],
  'scallion': ['green onion', 'spring onion'],
  'green onion': ['scallion', 'spring onion'],
};

/**
 * Check if a scanned ingredient can substitute for a recipe ingredient.
 * Returns the scanned ingredient name if a match is found, null otherwise.
 */
function findSubstitute(
  recipeIngredient: string,
  scannedNames: string[],
): string | null {
  const recipeLower = recipeIngredient.toLowerCase();

  for (const scanned of scannedNames) {
    // Direct match
    if (recipeLower.includes(scanned) || scanned.includes(recipeLower)) {
      return scanned;
    }

    // Check substitution map
    const subs = PROTEIN_SUBSTITUTIONS[scanned];
    if (subs) {
      for (const sub of subs) {
        if (recipeLower.includes(sub) || sub.includes(recipeLower)) {
          return `${scanned} (sub for ${sub})`;
        }
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════
// 4. WEIGHTED RECIPE MATCHING
// ═══════════════════════════════════════

/**
 * Ingredients to exclude from match scoring — everyone has these.
 * Recipes using these won't be penalized if the scan doesn't show them.
 */
const PANTRY_STAPLES = new Set([
  'salt', 'pepper', 'black pepper', 'water', 'oil', 'olive oil',
  'cooking oil', 'vegetable oil', 'cooking spray', 'sugar',
  'garlic', 'onion', 'ginger', 'turmeric', 'cumin',
  'chili powder', 'paprika', 'cinnamon', 'bay leaf',
]);

/**
 * Category weights for scoring.
 * Primary protein match is mandatory for high scores.
 */
const CATEGORY_WEIGHTS = {
  PROTEIN: 0.60,
  VEGETABLE: 0.25,
  OTHER: 0.15, // DAIRY, GRAIN, FRUIT, CONDIMENT, SPICE, PANTRY
};

/**
 * Map a recipe ingredient to a weight category.
 * Proteins in the recipe are identified by matching against known protein keywords.
 */
const PROTEIN_KEYWORDS = [
  'chicken', 'beef', 'pork', 'lamb', 'mutton', 'goat', 'turkey', 'duck',
  'fish', 'salmon', 'tuna', 'cod', 'tilapia', 'prawn', 'shrimp', 'crab',
  'lobster', 'egg', 'tofu', 'paneer', 'tempeh', 'lentil', 'chickpea',
  'bean', 'soy', 'whey', 'protein powder', 'cottage cheese', 'greek yogurt',
];

const VEGETABLE_KEYWORDS = [
  'spinach', 'kale', 'broccoli', 'cauliflower', 'pepper', 'capsicum',
  'tomato', 'onion', 'garlic', 'carrot', 'zucchini', 'cucumber',
  'lettuce', 'cabbage', 'mushroom', 'celery', 'eggplant', 'potato',
  'sweet potato', 'corn', 'peas', 'asparagus', 'green bean',
];

function classifyRecipeIngredient(name: string): 'PROTEIN' | 'VEGETABLE' | 'OTHER' {
  const lower = name.toLowerCase();
  if (PROTEIN_KEYWORDS.some((kw) => lower.includes(kw))) return 'PROTEIN';
  if (VEGETABLE_KEYWORDS.some((kw) => lower.includes(kw))) return 'VEGETABLE';
  return 'OTHER';
}

/**
 * Extract all ingredient names from a recipe's '2-3 servings' tier.
 */
function getRecipeIngredientNames(recipe: SavedRecipe): string[] {
  const tier = recipe.ingredients?.['2-3 servings'] ?? [];
  return tier.map((i) => i.name.toLowerCase().trim()).filter(Boolean);
}

/**
 * Estimate how many servings the user's scanned quantity supports.
 * Returns a rough number (1-6). Used to filter out recipes that need
 * more ingredients than the user has.
 */
export function estimateServings(scannedIngredients: ScannedIngredient[]): number {
  // Look at primary protein quantity
  const proteins = scannedIngredients.filter((i) => i.category === 'PROTEIN');
  if (proteins.length === 0) return 2; // default

  for (const p of proteins) {
    const q = p.quantity.toLowerCase();
    if (q.includes('2lb') || q.includes('1kg') || q.includes('4 breast')) return 6;
    if (q.includes('1lb') || q.includes('500g') || q.includes('2 breast')) return 4;
    if (q.includes('half') || q.includes('1 breast') || q.includes('250g') || q.includes('small')) return 2;
  }
  return 3; // middle ground
}

/**
 * Core matching: score a single recipe against scanned ingredients.
 *
 * Weighted scoring:
 * - PROTEIN ingredients: 60% of total score
 * - VEGETABLE ingredients: 25%
 * - OTHER (dairy, grain, condiment, etc.): 15%
 *
 * HARD RULE: If the recipe's primary protein is missing AND no substitute
 * is found in the scan, the recipe CANNOT score above 50%.
 */
function scoreRecipe(
  recipe: SavedRecipe,
  scannedNames: string[],
): { score: number; matched: string[]; missing: string[] } {
  const recipeIngredients = getRecipeIngredientNames(recipe);
  if (recipeIngredients.length === 0) return { score: 0, matched: [], missing: [] };

  // Classify recipe ingredients into weighted buckets
  const buckets: Record<'PROTEIN' | 'VEGETABLE' | 'OTHER', { name: string; matched: boolean; matchedBy: string | null }[]> = {
    PROTEIN: [],
    VEGETABLE: [],
    OTHER: [],
  };

  for (const ingName of recipeIngredients) {
    // Skip pantry staples — don't count for or against
    if (PANTRY_STAPLES.has(ingName)) continue;

    const category = classifyRecipeIngredient(ingName);
    const substitute = findSubstitute(ingName, scannedNames);
    buckets[category].push({
      name: ingName,
      matched: substitute !== null,
      matchedBy: substitute,
    });
  }

  // Calculate weighted score per bucket
  let totalScore = 0;
  const matched: string[] = [];
  const missing: string[] = [];

  for (const [cat, items] of Object.entries(buckets) as [keyof typeof buckets, typeof buckets['PROTEIN']][]) {
    if (items.length === 0) {
      // No items in this category — redistribute weight
      // (e.g., if recipe has no vegetables, their 25% goes to others proportionally)
      continue;
    }

    const matchedCount = items.filter((i) => i.matched).length;
    const bucketScore = matchedCount / items.length;
    const weight = cat === 'PROTEIN' ? CATEGORY_WEIGHTS.PROTEIN
      : cat === 'VEGETABLE' ? CATEGORY_WEIGHTS.VEGETABLE
      : CATEGORY_WEIGHTS.OTHER;
    totalScore += bucketScore * weight;

    for (const item of items) {
      if (item.matched) {
        matched.push(item.matchedBy ?? item.name);
      } else {
        missing.push(item.name);
      }
    }
  }

  // Normalize score if some buckets were empty (redistribute weight)
  const usedWeight = (buckets.PROTEIN.length > 0 ? CATEGORY_WEIGHTS.PROTEIN : 0)
    + (buckets.VEGETABLE.length > 0 ? CATEGORY_WEIGHTS.VEGETABLE : 0)
    + (buckets.OTHER.length > 0 ? CATEGORY_WEIGHTS.OTHER : 0);

  const normalizedScore = usedWeight > 0 ? (totalScore / usedWeight) * 100 : 0;

  // HARD RULE: If primary protein is missing, cap at 50%
  const primaryProteinMissing = buckets.PROTEIN.length > 0
    && buckets.PROTEIN.every((i) => !i.matched);

  const finalScore = primaryProteinMissing
    ? Math.min(normalizedScore, 50)
    : Math.round(normalizedScore);

  return { score: finalScore, matched, missing };
}

// ═══════════════════════════════════════
// PUBLIC API — Match Recipes
// ═══════════════════════════════════════

/**
 * All known protein IDs in the app.
 */
const ALL_PROTEIN_IDS = [
  'chicken', 'eggs', 'paneer', 'lamb', 'goat', 'fish', 'prawns',
  'pork', 'tofu', 'soy', 'beans', 'milk', 'whey', 'beef',
];

/**
 * Map scanned protein ingredients to app protein IDs.
 * Returns which protein categories to fetch recipes for.
 */
function detectProteinCategories(ingredients: ScannedIngredient[]): string[] {
  const proteinItems = ingredients.filter((i) => i.category === 'PROTEIN');
  const detected = new Set<string>();

  for (const item of proteinItems) {
    const name = item.name.toLowerCase();
    if (name.includes('chicken') || name.includes('turkey') || name.includes('duck')) detected.add('chicken');
    if (name.includes('egg')) detected.add('eggs');
    if (name.includes('paneer') || name.includes('cottage cheese')) detected.add('paneer');
    if (name.includes('lamb') || name.includes('mutton')) detected.add('lamb');
    if (name.includes('goat')) detected.add('goat');
    if (name.includes('fish') || name.includes('salmon') || name.includes('tuna') || name.includes('cod') || name.includes('tilapia')) detected.add('fish');
    if (name.includes('prawn') || name.includes('shrimp') || name.includes('crab') || name.includes('lobster')) detected.add('prawns');
    if (name.includes('pork') || name.includes('bacon')) detected.add('pork');
    if (name.includes('beef') || name.includes('steak')) detected.add('beef');
    if (name.includes('tofu') || name.includes('tempeh')) detected.add('tofu');
    if (name.includes('soy') || name.includes('edamame')) detected.add('soy');
    if (name.includes('bean') || name.includes('lentil') || name.includes('chickpea')) detected.add('beans');
    if (name.includes('milk') || name.includes('yogurt') || name.includes('whey')) { detected.add('milk'); detected.add('whey'); }
  }

  // If no proteins detected, search all categories
  return detected.size > 0 ? Array.from(detected) : ALL_PROTEIN_IDS;
}

/**
 * Match scanned ingredients against all available recipes.
 *
 * 1. Detects which protein categories the user has
 * 2. Fetches recipes only for those proteins (performance optimization)
 * 3. Applies dietary restrictions
 * 4. Scores each recipe using weighted algorithm
 * 5. Applies protein substitution logic
 * 6. Returns sorted results in 3 tiers
 */
export async function matchRecipes(
  scannedIngredients: ScannedIngredient[],
): Promise<MatchedRecipe[]> {
  const scannedNames = scannedIngredients.map((i) => i.name.toLowerCase().trim());
  const dietary = await getDietaryRestrictions();
  const dietPreference = await getDietPreference();
  const allowedProteinIds = new Set(getAllowedProteinIds(dietPreference));

  // Detect which proteins the user has → only fetch those categories
  const proteinCategories = detectProteinCategories(scannedIngredients).filter((id) => allowedProteinIds.has(id));
  console.log(`[SpiceStrong] Fridge scan: detected proteins: ${proteinCategories.join(', ')}`);

  // Gather recipes from detected protein categories
  const allRecipes: SavedRecipe[] = [];
  const seen = new Set<string>();

  // Start with built-in recipes (instant, in-memory)
  for (const r of filterRecipesForPreference(BUILTIN_RECIPES, dietPreference)) {
    if (!seen.has(r.id)) { allRecipes.push(r); seen.add(r.id); }
  }

  // Fetch Supabase/local recipes for relevant proteins
  const fetchPromises = proteinCategories.map(async (pid) => {
    try {
      const { recipes } = await fetchRecipesByProtein(pid);
      return recipes;
    } catch { return []; }
  });

  const fetched = await Promise.all(fetchPromises);
  for (const recipes of fetched) {
    for (const r of recipes) {
      if (!seen.has(r.id)) { allRecipes.push(r); seen.add(r.id); }
    }
  }

  console.log(`[SpiceStrong] Fridge scan: ${allRecipes.length} recipes to score`);

  // Apply dietary filter
  const filtered = applyDietaryFilter(allRecipes, dietary);

  // Score each recipe
  const results: MatchedRecipe[] = [];
  for (const recipe of filtered) {
    const { score, matched, missing } = scoreRecipe(recipe, scannedNames);
    if (score < 30) continue; // skip very low matches

    const tier: MatchedRecipe['tier'] =
      score >= 90 ? 'ready' :
      score >= 60 ? 'almost' : 'trip';

    results.push({
      recipe,
      matchPercent: score,
      matchedIngredients: matched,
      missingIngredients: missing,
      tier,
    });
  }

  // Sort: tier (ready > almost > trip), then by match % descending
  const tierOrder = { ready: 0, almost: 1, trip: 2 };
  results.sort((a, b) => {
    if (tierOrder[a.tier] !== tierOrder[b.tier]) return tierOrder[a.tier] - tierOrder[b.tier];
    return b.matchPercent - a.matchPercent;
  });

  console.log(`[SpiceStrong] Fridge scan: ${results.length} matches (${results.filter(r => r.tier === 'ready').length} ready, ${results.filter(r => r.tier === 'almost').length} almost, ${results.filter(r => r.tier === 'trip').length} trip)`);

  return results;
}

// ═══════════════════════════════════════
// COMMON PANTRY STAPLES (for UI pre-check)
// ═══════════════════════════════════════

export const DEFAULT_PANTRY_STAPLES: ScannedIngredient[] = [
  { name: 'oil', category: 'CONDIMENT', state: 'raw', quantity: 'some', confidence: 'high' },
  { name: 'salt', category: 'SPICE', state: 'raw', quantity: 'some', confidence: 'high' },
  { name: 'pepper', category: 'SPICE', state: 'raw', quantity: 'some', confidence: 'high' },
  { name: 'garlic', category: 'VEGETABLE', state: 'raw', quantity: 'some', confidence: 'high' },
  { name: 'onion', category: 'VEGETABLE', state: 'raw', quantity: 'some', confidence: 'high' },
  { name: 'rice', category: 'GRAIN', state: 'raw', quantity: 'some', confidence: 'high' },
];
