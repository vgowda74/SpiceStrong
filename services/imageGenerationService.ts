/**
 * imageGenerationService.ts — SpiceStrong
 * Generates AI images for recipe dish hero using fal.ai flux/schnell.
 * Downloads images to local file system for persistence.
 * Stores local file URI mappings in AsyncStorage keyed by recipeId.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths, File, Directory } from 'expo-file-system';

const FAL_KEY = process.env.EXPO_PUBLIC_FAL_KEY || process.env.FAL_KEY;
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

/** Get or create the local image directory. */
function getImageDir(): Directory {
  const dir = new Directory(Paths.document, IMAGE_DIR_NAME);
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

/**
 * Download an image from a remote URL to local file system.
 * Returns the local file URI, or null on failure.
 */
async function downloadImage(remoteUrl: string, localFileName: string): Promise<string | null> {
  try {
    const dir = getImageDir();
    const destination = new File(dir, localFileName);
    if (destination.exists) {
      destination.delete();
    }
    const downloaded = await File.downloadFileAsync(remoteUrl, destination);
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
const FAL_MODEL_PATHS: Record<FalModel, string> = {
  schnell: 'fal-ai/flux/schnell',
  dev: 'fal-ai/flux/dev',
};

async function callFal(prompt: string, label: string, model: FalModel = 'schnell'): Promise<{ url: string | null; error?: string }> {
  if (!FAL_KEY) return { url: null, error: 'No FAL_KEY set' };

  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[SpiceStrong] fal.ai request for "${label}" (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);

      // Submit to queue
      const submitRes = await fetch(`https://queue.fal.run/${FAL_MODEL_PATHS[model]}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${FAL_KEY}`,
        },
        body: JSON.stringify({
          prompt,
          image_size: 'square_hd',
          num_images: 1,
          enable_safety_checker: false,
        }),
      });

      if (!submitRes.ok) {
        const err = await submitRes.text().catch(() => '');
        console.warn(`[SpiceStrong] fal.ai submit error ${submitRes.status}: ${err}`);
        if (submitRes.status === 429 && attempt < MAX_RETRIES) {
          await delay(5000);
          continue;
        }
        return { url: null, error: `fal.ai ${submitRes.status}` };
      }

      let submitData;
      try { submitData = await submitRes.json(); } catch { return { url: null, error: 'Invalid response from fal.ai' }; }

      // If response has images directly (synchronous response)
      if (submitData.images?.[0]?.url) {
        console.log(`[SpiceStrong] fal.ai instant response for "${label}"`);
        return { url: submitData.images[0].url };
      }

      // Queue-based: poll for result
      const responseUrl = submitData.response_url;
      if (!responseUrl) {
        return { url: null, error: 'No response_url from fal.ai' };
      }

      // Poll for up to 60 seconds
      const maxWait = 60000;
      const pollInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        await delay(pollInterval);
        const pollRes = await fetch(responseUrl, {
          headers: { Authorization: `Key ${FAL_KEY}` },
        });

        if (!pollRes.ok) {
          const err = await pollRes.text().catch(() => '');
          console.warn(`[SpiceStrong] fal.ai poll error ${pollRes.status}: ${err}`);
          continue;
        }

        let pollData;
        try { pollData = await pollRes.json(); } catch { continue; }

        if (pollData.images?.[0]?.url) {
          console.log(`[SpiceStrong] fal.ai success for "${label}"`);
          return { url: pollData.images[0].url };
        }

        // Still processing
        if (pollData.status === 'IN_QUEUE' || pollData.status === 'IN_PROGRESS') {
          continue;
        }

        // Failed
        if (pollData.status === 'COMPLETED' && !pollData.images?.[0]?.url) {
          return { url: null, error: 'No image in completed response' };
        }
      }

      return { url: null, error: 'Timed out waiting for fal.ai (60s)' };
    } catch (networkErr) {
      const errMsg = networkErr instanceof Error ? networkErr.message : 'Network error';
      console.warn(`[SpiceStrong] Network error for "${label}": ${errMsg}`);
      if (attempt < MAX_RETRIES) {
        await delay(3000);
        continue;
      }
      return { url: null, error: errMsg };
    }
  }
  return { url: null, error: 'Max retries exceeded' };
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
  if (!FAL_KEY) {
    console.warn('[SpiceStrong] FAL_KEY is not set — skipping image generation');
    return { dishImage: null, ingredientImages: {}, stepImages: {} };
  }

  const recipeId = recipe.id ?? recipe.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const recipeName = recipe.name;
  const steps = recipe.steps ?? [];
  // Get the 2-3 servings ingredient list with quantities
  const ingredientList = recipe.ingredients?.['2-3 servings']
    ?? Object.values(recipe.ingredients ?? {})[0]
    ?? [];

  console.log(`[SpiceStrong] Generating images for: ${recipeName} (1 hero + ${steps.length} steps, ${ingredientList.length} ingredients)`);
  getImageDir();

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
  if (!FAL_KEY) {
    console.warn('[SpiceStrong] FAL_KEY is not set - skipping step image generation');
    return { url: null, error: 'No FAL_KEY set' };
  }

  const steps = recipe.steps ?? [];
  const step = steps[stepIndex];
  if (!step) return { url: null, error: 'Step not found' };

  const recipeId = recipe.id ?? recipe.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const ingredientList = recipe.ingredients?.['2-3 servings']
    ?? Object.values(recipe.ingredients ?? {})[0]
    ?? [];

  getImageDir();
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
