#!/usr/bin/env node
/**
 * onboard-recipes-v2.js — SpiceStrong Recipe Onboarding (Multi-Sheet Format)
 *
 * Reads chef-friendly .xlsx files with 4 sheets:
 *   Sheet 1: "Recipe Info"    — Field | Value (key-value pairs)
 *   Sheet 2: "Ingredients"    — # | Ingredient | Qty (2–3 servings) | Qty (4–6 servings)
 *   Sheet 3: "Cooking Steps"  — Step # | Step Title | Instructions | Timer | Chef Tip
 *   Sheet 4: "Nutrition"      — Nutrient | Per Serving (any column header)
 *
 * Auto-generates recipe ID, maps protein name to protein_id, picks gradient colors,
 * handles hero + step images (local or AI-generated via fal.ai).
 *
 * Usage:  node scripts/onboard-recipes-v2.js
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// Load .env from project root
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const { fal } = require('@fal-ai/client');
const { generateRecipeFingerprint, getFingerprintInput } = require('./lib/recipeFingerprint');
const { classifyRecipe } = require('./pipeline/classifyRecipe');
const { getNutrition } = require('./pipeline/getNutrition');

// ─── Config ───
const INPUT_DIR = path.resolve(__dirname, '..', 'recipes', 'input');
const IMAGES_DIR = path.resolve(INPUT_DIR, 'images');
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Protein Lookup ───
const PROTEINS = [
  { id: 'chicken',  name: 'Chicken',          emoji: '🍗', proteinPer100g: 31 },
  { id: 'fish',     name: 'Fish',             emoji: '🐟', proteinPer100g: 22 },
  { id: 'lamb',     name: 'Lamb',             emoji: '🥩', proteinPer100g: 26 },
  { id: 'goat',     name: 'Goat',             emoji: '🐐', proteinPer100g: 27 },
  { id: 'pork',     name: 'Pork',             emoji: '🥩', proteinPer100g: 27 },
  { id: 'beef',     name: 'Beef',             emoji: '🥩', proteinPer100g: 26 },
  { id: 'prawns',   name: 'Prawns',           emoji: '🦐', proteinPer100g: 24 },
  { id: 'eggs',     name: 'Eggs',             emoji: '🥚', proteinPer100g: 13 },
  { id: 'paneer',   name: 'Paneer',           emoji: '🧀', proteinPer100g: 18 },
  { id: 'tofu',     name: 'Tofu',             emoji: '🟫', proteinPer100g: 17 },
  { id: 'soy',      name: 'Soy',             emoji: '🫘', proteinPer100g: 36 },
  { id: 'beans',    name: 'Beans & Lentils',  emoji: '🫘', proteinPer100g: 22 },
  { id: 'milk',     name: 'Dairy',            emoji: '🥛', proteinPer100g: 3 },
  { id: 'whey',     name: 'Protein Powder',   emoji: '🏋️', proteinPer100g: 80 },
];

// Default gradient colors per protein
const DEFAULT_GRADIENTS = {
  chicken: ['#5D1E0F', '#C0392B'],
  fish:    ['#1A5276', '#2E86C1'],
  lamb:    ['#5D1E0F', '#8B3A1A'],
  goat:    ['#5D1E0F', '#8B3A1A'],
  pork:    ['#4A1A0A', '#8B3A1A'],
  beef:    ['#5D1E0F', '#C0392B'],
  prawns:  ['#5D1E0F', '#C0392B'],
  eggs:    ['#D4A017', '#C0392B'],
  paneer:  ['#D4A017', '#C0392B'],
  tofu:    ['#6B4226', '#A0522D'],
  soy:     ['#6B4226', '#A0522D'],
  beans:   ['#6B4226', '#A0522D'],
  milk:    ['#D4A017', '#C0392B'],
  whey:    ['#5D1E0F', '#C0392B'],
};

// Step emojis — assigned in order, cycles if more steps than emojis
const STEP_EMOJIS = ['🥩', '🔥', '🧅', '🌶️', '🌿', '🍳', '🫕', '🥘'];

// ─── Helpers ───

function strOrNull(val) {
  if (val === undefined || val === null || val === '') return null;
  return String(val).trim();
}

function numOrNull(val) {
  if (val === undefined || val === null || val === '') return null;
  const str = String(val).trim();
  // Handle range values like "35–40" or "35-40" — take the higher value
  const rangeMatch = str.match(/(\d+(?:\.\d+)?)\s*[–\-]\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) return Number(rangeMatch[2]);
  // Strip non-numeric chars like ~, kcal, g, mg etc.
  const cleaned = str.replace(/[^0-9.]/g, '');
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

/** Parse timer string like "20–25 min" or "5 min" into a number (takes the higher value). */
function parseTimer(timerStr) {
  if (!timerStr) return null;
  const str = String(timerStr).trim();
  if (!str) return null;
  // Match patterns like "20-25", "20–25", "5"
  const rangeMatch = str.match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (rangeMatch) return parseInt(rangeMatch[2], 10);
  const singleMatch = str.match(/(\d+)/);
  if (singleMatch) return parseInt(singleMatch[1], 10);
  return null;
}

