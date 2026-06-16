/**
 * imageGenerationService.ts — SpiceStrong
 * Generates AI images for recipe dish hero using fal.ai flux/schnell.
 * Downloads images to local file system for persistence.
 * Stores local file URI mappings in AsyncStorage keyed by recipeId.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const AI_IMAGES_PREFIX = 'spicestrong_ai_images_';
const IMAGE_DIR_NAME = 'ai_recipe_images';

/** Delay helper for polling. */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ImageResult {
  url: string | null;
  error?: string;
}

export interface RecipeImageResults {
  dishImage: string | null;                    // local file URI for finished dish hero
  ingredientImages: Record<string, string | null>; // kept for backward compat (empty for new recipes)
  stepImages: Record<string, string | null>;   // stepIndex -> local file URI
}

function getImageDirUri(): string {
  return `${FileSystem.documentDirectory}${IMAGE_DIR_NAME}/`;
}

/** Get or create the local image directory. */
async function ensureImageDir(): Promise<string> {
  const dirUri = getImageDirUri();
  const info = await FileSystem.getInfoAsync(dirUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }
  return dirUri;
}

/**
 * Download an image from a remote URL to local file system.
 * Returns the local file URI, or null on failure.
 */
async function downloadImage(remoteUrl: string, localFileName: string): Promise<string | null> {
  try {
    const dirUri = await ensureImageDir();
    const destination = dirUri + localFileName;
    const info = await FileSystem.getInfoAsync(destination);
    if (info.exists) {
      await FileSystem.deleteAsync(destination, { idempotent: true });
    }
    const downloaded = await FileSystem.downloadAsync(remoteUrl, destination);
    console.log(`[SpiceStrong] Image saved: ${localFileName} -> ${downloaded.uri}`);
    return downloaded.uri;
  } catch (e) {
    console.error(`[SpiceStrong] Image download error for ${localFileName}:`, e);
    return null;
  }
}

/**
 * Call fal.ai flux/schnell via queue API with polling.
 * ~$0.003 per image.
 */
type FalModel = 'schnell' | 'dev';

async function callFal(prompt: string, label: string, model: FalModel = 'schnell'): Promise<{ url: string | null; error?: string }> {
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[SpiceStrong] fal.ai proxy request for "${label}" (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);

      const { data, error } = await supabase.functions.invoke('fal-image-proxy', {
        body: { prompt, label, model },
      });

      if (error) {
        const message = await getFunctionErrorMessage(error);
        console.warn(`[SpiceStrong] fal.ai proxy error for "${label}": ${message}`);
        if (attempt < MAX_RETRIES) {
          await delay(3000);
          continue;
        }
        return { url: null, error: message };
      }

      const result = data as { url?: string | null; error?: string } | null;
      if (result?.url) {
        console.log(`[SpiceStrong] fal.ai proxy success for "${label}"`);
        return { url: result.url };
      }

      const message = result?.error || 'No image URL returned from fal.ai proxy';
      console.warn(`[SpiceStrong] fal.ai proxy returned no image for "${label}": ${message}`);
      if (attempt < MAX_RETRIES) {
        await delay(3000);
        continue;
      }
      return { url: null, error: message };
    } catch (networkErr) {
      const errMsg = networkErr instanceof Error ? networkErr.message : 'Network error';
      console.warn(`[SpiceStrong] fal.ai proxy network error for "${label}": ${errMsg}`);
      if (attempt < MAX_RETRIES) {
        await delay(3000);
        continue;
      }
      return { url: null, error: errMsg };
    }
  }
  return { url: null, error: 'Max retries exceeded' };
}

