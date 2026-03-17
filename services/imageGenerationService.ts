/**
 * imageGenerationService.ts — SpiceStrong
 * Generates AI images for recipe dish hero and cooking steps using OpenAI DALL-E 3.
 * Downloads images to local file system so they persist beyond DALL-E URL expiry.
 * Stores local file URI mappings in AsyncStorage keyed by recipeId.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths, File, Directory } from 'expo-file-system';

const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_KEY;
const AI_IMAGES_PREFIX = 'spicestrong_ai_images_';
const IMAGE_DIR_NAME = 'ai_recipe_images';

/** Delay helper to respect DALL-E rate limits (5 images/min for Tier 1). */
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
 * Call DALL-E 3 API with automatic retry on rate-limit (429) and server errors (5xx).
 */
async function callDallE(prompt: string, label: string): Promise<{ url: string | null; error?: string }> {
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[SpiceStrong] DALL-E request for "${label}" (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
        }),
      });

      const data = await response.json();

      if (response.status === 429 || response.status >= 500) {
        const reason = response.status === 429 ? 'Rate limited' : `Server error (${response.status})`;
        console.warn(`[SpiceStrong] ${reason} for "${label}". Waiting 15s...`);
        if (attempt < MAX_RETRIES) {
          await delay(15000);
          continue;
        }
        return { url: null, error: data.error?.message ?? reason };
      }

      if (!response.ok) {
        const errMsg = data.error?.message ?? 'Image generation failed';
        console.error(`[SpiceStrong] DALL-E error for "${label}":`, errMsg);
        return { url: null, error: errMsg };
      }

      const remoteUrl = data.data?.[0]?.url;
      if (!remoteUrl) {
        return { url: null, error: 'No URL in response' };
      }
      console.log(`[SpiceStrong] DALL-E success for "${label}"`);
      return { url: remoteUrl };
    } catch (networkErr) {
      const errMsg = networkErr instanceof Error ? networkErr.message : 'Network error';
      console.warn(`[SpiceStrong] Network error for "${label}": ${errMsg}. Waiting 10s before retry...`);
      if (attempt < MAX_RETRIES) {
        await delay(10000);
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
    const prompt = `A real photograph taken by a professional food photographer of ${recipeName} served on a rustic plate. The photo looks like it belongs in Bon Appétit magazine. Natural daylight from a window, slight shadows, imperfect plating that looks authentic and homemade. The food has real texture — you can see the oil glistening, crispy edges, char marks, and natural color variations. Shot on 35mm film with slight grain. Absolutely no digital art, no illustration, no CGI. No text, no logos.`;

    console.log(`[SpiceStrong] Generating dish hero image: ${recipeName}`);

    const result = await callDallE(prompt, `dish: ${recipeName}`);
    if (!result.url) return { url: null, error: result.error };

    const fileName = `${recipeId}_dish.png`;
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
 * Generate an image for a single cooking step using DALL-E 3.
 */
async function generateStepImage(
  stepTitle: string,
  stepDescription: string,
  recipeName: string,
  recipeId: string,
  stepIndex: number,
): Promise<ImageResult> {
  try {
    const prompt = `A real photograph of someone cooking: ${stepTitle}. ${stepDescription}. Making ${recipeName}. The photo looks like it was taken casually in a real home kitchen — natural window light, slightly messy countertop, real cookware with wear marks, actual food with natural imperfections. You can see real hands working. The image has the warmth and grain of a 35mm film photo. Absolutely no digital art, no illustration, no CGI. No text, no logos.`;

    console.log(`[SpiceStrong] Generating step image: Step ${stepIndex + 1} - ${stepTitle}`);

    const result = await callDallE(prompt, `step ${stepIndex + 1}: ${stepTitle}`);
    if (!result.url) return { url: null, error: result.error };

    const fileName = `${recipeId}_step_${stepIndex}.png`;
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
 * Generate only the dish hero image for a recipe card.
 * ~$0.04 per recipe (standard quality DALL-E 3).
 */
export async function generateAllRecipeImages(
  recipe: {
    id?: string;
    name: string;
    ingredients: Record<string, { name: string; quantity?: string }[]>;
    steps: { title?: string; description?: string }[];
  },
): Promise<RecipeImageResults> {
  if (!OPENAI_KEY) {
    console.warn('[SpiceStrong] EXPO_PUBLIC_OPENAI_KEY is not set — skipping image generation');
    return { dishImage: null, ingredientImages: {}, stepImages: {} };
  }

  const recipeId = recipe.id ?? recipe.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const recipeName = recipe.name;

  console.log(`[SpiceStrong] Generating dish hero image for: ${recipeName}`);
  getImageDir();

  const dishResult = await generateDishImage(recipeName, recipeId);
  console.log(`[SpiceStrong] Image generation complete: dish=${dishResult.url ? 'OK' : 'FAILED'}`);

  return { dishImage: dishResult.url, ingredientImages: {}, stepImages: {} };
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