/** Resolve protein name (e.g. "Pork", "prawns", "Beans & Lentils") to protein entry. */
function resolveProtein(proteinInput) {
  if (!proteinInput) return null;
  const input = String(proteinInput).trim().toLowerCase();
  // Try exact id match first
  let match = PROTEINS.find(p => p.id === input);
  if (match) return match;
  // Try name match (case-insensitive)
  match = PROTEINS.find(p => p.name.toLowerCase() === input);
  if (match) return match;
  // Try partial match
  match = PROTEINS.find(p => input.includes(p.id) || input.includes(p.name.toLowerCase()));
  if (match) return match;
  return null;
}

/** Generate a slug from recipe name + protein. */
function generateRecipeId(recipeName, proteinId) {
  const slug = recipeName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  return `curated-${proteinId}-${slug}`;
}

/** Find an image file in a directory (case-insensitive). */
function findImageFile(dir, filename) {
  if (!filename || !dir) return null;
  const target = String(filename).trim();
  if (!target) return null;

  const exactPath = path.join(dir, target);
  if (fs.existsSync(exactPath)) return exactPath;

  try {
    const files = fs.readdirSync(dir);
    const targetLower = target.toLowerCase();
    const targetBase = path.parse(targetLower).name;

    let match = files.find(f => f.toLowerCase() === targetLower);
    if (match) return path.join(dir, match);

    match = files.find(f => path.parse(f.toLowerCase()).name === targetBase);
    if (match) return path.join(dir, match);
  } catch {
    // directory doesn't exist
  }
  return null;
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'image/jpeg';
}

// ─── Sheet Parsers ───

/**
 * Parse "Recipe Info" sheet (key-value format).
 * Returns an object like { "Recipe Name": "...", "Protein": "Pork", ... }
 */
function parseRecipeInfo(workbook) {
  const sheet = workbook.Sheets['Recipe Info'];
  if (!sheet) throw new Error('Missing "Recipe Info" sheet');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const info = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    const field = String(row[0]).trim();
    const value = row[1] !== undefined ? row[1] : null;
    info[field] = value;
  }

  return info;
}

/**
 * Parse "Ingredients" sheet.
 * Returns { small: [{name, quantity}], large: [{name, quantity}] }
 */
function parseIngredients(workbook) {
  const sheet = workbook.Sheets['Ingredients'];
  if (!sheet) throw new Error('Missing "Ingredients" sheet');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const small = [];
  const large = [];

  // Row 0 = header: # | Ingredient | Qty (2-3 servings) | Qty (4-6 servings)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[1]) continue;

    const name = String(row[1]).trim();
    const qtySmall = row[2] !== undefined ? String(row[2]).trim() : '';
    const qtyLarge = row[3] !== undefined ? String(row[3]).trim() : qtySmall;

    small.push({ name, quantity: qtySmall });
    large.push({ name, quantity: qtyLarge });
  }

  return { small, large };
}

/**
 * Parse "Cooking Steps" sheet.
 * Supports two header formats:
 *   v1: Step # | Step Title | Instructions | Timer | Chef Tip
 *   v2: Step # | Step Title | Instructions | Ingredients Used in Step | Cooking Method | Timer | Chef Tip
 * Returns array of { title, description, timerMinutes, tip, emoji, ingredientsUsed, cookingMethod }
 */
function parseCookingSteps(workbook) {
  const sheet = workbook.Sheets['Cooking Steps'];
  if (!sheet) throw new Error('Missing "Cooking Steps" sheet');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const steps = [];

  // Detect header format by checking column headers
  const headers = (rows[0] || []).map(h => String(h || '').trim().toLowerCase());
  const hasExtendedColumns = headers.some(h => h.includes('ingredients used') || h.includes('cooking method'));

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || (!row[1] && !row[2])) continue;

    let step;

    if (hasExtendedColumns) {
      // v2 format: Step # | Step Title | Instructions | Ingredients Used | Cooking Method | Timer | Chef Tip
      step = {
        title: strOrNull(row[1]) || `Step ${i}`,
        description: strOrNull(row[2]) || '',
        timerMinutes: parseTimer(row[5]),
        tip: strOrNull(row[6]) || null,
        emoji: STEP_EMOJIS[(i - 1) % STEP_EMOJIS.length],
        ingredientsUsed: strOrNull(row[3]) || null,
        cookingMethod: strOrNull(row[4]) || null,
      };
    } else {
      // v1 format: Step # | Step Title | Instructions | Timer | Chef Tip
      step = {
        title: strOrNull(row[1]) || `Step ${i}`,
        description: strOrNull(row[2]) || '',
        timerMinutes: parseTimer(row[3]),
        tip: strOrNull(row[4]) || null,
        emoji: STEP_EMOJIS[(i - 1) % STEP_EMOJIS.length],
      };
    }

    // Remove null fields to keep JSON clean
    if (step.timerMinutes === null) delete step.timerMinutes;
    if (step.tip === null) delete step.tip;
    if (step.ingredientsUsed === null) delete step.ingredientsUsed;
    if (step.cookingMethod === null) delete step.cookingMethod;

    steps.push(step);
  }

  return steps;
}

