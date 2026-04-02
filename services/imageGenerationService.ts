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

      const submitData = await submitRes.json();

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

        const pollData = await pollRes.json();

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
 * Generate a hero image of the finished cooked dish.
 */
async function generateDishImage(recipeName: string, recipeId: string): Promise<ImageResult> {
  try {
    const prompt = `Award-winning food photography of ${recipeName}, beautifully plated on a ceramic dish, overhead angle, shallow depth of field, natural window light with soft shadows, steam rising from hot food, fresh herb garnish, vibrant colors, professional food styling, Bon Appétit magazine quality, 85mm lens, bokeh background with rustic wooden table. No text, no logos, no watermarks.`;

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
 * Generate an image for a single cooking step.
 */
async function generateStepImage(
  stepTitle: string,
  stepDescription: string,
  recipeName: string,
  recipeId: string,
  stepIndex: number,
): Promise<ImageResult> {
  try {
    const prompt = `Close-up food photography of cooking step: ${stepTitle}. ${stepDescription}. Making ${recipeName}. Real home kitchen, natural window light, hands working with actual ingredients, warm tones, shallow depth of field. No text, no logos.`;

    console.log(`[SpiceStrong] Generating step image (schnell): Step ${stepIndex + 1} - ${stepTitle}`);

    const result = await callFal(prompt, `step ${stepIndex + 1}: ${stepTitle}`, 'schnell');
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

  console.log(`[SpiceStrong] Generating images for: ${recipeName} (1 hero + ${steps.length} steps)`);
  getImageDir();

  // Generate hero image first (critical — shows on recipe card)
  const dishResult = await generateDishImage(recipeName, recipeId);

  // Generate step images in parallel batches of 3
  const stepImages: Record<string, string | null> = {};
  for (let i = 0; i < steps.length; i += 3) {
    const batch = steps.slice(i, i + 3);
    const results = await Promise.all(
      batch.map((step, batchIdx) => {
        const stepIdx = i + batchIdx;
        const title = step.title || `Step ${stepIdx + 1}`;
        const desc = step.description || title;
        return generateStepImage(title, desc, recipeName, recipeId, stepIdx);
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