async function getFunctionErrorMessage(error: any): Promise<string> {
  const fallback = error?.message || 'fal.ai proxy failed';
  try {
    const context = error?.context;
    if (!context) return fallback;
    const text = await context.text();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text);
      return parsed?.error || parsed?.message || fallback;
    } catch {
      return text.slice(0, 220);
    }
  } catch {
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Body-scan reference samples
// A neutral, illustrative full-body reference pose per gender, generated once
// via fal.ai and cached locally. Used to show users how to stand before they
// upload their own body-scan photo.
// ─────────────────────────────────────────────────────────────────────────

const BODY_SCAN_SAMPLE_PREFIX = 'spicestrong_bodyscan_sample_';

const BODY_SCAN_SAMPLE_PROMPTS: Record<'male' | 'female', string> = {
  male: 'Clean minimal flat vector illustration of a fit man standing in a straight front-facing reference pose for a body measurement guide, full body visible from head to feet, arms slightly away from the sides, feet shoulder-width apart, wearing fitted athletic shorts and a plain tank top, neutral grey silhouette style, plain light studio background, centered, modest, non-photographic instructional diagram',
  female: 'Clean minimal flat vector illustration of a fit woman standing in a straight front-facing reference pose for a body measurement guide, full body visible from head to feet, arms slightly away from the sides, feet shoulder-width apart, wearing fitted athletic leggings and a sports top, neutral grey silhouette style, plain light studio background, centered, modest, non-photographic instructional diagram',
};

/**
 * Get the local URI of the front-pose reference sample for a gender.
 * Returns a cached local file if available; otherwise generates one via fal.ai,
 * downloads it, caches the URI, and returns it. Returns null on failure
 * so the caller can fall back to a placeholder.
 */
export async function generateBodyScanSample(gender: 'male' | 'female'): Promise<string | null> {
  const cacheKey = `${BODY_SCAN_SAMPLE_PREFIX}${gender}`;
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const info = await FileSystem.getInfoAsync(cached);
      if (info.exists) return cached;
    }
  } catch { /* regenerate below */ }

  const { url, error } = await callFal(BODY_SCAN_SAMPLE_PROMPTS[gender], `bodyscan-${gender}`);
  if (!url) {
    console.warn(`[SpiceStrong] Body-scan sample generation failed (${gender}): ${error}`);
    return null;
  }

  const localUri = await downloadImage(url, `bodyscan_sample_${gender}.jpg`);
  if (localUri) {
    try { await AsyncStorage.setItem(cacheKey, localUri); } catch { /* non-blocking */ }
  }
  return localUri;
}

// ─────────────────────────────────────────────────────────────────────────
// Body scan instruction comparison images
// 4 pairs (good/bad) for the "How It Works" carousel.
// Generated once via fal.ai schnell and cached permanently.
// ─────────────────────────────────────────────────────────────────────────

const SCAN_INSTR_CACHE_KEY = 'spicestrong_scan_instr_images_v2';

export interface ScanInstrImages {
  clothingGood: string | null;
  clothingBad: string | null;
  lightingGood: string | null;
  lightingBad: string | null;
  backgroundGood: string | null;
  backgroundBad: string | null;
  distanceGood: string | null;
  distanceBad: string | null;
}

const SCAN_INSTR_PROMPTS: Record<keyof ScanInstrImages, string> = {
  clothingGood: 'Fitness body scan reference photo. Athletic man wearing only fitted black compression shorts, shirtless, standing straight facing camera, arms slightly away from sides, full body visible from head to feet, plain light gray wall background, soft bright natural lighting, professional portrait photography, crisp detail, no text',
  clothingBad: 'Fitness body scan bad example. Same man but wearing an oversized baggy gray hoodie and very loose sweatpants, full body facing camera, same plain gray wall, same bright lighting, body shape completely hidden by loose baggy clothing, portrait photo',
  lightingGood: 'Fitness body scan reference photo. Shirtless athletic man in black compression shorts facing camera against white wall, perfectly lit with soft even diffused natural window light, no harsh shadows, bright and clear, high quality portrait, full body visible',
  lightingBad: 'Fitness body scan bad example. Same shirtless man in black shorts facing camera but in a dark poorly lit room, single harsh side shadow obscuring half the body, underexposed dark image, barely visible details, showing why bad lighting ruins body scan accuracy',
  backgroundGood: 'Fitness body scan reference photo. Shirtless athletic man in black shorts standing facing camera in front of a perfectly clean plain white wall, zero clutter or objects, minimal neutral background, ideal for body composition analysis, professional portrait',
  backgroundBad: 'Fitness body scan bad example. Same shirtless man in gym shorts standing in a very cluttered busy room — a messy bedroom with visible bed, furniture, curtains, shelves with objects visible behind him, very distracting background, portrait photo',
  distanceGood: 'Fitness body scan reference photo. Full body shot of shirtless athletic man in gym shorts, standing 6 to 8 feet from camera, complete body perfectly framed from top of head to feet with slight margin at top and bottom, properly proportioned for body measurement, clean wall background, portrait',
  distanceBad: 'Fitness body scan bad example. Same man shirtless in gym shorts but standing far too close to camera, only chest and shoulders visible in frame, waist and legs completely cut off, severely over-cropped portrait, demonstrating wrong camera distance for body scan',
};