/**
 * Parse "Nutrition" sheet.
 * Returns object like { calories: 380, proteinG: 32, ... }
 */
function parseNutrition(workbook) {
  const sheet = workbook.Sheets['Nutrition'];
  if (!sheet) return null;

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const nutrition = {};

  // Map display names to DB field names
  const FIELD_MAP = {
    'calories':         'calories',
    'protein':          'proteinG',
    'fat':              'fatG',
    'carbohydrates':    'carbsG',
    'carbs':            'carbsG',
    'fiber':            'fiberG',
    'sugar':            'sugarG',
    'sodium':           'sodiumMg',
    'cholesterol':      'cholesterolMg',
    'saturated fat':    'saturatedFatG',
    'iron':             'ironMg',
    'calcium':          'calciumMg',
  };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const label = String(row[0]).trim().toLowerCase();
    const value = numOrNull(row[1]); // Use first value column

    const dbField = FIELD_MAP[label];
    if (dbField && value !== null) {
      nutrition[dbField] = value;
    }
  }

  return Object.keys(nutrition).length > 0 ? nutrition : null;
}

// ─── AI Image Generation ───

async function generateImage(prompt) {
  const result = await fal.subscribe('fal-ai/nano-banana-2', {
    input: { prompt, image_size: 'square_hd' },
  });

  const imageUrl = result.data.images[0].url;
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download generated image: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Build a context-aware, progressive prompt for AI step image generation.
 *
 * Creates realistic food photography prompts that:
 *   - Show exact ingredients with quantities for the current step
 *   - Remember what happened in previous steps (accumulated state in the pan/pot)
 *   - Specify the correct cooking vessel and method
 *   - Describe the visual state of food (color, texture, doneness)
 *
 * @param {string} recipeName - Full recipe name
 * @param {Object[]} allSteps - All parsed cooking steps
 * @param {number} stepIndex - Current step index (0-based)
 * @param {Object[]} ingredients - Full ingredients list [{name, quantity}]
 * @returns {string} Detailed AI image generation prompt
 */
function buildStepImagePrompt(recipeName, allSteps, stepIndex, ingredients) {
  const currentStep = allSteps[stepIndex];
  const stepNum = stepIndex + 1;
  const totalSteps = allSteps.length;
  const stepDesc = currentStep.description || '';
  const stepTitle = currentStep.title || `Step ${stepNum}`;
  const cookingMethod = currentStep.cookingMethod || null;
  const ingredientsUsed = currentStep.ingredientsUsed || null;

  // ── Detect the cooking vessel from step descriptions ──
  const allDescs = allSteps.slice(0, stepIndex + 1).map(s => s.description.toLowerCase()).join(' ');
  let vessel = 'pan';
  if (allDescs.includes('pot') || allDescs.includes('pressure cook') || allDescs.includes('boil'))
    vessel = 'pot';
  else if (allDescs.includes('kadai') || allDescs.includes('karahi') || allDescs.includes('wok'))
    vessel = 'kadai (Indian wok)';
  else if (allDescs.includes('tawa') || allDescs.includes('griddle') || allDescs.includes('flat pan'))
    vessel = 'tawa (flat griddle)';
  else if (allDescs.includes('oven') || allDescs.includes('bake'))
    vessel = 'oven tray';
  else if (allDescs.includes('skillet'))
    vessel = 'cast iron skillet';
  else if (allDescs.includes('deep fry') || allDescs.includes('deep-fry'))
    vessel = 'deep frying pan with oil';

  // ── Build ingredient detail for this step (always with quantities) ──
  // Helper: find the full ingredient entry (with quantity) from the master list
  function findIngredientWithQty(ingNameRaw) {
    const target = ingNameRaw.toLowerCase().trim();
    // Exact name match first
    let match = ingredients.find(ing => (ing.name || '').toLowerCase().trim() === target);
    if (match) return match;
    // Partial match: ingredient list name contains the target or vice versa
    match = ingredients.find(ing => {
      const fullName = (ing.name || '').toLowerCase();
      return fullName.includes(target) || target.includes(fullName.split('(')[0].trim());
    });
    if (match) return match;
    // Word-level match: any significant word matches
    const targetWords = target.split(/\s+/).filter(w => w.length > 2);
    match = ingredients.find(ing => {
      const fullName = (ing.name || '').toLowerCase();
      return targetWords.some(w => fullName.includes(w));
    });
    return match || null;
  }

  let stepIngredientDetail = '';
  if (ingredientsUsed) {
    // ingredientsUsed is a comma-separated string like "Onion, Tomato, Green chili"
    // Look up each one in the master ingredients list to get the full quantity
    const usedNames = ingredientsUsed.split(',').map(s => s.trim()).filter(Boolean);
    const resolved = usedNames.map(usedName => {
      const found = findIngredientWithQty(usedName);
      if (found && found.quantity) {
        return `${found.quantity} ${found.name || usedName}`;
      }
      return usedName; // fallback: name only if no match
    });
    stepIngredientDetail = resolved.join(', ');
  } else {
    // Auto-match: find ingredients mentioned in the step description
    const descLower = stepDesc.toLowerCase();
    const matched = ingredients.filter(ing => {
      const ingName = (ing.name || '').toLowerCase();
      // Check if any significant word from the ingredient name appears in the step description
      const words = ingName.split(/[\s()]/g).filter(w => w.length > 2);
      return words.some(w => descLower.includes(w));
    });
    if (matched.length > 0) {
      stepIngredientDetail = matched.map(ing =>
        ing.quantity ? `${ing.quantity} ${ing.name}` : ing.name
      ).join(', ');
    }
  }

  // ── Summarize what happened in previous steps (accumulated state) ──
  let previousContext = '';
  if (stepIndex > 0) {
    const prevSummaries = [];
    for (let p = 0; p < stepIndex; p++) {
      const prev = allSteps[p];
      const prevDesc = prev.description || prev.title;
      // Create a short past-tense summary of what's already in the vessel
      prevSummaries.push(prevDesc);
    }
    previousContext = `Previous steps already done: ${prevSummaries.join('; ')}. The ${vessel} already contains the result of these steps.`;
  }

  // ── Determine the visual state based on cooking action keywords ──
  const descLower = stepDesc.toLowerCase();
  let visualState = '';
  if (descLower.includes('sear') || descLower.includes('brown'))
    visualState = 'showing golden-brown seared surface with caramelization';
  else if (descLower.includes('sauté') || descLower.includes('saute') || descLower.includes('fry'))
    visualState = 'showing sizzling ingredients with light oil sheen';
  else if (descLower.includes('boil'))
    visualState = 'showing bubbling liquid with steam rising';
  else if (descLower.includes('simmer') || descLower.includes('low heat'))
    visualState = 'showing gentle bubbles with rich sauce coating the ingredients';
  else if (descLower.includes('golden') || descLower.includes('translucent'))
    visualState = 'showing softened, golden translucent onions';
  else if (descLower.includes('marinate') || descLower.includes('coat') || descLower.includes('mix'))
    visualState = 'showing ingredients well-coated and mixed in a bowl';
  else if (descLower.includes('garnish') || descLower.includes('serve') || descLower.includes('plate'))
    visualState = 'beautifully plated with fresh garnish, ready to serve';
  else if (descLower.includes('chop') || descLower.includes('slice') || descLower.includes('dice') || descLower.includes('cut'))
    visualState = 'showing neatly cut ingredients on a wooden cutting board';
  else if (descLower.includes('roast') || descLower.includes('char') || descLower.includes('grill'))
    visualState = 'showing charred edges with smoky appearance';
  else if (descLower.includes('cover') || descLower.includes('steam'))
    visualState = 'with lid partially lifted showing steam escaping';
  else if (descLower.includes('temper') || descLower.includes('tadka') || descLower.includes('splutter'))
    visualState = 'showing seeds and spices crackling in hot oil';

  // ── Determine if this is a prep, cooking, or final step ──
  let stageHint = '';
  if (stepIndex === 0) {
    stageHint = 'This is the very first step — show a clean kitchen setup with fresh raw ingredients.';
  } else if (stepIndex === totalSteps - 1) {
    stageHint = 'This is the FINAL step — show the completed dish looking appetizing and restaurant-quality.';
  } else if (stepIndex <= 1) {
    stageHint = 'Early cooking stage — ingredients are still relatively fresh and just starting to cook.';
  } else if (stepIndex >= totalSteps - 2) {
    stageHint = 'Late cooking stage — the dish is nearly complete, colors are rich and deep.';
  }

  // ── Assemble the full prompt ──
  const parts = [
    `Professional food photography, top-down close-up shot of step ${stepNum} of ${totalSteps} for "${recipeName}".`,
    `Step: "${stepTitle}" — ${stepDesc}`,
  ];

  if (stepIngredientDetail) {
    parts.push(`Ingredients being added in this step: ${stepIngredientDetail}.`);
  }

  if (previousContext) {
    parts.push(previousContext);
  }

  parts.push(`Cooking vessel: ${vessel}.`);

  if (cookingMethod) {
    parts.push(`Cooking method: ${cookingMethod}.`);
  }

  if (visualState) {
    parts.push(`Visual: ${visualState}.`);
  }

  if (stageHint) {
    parts.push(stageHint);
  }

  parts.push(
    'Warm kitchen lighting, shallow depth of field, authentic Indian home cooking.',
    'Realistic food textures — no plastic or artificial look. Magazine-quality photography.',
    'Show realistic quantities matching a home-cooked meal for 2-3 people.',
    'No text, no watermarks, no UI elements.'
  );

  return parts.join(' ');
}

// ─── Supabase Operations ───

async function uploadImageFile(recipeId, imagePath, imageType = 'hero', stepIndex = null) {
  const ext = path.extname(imagePath).toLowerCase();
  const storageName = imageType === 'hero' ? `hero${ext}` : `step_${stepIndex}${ext}`;
  const storagePath = `${recipeId}/${storageName}`;
  const fileBuffer = fs.readFileSync(imagePath);

  const { error } = await supabase.storage
    .from('recipe-images')
    .upload(storagePath, fileBuffer, { contentType: getMimeType(imagePath), upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage.from('recipe-images').getPublicUrl(storagePath);
  return urlData.publicUrl;
}

async function uploadImageBuffer(recipeId, buffer, imageType = 'hero', stepIndex = null) {
  const storageName = imageType === 'hero' ? 'hero.jpg' : `step_${stepIndex}.jpg`;
  const storagePath = `${recipeId}/${storageName}`;

  const { error } = await supabase.storage
    .from('recipe-images')
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage.from('recipe-images').getPublicUrl(storagePath);
  return urlData.publicUrl;
}

async function insertImageMetadata(recipeId, publicUrl, imageType = 'hero', stepIndex = null) {
  const { error } = await supabase
    .from('recipe_images')
    .insert({ recipe_id: recipeId, image_type: imageType, step_index: stepIndex, storage_url: publicUrl });

  if (error) throw new Error(`Image metadata insert failed: ${error.message}`);
}

async function recipeExists(recipeId) {
  const { data } = await supabase.from('recipes').select('id').eq('id', recipeId).maybeSingle();
  return !!data;
}

/**
 * Check if a recipe with the given fingerprint already exists in Supabase.
 * Returns the existing recipe's id and name if found, null otherwise.
 *
 * @param {string} fingerprint - SHA-256 hex string
 * @returns {Promise<{id: string, name: string}|null>}
 */
async function findRecipeByFingerprint(fingerprint) {
  const { data } = await supabase
    .from('recipes')
    .select('id, name')
    .eq('fingerprint', fingerprint)
    .maybeSingle();
  return data || null;
}

async function getUniqueRecipeId(baseId) {
  if (!(await recipeExists(baseId))) return baseId;
  console.log(`  ID "${baseId}" already exists — finding unique suffix...`);
  for (let i = 1; i <= 999; i++) {
    const candidate = `${baseId}-${String(i).padStart(3, '0')}`;
    if (!(await recipeExists(candidate))) {
      console.log(`  Using unique ID: ${candidate}`);
      return candidate;
    }
  }
  throw new Error(`Could not find unique ID for "${baseId}" after 999 attempts`);
}

// ─── Main Processing ───

async function processExcelFile(xlsxPath) {
  const filename = path.basename(xlsxPath);
  console.log(`\n========================================`);
  console.log(`Processing: ${filename}`);
  console.log(`========================================`);

  const workbook = XLSX.readFile(xlsxPath);
  console.log(`Sheets found: ${workbook.SheetNames.join(', ')}`);

  // 1. Parse all sheets
  const info = parseRecipeInfo(workbook);
  const { small: ingredientsSmall, large: ingredientsLarge } = parseIngredients(workbook);
  const steps = parseCookingSteps(workbook);
  const nutrition = parseNutrition(workbook);

  const recipeName = strOrNull(info['Recipe Name']);
  if (!recipeName) throw new Error('Missing "Recipe Name" in Recipe Info sheet');

  console.log(`\nRecipe: ${recipeName}`);

  // 2. Resolve protein — try explicit field first, then detect from recipe name
  const proteinInput = info['Protein'] || info['Protein Type'] || info['protein'];
  let protein = resolveProtein(proteinInput);
  if (!protein) {
    // Fallback: try to detect protein from recipe name
    protein = resolveProtein(recipeName);
  }
  if (!protein) throw new Error(`Could not resolve protein: "${proteinInput || recipeName}". Must be one of: ${PROTEINS.map(p => p.name).join(', ')}`);

  console.log(`Protein: ${protein.name} (${protein.id})`);
  console.log(`Ingredients: ${ingredientsSmall.length} items`);
  console.log(`Steps: ${steps.length}`);
  console.log(`Nutrition: ${nutrition ? Object.keys(nutrition).length + ' fields' : 'none'}`);

  // 3. Fingerprint deduplication check
  const recipeForFingerprint = {
    ingredients: { '2-3 servings': ingredientsSmall },
    steps,
  };
  const fingerprint = generateRecipeFingerprint(recipeForFingerprint);
  const fpInput = getFingerprintInput(recipeForFingerprint);
  console.log(`Fingerprint: ${fingerprint.substring(0, 16)}...`);
  console.log(`  Input: ${fpInput.substring(0, 80)}${fpInput.length > 80 ? '...' : ''}`);

  const existingMatch = await findRecipeByFingerprint(fingerprint);
  if (existingMatch) {
    console.log(`  DUPLICATE DETECTED — matches existing recipe:`);
    console.log(`    ID:   ${existingMatch.id}`);
    console.log(`    Name: ${existingMatch.name}`);
    return { status: 'duplicate', matchedRecipe: existingMatch.name };
  }

  // 4. Generate recipe ID
  const baseId = generateRecipeId(recipeName, protein.id);
  const recipeId = await getUniqueRecipeId(baseId);
  console.log(`Recipe ID: ${recipeId}`);

  // 5. Parse optional fields
  const cookingTime = numOrNull(info['Cooking Time']) || numOrNull(info['Total Time']);
  const DIFFICULTY_MAP_EXCEL = { 'beginner': 'Easy', 'intermediate': 'Medium', 'advanced': 'Hard', 'chef level': 'Hard' };
  const rawDifficulty = strOrNull(info['Difficulty']) || 'Medium';
  const difficulty = DIFFICULTY_MAP_EXCEL[rawDifficulty.toLowerCase()] || rawDifficulty;
  const spiceLevel = strOrNull(info['Spice Level']) || 'Medium';
  const description = strOrNull(info['Description']) || '';
  const chefTip = strOrNull(info['Chef Tip']) || null;
  const mealTypeRaw = strOrNull(info['Meal Type']) || 'lunch_dinner';
  // Map chef-friendly meal types to DB enum values
  const MEAL_TYPE_MAP = {
    'breakfast':        'breakfast',
    'lunch':            'lunch_dinner',
    'dinner':           'lunch_dinner',
    'lunch / dinner':   'lunch_dinner',
    'lunch/dinner':     'lunch_dinner',
    'lunch_dinner':     'lunch_dinner',
    'snack':            'snack_dessert',
    'dessert':          'snack_dessert',
    'snack / dessert':  'snack_dessert',
    'snack/dessert':    'snack_dessert',
    'snack_dessert':    'snack_dessert',
  };
  const mealType = MEAL_TYPE_MAP[mealTypeRaw.toLowerCase()] || 'lunch_dinner';
  const proteinPer100g = numOrNull(info['Protein per 100g']) || protein.proteinPer100g;

  // Gradient: use custom if provided, otherwise default for protein
  const gradientStart = strOrNull(info['Gradient Start']);
  const gradientEnd = strOrNull(info['Gradient End']);
  const gradient = (gradientStart && gradientEnd)
    ? [gradientStart, gradientEnd]
    : DEFAULT_GRADIENTS[protein.id] || ['#5D1E0F', '#C0392B'];

  // Build tags array from Yes/No fields in Recipe Info
  const tags = [];
  const TAG_MAP = {
    'High Protein':     'high-protein',
    'Low Carb':         'low-carb',
    'Low Cholesterol':  'low-cholesterol',
    'Gluten Free':      'gluten-free',
    'Fitness Friendly': 'fitness-friendly',
  };
  for (const [field, tag] of Object.entries(TAG_MAP)) {
    const val = strOrNull(info[field]);
    if (val && val.toLowerCase() !== 'no') {
      tags.push(tag);
    }
  }

  // 6. Insert recipe
  const recipeRow = {
    id: recipeId,
    name: recipeName,
    protein_id: protein.id,
    protein_name: protein.name,
    protein_emoji: protein.emoji,
    description,
    chef_tip: chefTip,
    meal_type: mealType,
    ingredients: {
      '2-3 servings': ingredientsSmall,
      '4-6 servings': ingredientsLarge,
    },
    steps,
    time_minutes: cookingTime,
    difficulty,
    protein_per_100g: proteinPer100g,
    gradient,
    nutrition,
    source: 'curated',
    is_active: true,
    is_published: true,
    is_pro: false,
    spice_level: spiceLevel,
    cuisine: strOrNull(info['Cuisine']) || null,
    tags: tags.length > 0 ? tags : null,
    status: 'ready',
    device_id: null,
    fingerprint,
  };

  // Try insert with retries on transient network errors (fetch failed)
  const insertWithRetry = async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const res = await supabase.from('recipes').insert(recipeRow);
        return res;
      } catch (netErr) {
        if (attempt === 4) throw netErr;
        const waitMs = attempt * 5000;
        console.log(`  Network error (attempt ${attempt}/4), retrying in ${waitMs/1000}s: ${netErr.message}`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  };

  let { error: insertError } = await insertWithRetry();
  if (insertError && insertError.message.includes('schema cache')) {
    console.log('  NOTE: Some columns not in DB yet — inserting without cuisine/tags/fingerprint');
    delete recipeRow.cuisine;
    delete recipeRow.tags;
    delete recipeRow.fingerprint;
    ({ error: insertError } = await insertWithRetry());
  }
  // Handle duplicate fingerprint at DB level (belt + suspenders with pre-check)
  if (insertError && insertError.code === '23505' && insertError.message?.includes('fingerprint')) {
    console.log(`  DUPLICATE detected at DB level — skipping`);
    return { status: 'duplicate', matchedRecipe: recipeName };
  }
  if (insertError) throw new Error(`Recipe insert failed: ${insertError.message}`);
  console.log(`  Recipe inserted: ${recipeId}`);

  // 6b. Run Claude classification + Edamam nutrition pipeline
  //     Extract flat ingredient strings and instruction strings for the APIs
  const flatIngredients = ingredientsSmall.map(ing =>
    ing.quantity ? `${ing.quantity} ${ing.name}` : ing.name
  );
  const flatInstructions = steps.map(s => s.description);
  const servingsCount = numOrNull(info['Servings']) || 2;  // default 2 servings

  let classificationData = null;
  let nutritionData = null;

  try {
    console.log(`\n  Running Claude classification + Edamam nutrition...`);
    [classificationData, nutritionData] = await Promise.all([
      classifyRecipe(recipeName, flatIngredients, flatInstructions),
      getNutrition(flatIngredients, servingsCount),
    ]);
  } catch (parallelErr) {
    console.warn(`  WARN: Parallel pipeline failed: ${parallelErr.message}`);
    console.log(`  Retrying individually...`);
    try {
      classificationData = await classifyRecipe(recipeName, flatIngredients, flatInstructions);
    } catch (classErr) {
      console.warn(`  WARN: Classification failed: ${classErr.message}`);
    }
    try {
      nutritionData = await getNutrition(flatIngredients, servingsCount);
    } catch (nutrErr) {
      console.warn(`  WARN: Nutrition analysis failed: ${nutrErr.message}`);
    }
  }

  // Build the update payload with classification + nutrition results
  const DIFFICULTY_MAP = { 'Beginner': 'Easy', 'Intermediate': 'Medium', 'Advanced': 'Hard', 'Chef level': 'Hard' };
  const pipelineUpdate = {};

  if (classificationData) {
    console.log(`  Classification: cuisine=${classificationData.cuisine_type}, spice=${classificationData.spice_level}, difficulty=${classificationData.difficulty}`);
    Object.assign(pipelineUpdate, {
      cuisine_type: classificationData.cuisine_type,
      spice_level: classificationData.spice_level,
      difficulty: DIFFICULTY_MAP[classificationData.difficulty] || classificationData.difficulty,
      cook_time_bucket: classificationData.cook_time_bucket,
      meal_type_tags: classificationData.meal_type,
      dietary_tags: classificationData.dietary_tags,
      allergen_tags: classificationData.allergen_tags,
      cooking_method: classificationData.cooking_method,
      fitness_goal: classificationData.fitness_goal,
      storage_tags: classificationData.storage_tags,
    });
  }

  if (nutritionData) {
    console.log(`  Nutrition: ${nutritionData.calories} kcal, ${nutritionData.protein_g}g protein, ${nutritionData.carbs_g}g carbs, ${nutritionData.fat_g}g fat`);
    // Store per-column nutrition for DB queries
    Object.assign(pipelineUpdate, {
      calories: nutritionData.calories,
      protein_g: nutritionData.protein_g,
      carbs_g: nutritionData.carbs_g,
      fat_g: nutritionData.fat_g,
      fiber_g: nutritionData.fiber_g,
    });
    // Also store ai_nutrition as batch totals (per-serving × 2.5) for the app
    pipelineUpdate.ai_nutrition = {
      calories: Math.round(nutritionData.calories * 2.5),
      proteinG: Math.round(nutritionData.protein_g * 2.5),
      carbsG: Math.round(nutritionData.carbs_g * 2.5),
      fatG: Math.round(nutritionData.fat_g * 2.5),
      fiberG: Math.round((nutritionData.fiber_g || 0) * 2.5),
    };
  }

  // Update the recipe row with classification + nutrition data
  if (Object.keys(pipelineUpdate).length > 0) {
    const { error: updateError } = await supabase
      .from('recipes')
      .update(pipelineUpdate)
      .eq('id', recipeId);

    if (updateError) {
      // If columns don't exist yet, warn but don't fail the whole onboarding
      console.warn(`  WARN: Pipeline update failed (${updateError.message}) — recipe inserted with core fields only`);
    } else {
      console.log(`  Pipeline data saved: ${Object.keys(pipelineUpdate).length} fields updated`);
    }
  }

  // 7. Handle hero image
  const heroFilename = strOrNull(info['Hero Image']) || strOrNull(info['Hero Image Filename']) || strOrNull(info['image_filename']);
  const heroPath = findImageFile(IMAGES_DIR, heroFilename);

  // Also check for recipe-name based hero image: recipes/input/images/[slug].jpg
  const slugForImage = recipeName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const autoHeroPath = heroPath || findImageFile(IMAGES_DIR, `${slugForImage}.jpg`) || findImageFile(IMAGES_DIR, `${slugForImage}.png`);

  if (autoHeroPath) {
    try {
      console.log(`  Using provided image: ${path.basename(autoHeroPath)}`);
      const publicUrl = await uploadImageFile(recipeId, autoHeroPath, 'hero');
      console.log(`  Hero image uploaded: ${publicUrl}`);
      await insertImageMetadata(recipeId, publicUrl, 'hero');
    } catch (err) {
      console.warn(`  WARN: Hero image upload failed: ${err.message}`);
    }
  } else {
    try {
      console.log(`  No hero image found, generating via AI...`);
      // Build a detailed hero prompt with key ingredients visible
      const topIngredients = ingredientsSmall.slice(0, 5).map(ing =>
        ing.quantity ? `${ing.quantity} ${ing.name}` : ing.name
      ).join(', ');
      const cuisineHint = classificationData?.cuisine_type ? `authentic ${classificationData.cuisine_type}` : 'authentic Indian';
      const prompt = `Professional food photography of "${recipeName}", ${cuisineHint} dish beautifully plated and ready to serve. Key ingredients visible: ${topIngredients}. Warm natural lighting, shallow depth of field, overhead angle, high protein healthy meal. Realistic food textures, home-cooked feel, magazine quality. No text, no watermarks.`;
      const buffer = await generateImage(prompt);
      const publicUrl = await uploadImageBuffer(recipeId, buffer, 'hero');
      console.log(`  AI hero image uploaded: ${publicUrl}`);
      await insertImageMetadata(recipeId, publicUrl, 'hero');
    } catch (err) {
      console.warn(`  WARN: AI hero image generation failed: ${err.message}`);
    }
  }

  // 8. Handle step images
  // Check folder: recipes/input/images/steps/[recipe_slug]/step_N.jpg
  const stepImagesDir = path.join(IMAGES_DIR, 'steps', slugForImage);

  for (let s = 0; s < steps.length; s++) {
    // Try to find step image: step_1.jpg (1-indexed for chef friendliness)
    const stepPath = findImageFile(stepImagesDir, `step_${s + 1}.jpg`)
      || findImageFile(stepImagesDir, `step_${s + 1}.png`)
      || findImageFile(stepImagesDir, `step_${s}.jpg`);  // fallback 0-indexed

    if (stepPath) {
      try {
        console.log(`  Using provided step image: ${path.basename(stepPath)}`);
        const stepUrl = await uploadImageFile(recipeId, stepPath, 'step', s);
        console.log(`  Step ${s} image uploaded: ${stepUrl}`);
        await insertImageMetadata(recipeId, stepUrl, 'step', s);
      } catch (err) {
        console.warn(`  WARN: Step ${s} image upload failed: ${err.message}`);
      }
    } else {
      try {
        console.log(`  No step ${s + 1} image found, generating via AI...`);
        const prompt = buildStepImagePrompt(recipeName, steps, s, ingredientsSmall);
        console.log(`  Prompt: ${prompt.substring(0, 120)}...`);
        const buffer = await generateImage(prompt);
        const stepUrl = await uploadImageBuffer(recipeId, buffer, 'step', s);
        console.log(`  AI step ${s} image uploaded: ${stepUrl}`);
        await insertImageMetadata(recipeId, stepUrl, 'step', s);
      } catch (err) {
        console.warn(`  WARN: AI step ${s} image generation failed: ${err.message}`);
      }
    }
  }

  console.log(`\n  SUCCESS: ${recipeName} fully onboarded!`);
  return { success: true, recipeId };
}

function renameToOnboarded(filePath) {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const newPath = path.join(dir, `${base}_onboarded${ext}`);
  fs.renameSync(filePath, newPath);
  return newPath;
}

async function main() {
  console.log('SpiceStrong Recipe Onboarding v2 (Multi-Sheet Format)');
  console.log('=====================================================\n');
  console.log(`Input folder:  ${INPUT_DIR}`);
  console.log(`Images folder: ${IMAGES_DIR}`);
  console.log(`Supabase URL:  ${SUPABASE_URL}\n`);

  if (!fs.existsSync(INPUT_DIR)) {
    console.error(`ERROR: Input directory not found: ${INPUT_DIR}`);
    process.exit(1);
  }

  // Find .xlsx files NOT containing "_onboarded" or "_duplicate"
  const allFiles = fs.readdirSync(INPUT_DIR);
  const xlsxFiles = allFiles.filter(
    f => f.endsWith('.xlsx') && !f.includes('_onboarded') && !f.includes('_duplicate') && !f.startsWith('~$')
  );

  if (xlsxFiles.length === 0) {
    console.log('No new .xlsx files found to process.');
    console.log('Place your recipe Excel files in recipes/input/ and run again.');
    process.exit(0);
  }

  console.log(`Found ${xlsxFiles.length} file(s) to process:`);
  xlsxFiles.forEach(f => console.log(`  - ${f}`));

  let successCount = 0;
  let duplicateCount = 0;
  let failCount = 0;

  for (const file of xlsxFiles) {
    const filePath = path.join(INPUT_DIR, file);
    try {
      const result = await processExcelFile(filePath);

      // Handle duplicate detection — skip and rename to _duplicate
      if (result && result.status === 'duplicate') {
        duplicateCount++;
        try {
          const dir = path.dirname(filePath);
          const ext = path.extname(filePath);
          const base = path.basename(filePath, ext);
          const dupPath = path.join(dir, `${base}_duplicate${ext}`);
          fs.renameSync(filePath, dupPath);
          console.log(`Renamed: ${file} -> ${path.basename(dupPath)} (matches: ${result.matchedRecipe})`);
        } catch (e) {
          console.warn(`WARN: Could not rename ${file}: ${e.message}`);
        }
        continue;
      }

      successCount++;

      // Rename to _onboarded on success
      try {
        const newPath = renameToOnboarded(filePath);
        console.log(`Renamed: ${file} -> ${path.basename(newPath)}`);
      } catch (e) {
        console.warn(`WARN: Could not rename ${file}: ${e.message}`);
      }
    } catch (err) {
      console.error(`\n  FAILED: ${file} — ${err.message}\n`);
      failCount++;
    }
  }

  console.log(`\n========================================`);
  console.log(`ONBOARDING COMPLETE`);
  console.log(`========================================`);
  console.log(`Recipes inserted:  ${successCount}`);
  console.log(`Duplicates skipped: ${duplicateCount}`);
  console.log(`Failures:          ${failCount}`);
  console.log();

  if (failCount > 0) process.exit(1);
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
