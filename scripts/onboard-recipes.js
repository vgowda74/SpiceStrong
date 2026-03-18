#!/usr/bin/env node
/**
 * onboard-recipes.js — SpiceStrong Recipe Onboarding Script
 *
 * Reads .xlsx files from recipes/input/, uploads images to Supabase Storage,
 * inserts recipes + image metadata into Supabase, then renames processed files.
 *
 * Usage:  node scripts/onboard-recipes.js
 *
 * Excel columns (row 1 = header):
 *   id, name, protein_id, protein_name, protein_emoji, description, chef_tip,
 *   meal_type, time_minutes, difficulty, protein_per_100g, spice_level, cuisine,
 *   gradient_start, gradient_end,
 *   ingredients_small (JSON string), ingredients_large (JSON string),
 *   steps (JSON string),
 *   calories, proteinG, fatG, carbsG, fiberG, sugarG, sodiumMg,
 *   cholesterolMg, saturatedFatG, ironMg, calciumMg,
 *   image_filename (hero image),
 *   step_0_image, step_1_image, step_2_image, ... (step images, 0-indexed)
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// Load .env from project root
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

// ─── Config ───
const INPUT_DIR = path.resolve(__dirname, '..', 'recipes', 'input');
const IMAGES_DIR = path.resolve(INPUT_DIR, 'images');
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  console.error('The service role key bypasses RLS and is required for curated recipe inserts.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Protein Lookup (for emoji fallback) ───
const PROTEIN_MAP = {
  chicken:  { name: 'Chicken',          emoji: '🍗' },
  fish:     { name: 'Fish',             emoji: '🐟' },
  lamb:     { name: 'Lamb',             emoji: '🥩' },
  goat:     { name: 'Goat',             emoji: '🐐' },
  pork:     { name: 'Pork',             emoji: '🥩' },
  beef:     { name: 'Beef',             emoji: '🥩' },
  prawns:   { name: 'Prawns',           emoji: '🦐' },
  eggs:     { name: 'Eggs',             emoji: '🥚' },
  paneer:   { name: 'Paneer',           emoji: '🧀' },
  tofu:     { name: 'Tofu',             emoji: '🟫' },
  soy:      { name: 'Soy',             emoji: '🫘' },
  beans:    { name: 'Beans & Lentils',  emoji: '🫘' },
  milk:     { name: 'Dairy',            emoji: '🥛' },
  whey:     { name: 'Protein Powder',   emoji: '🏋️' },
};

// ─── Helpers ───

/** Safely parse a JSON string from a cell, returning fallback on error. */
function safeParseJSON(value, fallback) {
  if (!value || typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch (e) {
    console.warn(`  WARN: Could not parse JSON: ${value.substring(0, 80)}...`);
    return fallback;
  }
}

/** Trim and return string, or null. */
function strOrNull(val) {
  if (val === undefined || val === null || val === '') return null;
  return String(val).trim();
}

/** Trim and return number, or null. */
function numOrNull(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

/** Find an image file in IMAGES_DIR matching the filename (case-insensitive, ignoring extension). */
function findImageFile(imageFilename) {
  if (!imageFilename) return null;
  const target = String(imageFilename).trim();
  if (!target) return null;

  // Exact match first
  const exactPath = path.join(IMAGES_DIR, target);
  if (fs.existsSync(exactPath)) return exactPath;

  // Case-insensitive search
  try {
    const files = fs.readdirSync(IMAGES_DIR);
    const targetLower = target.toLowerCase();
    const targetBase = path.parse(targetLower).name;

    // Try exact name match (case-insensitive)
    let match = files.find(f => f.toLowerCase() === targetLower);
    if (match) return path.join(IMAGES_DIR, match);

    // Try base name match (ignoring extension)
    match = files.find(f => path.parse(f.toLowerCase()).name === targetBase);
    if (match) return path.join(IMAGES_DIR, match);
  } catch {
    // IMAGES_DIR doesn't exist
  }

  return null;
}

/** Get MIME type from file extension. */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  return types[ext] || 'image/jpeg';
}

// ─── Core Logic ───

/**
 * Upload an image to Supabase Storage.
 * @param {string} recipeId
 * @param {string} imagePath - local file path
 * @param {string} imageType - 'hero' or 'step'
 * @param {number|null} stepIndex - 0-based index for step images, null for hero
 */
async function uploadImage(recipeId, imagePath, imageType = 'hero', stepIndex = null) {
  const ext = path.extname(imagePath).toLowerCase();
  const storageName = imageType === 'hero' ? `hero${ext}` : `step_${stepIndex}${ext}`;
  const storagePath = `${recipeId}/${storageName}`;
  const fileBuffer = fs.readFileSync(imagePath);
  const mimeType = getMimeType(imagePath);

  const { error: uploadError } = await supabase.storage
    .from('recipe-images')
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('recipe-images')
    .getPublicUrl(storagePath);

  return urlData.publicUrl;
}

/** Check if a recipe ID already exists in Supabase. */
async function recipeExists(recipeId) {
  const { data, error } = await supabase
    .from('recipes')
    .select('id')
    .eq('id', recipeId)
    .maybeSingle();

  if (error) return false;
  return !!data;
}

/** Generate a unique recipe ID, appending -001, -002, etc. if it already exists. */
async function getUniqueRecipeId(baseId) {
  if (!(await recipeExists(baseId))) return baseId;

  console.log(`  ID "${baseId}" already exists — finding unique suffix...`);
  for (let i = 1; i <= 999; i++) {
    const suffix = String(i).padStart(3, '0');
    const candidate = `${baseId}-${suffix}`;
    if (!(await recipeExists(candidate))) {
      console.log(`  Using unique ID: ${candidate}`);
      return candidate;
    }
  }
  throw new Error(`Could not find unique ID for "${baseId}" after 999 attempts`);
}

async function insertRecipe(row) {
  const proteinId = strOrNull(row.protein_id);
  if (!proteinId) throw new Error('Missing protein_id');

  const proteinInfo = PROTEIN_MAP[proteinId] || { name: proteinId, emoji: '' };

  // Build ingredients JSONB
  const ingredientsSmall = safeParseJSON(row.ingredients_small, []);
  const ingredientsLarge = safeParseJSON(row.ingredients_large, []);
  const ingredients = {
    '2-3 servings': ingredientsSmall,
    '4-6 servings': ingredientsLarge,
  };

  // Build steps JSONB
  const steps = safeParseJSON(row.steps, []);

  // Build gradient JSONB
  const gradientStart = strOrNull(row.gradient_start);
  const gradientEnd = strOrNull(row.gradient_end);
  const gradient = (gradientStart && gradientEnd)
    ? [gradientStart, gradientEnd]
    : null;

  // Build nutrition JSONB
  const nutrition = {};
  const nutritionFields = [
    'calories', 'proteinG', 'fatG', 'carbsG', 'fiberG',
    'sugarG', 'sodiumMg', 'cholesterolMg', 'saturatedFatG',
    'ironMg', 'calciumMg',
  ];
  let hasNutrition = false;
  for (const field of nutritionFields) {
    const val = numOrNull(row[field]);
    if (val !== null) {
      nutrition[field] = val;
      hasNutrition = true;
    }
  }

  // Generate unique ID (append -001, -002 if duplicate)
  const baseId = strOrNull(row.id) || `curated-${proteinId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const uniqueId = await getUniqueRecipeId(baseId);

  const recipeRow = {
    id: uniqueId,
    name: strOrNull(row.name) || 'Untitled Recipe',
    protein_id: proteinId,
    protein_name: strOrNull(row.protein_name) || proteinInfo.name,
    protein_emoji: strOrNull(row.protein_emoji) || proteinInfo.emoji,
    description: strOrNull(row.description),
    chef_tip: strOrNull(row.chef_tip),
    meal_type: strOrNull(row.meal_type),
    ingredients,
    steps,
    time_minutes: numOrNull(row.time_minutes),
    difficulty: strOrNull(row.difficulty),
    protein_per_100g: numOrNull(row.protein_per_100g),
    gradient,
    nutrition: hasNutrition ? nutrition : null,
    source: 'curated',
    is_active: true,
    is_pro: false,
    spice_level: strOrNull(row.spice_level),
    // cuisine: strOrNull(row.cuisine),  // column not in production DB yet
    status: 'ready',
    device_id: null,
  };

  const { error } = await supabase
    .from('recipes')
    .insert(recipeRow);

  if (error) {
    throw new Error(`Recipe insert failed: ${error.message}`);
  }

  return recipeRow.id;
}

/**
 * Insert image metadata into recipe_images table.
 * @param {string} recipeId
 * @param {string} publicUrl
 * @param {string} imageType - 'hero' or 'step'
 * @param {number|null} stepIndex - 0-based index for step images, null for hero
 */
async function insertImageMetadata(recipeId, publicUrl, imageType = 'hero', stepIndex = null) {
  const { error } = await supabase
    .from('recipe_images')
    .upsert(
      {
        recipe_id: recipeId,
        image_type: imageType,
        step_index: stepIndex,
        storage_url: publicUrl,
      },
      { onConflict: 'recipe_id,image_type,step_index' },
    );

  if (error) {
    throw new Error(`Image metadata insert failed: ${error.message}`);
  }
}

/** Find all step_N_image columns in a row and return them as [{index, filename}]. */
function getStepImageColumns(row) {
  const stepImages = [];
  for (const key of Object.keys(row)) {
    const match = key.match(/^step_(\d+)_image$/);
    if (match) {
      const index = parseInt(match[1], 10);
      const filename = strOrNull(row[key]);
      if (filename) {
        stepImages.push({ index, filename });
      }
    }
  }
  return stepImages.sort((a, b) => a.index - b.index);
}

function renameToOnboarded(filePath) {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const newPath = path.join(dir, `${base}_onboarded${ext}`);
  fs.renameSync(filePath, newPath);
  return newPath;
}

// ─── Main ───

async function processExcelFile(xlsxPath) {
  const filename = path.basename(xlsxPath);
  console.log(`\n========================================`);
  console.log(`Processing: ${filename}`);
  console.log(`========================================`);

  const workbook = XLSX.readFile(xlsxPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} recipe(s) in sheet "${sheetName}"\n`);

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const processedImages = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const recipeName = row.name || `Row ${i + 2}`;
    console.log(`[${i + 1}/${rows.length}] ${recipeName}`);

    try {
      // 1. Insert recipe into Supabase
      const recipeId = await insertRecipe(row);
      console.log(`  Recipe inserted: ${recipeId}`);

      // 2. Find and upload hero image
      const imageFilename = strOrNull(row.image_filename);
      const imagePath = findImageFile(imageFilename);

      if (imagePath) {
        try {
          const publicUrl = await uploadImage(recipeId, imagePath, 'hero', null);
          console.log(`  Hero image uploaded: ${publicUrl}`);

          await insertImageMetadata(recipeId, publicUrl, 'hero', null);
          console.log(`  Hero image metadata saved`);

          processedImages.push(imagePath);
        } catch (imgErr) {
          console.warn(`  WARN: Hero image upload failed: ${imgErr.message}`);
        }
      } else if (imageFilename) {
        console.warn(`  WARN: Hero image not found: "${imageFilename}" — skipping`);
        skipCount++;
      } else {
        console.log(`  No image_filename specified — skipping hero image`);
      }

      // 3. Find and upload step images (step_0_image, step_1_image, ...)
      const stepImages = getStepImageColumns(row);
      for (const { index, filename } of stepImages) {
        const stepPath = findImageFile(filename);
        if (stepPath) {
          try {
            const stepUrl = await uploadImage(recipeId, stepPath, 'step', index);
            console.log(`  Step ${index} image uploaded: ${stepUrl}`);

            await insertImageMetadata(recipeId, stepUrl, 'step', index);
            console.log(`  Step ${index} image metadata saved`);

            processedImages.push(stepPath);
          } catch (stepErr) {
            console.warn(`  WARN: Step ${index} image upload failed: ${stepErr.message}`);
          }
        } else {
          console.warn(`  WARN: Step ${index} image not found: "${filename}" — skipping`);
          skipCount++;
        }
      }

      successCount++;
      console.log(`  SUCCESS\n`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}\n`);
      failCount++;
    }
  }

  // Only rename files if ALL recipes succeeded (no failures)
  if (failCount === 0 && successCount > 0) {
    // Rename processed images to _onboarded
    for (const imgPath of processedImages) {
      try {
        if (!imgPath.includes('_onboarded')) {
          const newPath = renameToOnboarded(imgPath);
          console.log(`Renamed image: ${path.basename(imgPath)} -> ${path.basename(newPath)}`);
        }
      } catch (e) {
        console.warn(`WARN: Could not rename image ${path.basename(imgPath)}: ${e.message}`);
      }
    }

    // Rename Excel file to _onboarded
    try {
      const newPath = renameToOnboarded(xlsxPath);
      console.log(`Renamed Excel: ${filename} -> ${path.basename(newPath)}`);
    } catch (e) {
      console.warn(`WARN: Could not rename Excel ${filename}: ${e.message}`);
    }
  } else if (failCount > 0) {
    console.log(`Skipping rename — ${failCount} failure(s). Fix errors and re-run.`);
  }

  console.log(`\n--- Summary for ${filename} ---`);
  console.log(`  Recipes processed: ${successCount}`);
  console.log(`  Images skipped:    ${skipCount}`);
  console.log(`  Failures:          ${failCount}`);

  return { successCount, skipCount, failCount };
}

async function main() {
  console.log('SpiceStrong Recipe Onboarding');
  console.log('============================\n');
  console.log(`Input folder:  ${INPUT_DIR}`);
  console.log(`Images folder: ${IMAGES_DIR}`);
  console.log(`Supabase URL:  ${SUPABASE_URL}\n`);

  // Ensure input directory exists
  if (!fs.existsSync(INPUT_DIR)) {
    console.error(`ERROR: Input directory not found: ${INPUT_DIR}`);
    console.log('Create the folder and place your .xlsx files there.');
    process.exit(1);
  }

  // Find all .xlsx files NOT containing "_onboarded"
  const allFiles = fs.readdirSync(INPUT_DIR);
  const xlsxFiles = allFiles.filter(
    (f) =>
      f.endsWith('.xlsx') &&
      !f.includes('_onboarded') &&
      !f.startsWith('~$'), // Ignore temp Excel files
  );

  if (xlsxFiles.length === 0) {
    console.log('No new .xlsx files found to process.');
    console.log('Place your recipe Excel files in recipes/input/ and run again.');
    process.exit(0);
  }

  console.log(`Found ${xlsxFiles.length} new file(s) to process:`);
  xlsxFiles.forEach((f) => console.log(`  - ${f}`));

  let totalSuccess = 0;
  let totalSkip = 0;
  let totalFail = 0;

  for (const file of xlsxFiles) {
    const result = await processExcelFile(path.join(INPUT_DIR, file));
    totalSuccess += result.successCount;
    totalSkip += result.skipCount;
    totalFail += result.failCount;
  }

  console.log(`\n========================================`);
  console.log(`ONBOARDING COMPLETE`);
  console.log(`========================================`);
  console.log(`Total recipes inserted: ${totalSuccess}`);
  console.log(`Total images skipped:   ${totalSkip}`);
  console.log(`Total failures:         ${totalFail}`);
  console.log();

  if (totalFail > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