// Public CDN URL for pre-uploaded instruction images in Supabase Storage.
// Run scripts/seed-scan-instructions.js once to populate the bucket.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SCAN_INSTR_BUCKET_BASE = `${SUPABASE_URL}/storage/v1/object/public/scan-instructions`;

/**
 * Load all 8 body-scan instruction comparison images.
 * Priority order:
 *   1. Local file cache (instant — no network)
 *   2. Supabase Storage CDN  (fast — pre-uploaded static assets)
 *   3. fal.ai generation     (slow — only on first-ever run before seed)
 *
 * Call this on app start from _layout.tsx so images are cached before the
 * user ever opens the body-scan instruction screen.
 */
export async function generateScanInstrImages(
  onProgress?: (update: { key: keyof ScanInstrImages; uri: string }) => void,
): Promise<ScanInstrImages> {
  const empty: ScanInstrImages = {
    clothingGood: null, clothingBad: null,
    lightingGood: null, lightingBad: null,
    backgroundGood: null, backgroundBad: null,
    distanceGood: null, distanceBad: null,
  };

  // 1. Local file cache — all 8 files must exist
  try {
    const cached = await AsyncStorage.getItem(SCAN_INSTR_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as ScanInstrImages;
      const existsChecks = await Promise.all(
        (Object.keys(parsed) as (keyof ScanInstrImages)[]).map(async (k) => {
          const uri = parsed[k];
          if (!uri) return false;
          try { return (await FileSystem.getInfoAsync(uri)).exists; } catch { return false; }
        }),
      );
      if (existsChecks.every(Boolean)) {
        console.log('[SpiceStrong] scan instr images: loaded from local cache');
        return parsed;
      }
    }
  } catch { /* fall through */ }

  const result: ScanInstrImages = { ...empty };
  await ensureImageDir();
  const keys = Object.keys(SCAN_INSTR_PROMPTS) as (keyof ScanInstrImages)[];

  // 2. Supabase Storage — download pre-seeded static images in parallel
  if (SUPABASE_URL) {
    let supabaseOk = true;
    await Promise.all(
      keys.map(async (key) => {
        const remoteUrl = `${SCAN_INSTR_BUCKET_BASE}/${key}.jpg`;
        const localUri = await downloadImage(remoteUrl, `scan_instr_${key}.jpg`);
        if (localUri) {
          result[key] = localUri;
          onProgress?.({ key, uri: localUri });
        } else {
          supabaseOk = false;
        }
      }),
    );

    if (supabaseOk && keys.every((k) => result[k])) {
      console.log('[SpiceStrong] scan instr images: downloaded from Supabase Storage');
      try { await AsyncStorage.setItem(SCAN_INSTR_CACHE_KEY, JSON.stringify(result)); } catch { /* non-blocking */ }
      return result;
    }
    console.warn('[SpiceStrong] scan instr: some Supabase images missing, falling back to fal.ai');
  }

  // 3. fal.ai generation — last resort (before bucket is seeded)
  await Promise.all(
    keys.map(async (key) => {
      if (result[key]) return; // already loaded from Supabase
      const { url, error } = await callFal(SCAN_INSTR_PROMPTS[key], `scan-instr-${key}`, 'schnell');
      if (!url) { console.warn(`[SpiceStrong] scan instr ${key} fal.ai failed: ${error}`); return; }
      const localUri = await downloadImage(url, `scan_instr_${key}.jpg`);
      if (localUri) {
        result[key] = localUri;
        onProgress?.({ key, uri: localUri });
      }
    }),
  );

  try { await AsyncStorage.setItem(SCAN_INSTR_CACHE_KEY, JSON.stringify(result)); } catch { /* non-blocking */ }
  return result;
}

/**
 * Build a context-aware hero image prompt.
 * Includes visible ingredients, cuisine style, and expected presentation.
 */
function buildHeroPrompt(
  recipeName: string,
  ingredients: { name: string; quantity?: string }[],
): string {
  const HIDDEN = /oil|salt|pepper|water|spray|powder|paste|extract|sauce|vinegar/i;
  const visibleIngredients = ingredients
    .filter((i) => !HIDDEN.test(i.name))
    .slice(0, 4)
    .map((i) => i.name.toLowerCase())
    .join(', ');

  // Detect serving vessel from recipe name
  const nameLower = recipeName.toLowerCase();
  let vessel = 'on a plate';
  if (/curry|masala|tikka|dal|paneer|korma|vindaloo|butter|stew|soup|chili|ramen|pho/i.test(nameLower)) {
    vessel = 'in a bowl';
  } else if (/smoothie|shake|lassi/i.test(nameLower)) {
    vessel = 'in a glass';
  } else if (/wrap|burrito|roll|sandwich/i.test(nameLower)) {
    vessel = 'on a cutting board';
  } else if (/biryani|fried rice|pulao/i.test(nameLower)) {
    vessel = 'on a plate with raita on the side';
  }

  return `Award-winning food photography of "${recipeName}" — a finished, plated dish ${vessel}. The plate shows: ${visibleIngredients}. Shot from 45-degree overhead angle, dark ceramic plate, rustic wooden table. Natural window light with soft directional shadows. Steam gently rising. Fresh herb garnish on top. Vibrant, appetizing colors with visible texture — crispy edges, glistening oil, charred marks, melted cheese, fresh greens. Shallow depth of field, 85mm lens, Bon Appétit magazine quality. Photorealistic, not illustrated. No text, no logos, no watermarks, no hands.`;
}

/**
 * Build a context-aware step image prompt with progressive context.
 * Keeps prompts short and descriptive — Flux responds better to natural descriptions.
 */
function buildStepPrompt(
  recipeName: string,
  currentStep: { title?: string; description?: string; imagePrompt?: string },
  stepIndex: number,
  totalSteps: number,
  previousSteps: { title?: string; description?: string }[],
  ingredients: { name: string; quantity?: string }[],
): string {
  // If AI provided a short imagePrompt, use it directly (best quality)
  if (currentStep.imagePrompt) {
    return `Photorealistic cooking scene — Step ${stepIndex + 1} of ${totalSteps}.

What's happening: ${currentStep.imagePrompt}
Setting: Real home kitchen, warm natural window light, slightly cluttered counter. Overhead close-up angle, shallow depth of field.

The image must look like a real photograph — real food with natural imperfections, glistening oils, actual steam or sizzle if cooking. Warm color tones, slight grain. No digital art, no illustration, no text, no logos, no watermarks.`;
  }

  // Fallback: original detailed prompt with cookware detection
  const prevSummary = previousSteps.length > 0
    ? previousSteps.map((s, i) => `Step ${i + 1}: ${s.title || s.description?.slice(0, 50)}`).join('. ') + '.'
    : 'This is the first step.';

  const stepDesc = currentStep.description || currentStep.title || '';
  const mentionedIngredients = ingredients
    .filter((ing) => {
      const name = ing.name.toLowerCase();
      const desc = stepDesc.toLowerCase();
      return desc.includes(name.split('(')[0].trim().toLowerCase().split(' ').pop() || '');
    })
    .map((i) => `${i.quantity || ''} ${i.name}`.trim())
    .slice(0, 4);

  const ingredientContext = mentionedIngredients.length > 0
    ? `Ingredients visible: ${mentionedIngredients.join(', ')}.`
    : '';

  const hasPan = /pan|skillet|wok|sauté|fry/i.test(stepDesc);
  const hasPot = /pot|boil|simmer|stew|soup/i.test(stepDesc);
  const hasOven = /oven|bake|roast|broil/i.test(stepDesc);
  const hasCutting = /chop|dice|slice|mince|cut|trim/i.test(stepDesc);
  const hasMarinate = /marinate|season|rub|coat/i.test(stepDesc);
  const hasGarnish = /garnish|serve|plate|finish/i.test(stepDesc);

  let cookwareHint = 'on a wooden cutting board';
  if (hasPan) cookwareHint = 'in a dark cast iron skillet on a gas stove';
  else if (hasPot) cookwareHint = 'in a large stainless steel pot on the stove';
  else if (hasOven) cookwareHint = 'on a baking sheet going into the oven';
  else if (hasCutting) cookwareHint = 'on a wooden cutting board with a sharp chef knife';
  else if (hasMarinate) cookwareHint = 'in a glass bowl being mixed';
  else if (hasGarnish) cookwareHint = 'being plated on a dark ceramic dish';

  return `Photorealistic cooking scene — Step ${stepIndex + 1} of ${totalSteps} making "${recipeName}".

What's happening: ${currentStep.title || ''}. ${stepDesc}
${ingredientContext}
Previous steps completed: ${prevSummary}
Setting: ${cookwareHint}. Real home kitchen, warm natural window light, slightly cluttered counter. Overhead close-up angle, shallow depth of field.

The image must look like a real photograph — real food with natural imperfections, glistening oils, actual steam or sizzle if cooking. Warm color tones, slight grain. No digital art, no illustration, no text, no logos, no watermarks.`;
}

/**
 * Generate a hero image of the finished cooked dish.
 */
async function generateDishImage(
  recipeName: string,
  recipeId: string,
  ingredients: { name: string; quantity?: string }[],
): Promise<ImageResult> {
  try {
    const prompt = buildHeroPrompt(recipeName, ingredients);
    console.log(`[SpiceStrong] Generating dish hero image (dev): ${recipeName}`);

    const result = await callFal(prompt, `dish: ${recipeName}`, 'dev');
    if (!result.url) return { url: null, error: result.error };

    const fileName = `${recipeId}_dish.jpg`;
    const localUri = await downloadImage(result.url, fileName);

    console.log(`[SpiceStrong] Dish image: ${recipeName} -> ${localUri ? 'OK' : 'FAILED'}`);
    return { url: localUri };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Unknown error';
    console.error(`[SpiceStrong] Exception generating dish image:`, errMsg);
    return { url: null, error: errMsg };
  }
}

/**
 * Generate a context-aware image for a single cooking step.
 */
async function generateStepImage(
  recipeName: string,
  recipeId: string,
  stepIndex: number,
  totalSteps: number,
  currentStep: { title?: string; description?: string },
  previousSteps: { title?: string; description?: string }[],
  ingredients: { name: string; quantity?: string }[],
): Promise<ImageResult> {
  try {
    const prompt = buildStepPrompt(recipeName, currentStep, stepIndex, totalSteps, previousSteps, ingredients);
    console.log(`[SpiceStrong] Generating step image (schnell): Step ${stepIndex + 1} - ${currentStep.title}`);

    const result = await callFal(prompt, `step ${stepIndex + 1}: ${currentStep.title}`, 'schnell');
    if (!result.url) return { url: null, error: result.error };

    const fileName = `${recipeId}_step_${stepIndex}.jpg`;
    const localUri = await downloadImage(result.url, fileName);

    console.log(`[SpiceStrong] Step image: Step ${stepIndex + 1} -> ${localUri ? 'OK' : 'FAILED'}`);
    return { url: localUri };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Unknown error';
    console.error(`[SpiceStrong] Exception generating step image ${stepIndex + 1}:`, errMsg);
    return { url: null, error: errMsg };
  }
}

/**
 * Generate hero image + all step images for a recipe.
 * ~$0.003 per image (fal.ai flux/schnell).
 * Hero generated first (shown on card), steps generated in parallel batches of 3.
 */
export async function generateAllRecipeImages(
  recipe: {
    id?: string;
    name: string;
    ingredients: Record<string, { name: string; quantity?: string }[]>;
    steps: { title?: string; description?: string }[];
  },
): Promise<RecipeImageResults> {
  const recipeId = recipe.id ?? recipe.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const recipeName = recipe.name;
  const steps = recipe.steps ?? [];
  // Get the 2-3 servings ingredient list with quantities
  const ingredientList = recipe.ingredients?.['2-3 servings']
    ?? Object.values(recipe.ingredients ?? {})[0]
    ?? [];

  console.log(`[SpiceStrong] Generating images for: ${recipeName} (1 hero + ${steps.length} steps, ${ingredientList.length} ingredients)`);
  await ensureImageDir();

  // Generate hero image first — context-aware with visible ingredients
  const dishResult = await generateDishImage(recipeName, recipeId, ingredientList);

  // Generate step images with progressive context chain
  // Each step knows what happened before it for visual continuity
  const stepImages: Record<string, string | null> = {};
  for (let i = 0; i < steps.length; i += 3) {
    const batch = steps.slice(i, i + 3);
    const results = await Promise.all(
      batch.map((step, batchIdx) => {
        const stepIdx = i + batchIdx;
        const previousSteps = steps.slice(0, stepIdx);
        return generateStepImage(
          recipeName,
          recipeId,
          stepIdx,
          steps.length,
          step,
          previousSteps,
          ingredientList,
        );
      }),
    );
    results.forEach((result, batchIdx) => {
      stepImages[String(i + batchIdx)] = result.url;
    });
  }

  const stepCount = Object.values(stepImages).filter(Boolean).length;
  console.log(`[SpiceStrong] Image generation complete: dish=${dishResult.url ? 'OK' : 'FAILED'}, steps=${stepCount}/${steps.length}`);

  return { dishImage: dishResult.url, ingredientImages: {}, stepImages };
}

/**
 * Generate one replacement image for a specific recipe step.
 */
export async function generateSingleStepImage(
  recipe: {
    id?: string;
    name: string;
    ingredients: Record<string, { name: string; quantity?: string }[]>;
    steps: { title?: string; description?: string; imagePrompt?: string }[];
  },
  stepIndex: number,
): Promise<ImageResult> {
  const steps = recipe.steps ?? [];
  const step = steps[stepIndex];
  if (!step) return { url: null, error: 'Step not found' };

  const recipeId = recipe.id ?? recipe.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const ingredientList = recipe.ingredients?.['2-3 servings']
    ?? Object.values(recipe.ingredients ?? {})[0]
    ?? [];

  await ensureImageDir();
  return generateStepImage(
    recipe.name,
    recipeId,
    stepIndex,
    steps.length,
    step,
    steps.slice(0, stepIndex),
    ingredientList,
  );
}

/**
 * Save generated image local URIs to AsyncStorage, keyed by recipeId.
 */
export async function saveRecipeImages(recipeId: string, images: RecipeImageResults): Promise<void> {
  try {
    await AsyncStorage.setItem(`${AI_IMAGES_PREFIX}${recipeId}`, JSON.stringify(images));
    console.log(`[SpiceStrong] Saved image mappings for recipe: ${recipeId}`);
  } catch (e) {
    console.error('[SpiceStrong] Failed to save recipe images:', e);
  }
}

/**
 * Generate a single hero image for a restaurant food item (Food Order feature).
 * Uses flux/schnell for speed. Returns the remote URL or null on failure.
 */
export async function generateFoodItemImage(itemName: string, description: string): Promise<string | null> {
  const nameLower = itemName.toLowerCase();
  let vessel = 'on a plate';
  if (/curry|soup|ramen|pho|stew|chili|bowl/i.test(nameLower)) vessel = 'in a bowl';
  else if (/wrap|burrito|sandwich|roll/i.test(nameLower)) vessel = 'on a cutting board';
  else if (/smoothie|shake|drink|soda|juice/i.test(nameLower)) vessel = 'in a glass';
  const prompt = `Award-winning food photography of "${itemName}" — ${description}. Plated ${vessel}. Shot from 45-degree overhead angle, dark ceramic plate, rustic wooden table. Natural window light, soft shadows. Vibrant, appetizing colors, visible texture. Shallow depth of field. Bon Appétit magazine quality. Photorealistic, no text, no logos, no watermarks.`;
  const result = await callFal(prompt, `food order: ${itemName}`, 'schnell');
  return result.url;
}

/**
 * Load saved AI image local URIs from AsyncStorage for a given recipeId.
 */
export async function loadRecipeImages(recipeId: string): Promise<RecipeImageResults | null> {
  try {
    const data = await AsyncStorage.getItem(`${AI_IMAGES_PREFIX}${recipeId}`);
    if (!data) return null;
    return JSON.parse(data) as RecipeImageResults;
  } catch {
    return null;
  }
}
