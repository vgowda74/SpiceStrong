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
 * Build a context-aware hero image prompt.
 * Includes visible ingredients, cuisine style, and expected presentation.
 */
function buildHeroPrompt(
  recipeName: string,
  ingredients: { name: string; quantity?: string }[],
): string {
  // Extract key visible ingredients for the final dish (skip oils, salt, water, spices)
  const HIDDEN = /oil|salt|pepper|water|spray|powder|paste|extract|sauce|vinegar/i;
  const visibleIngredients = ingredients
    .filter((i) => !HIDDEN.test(i.name))
    .slice(0, 6)
    .map((i) => i.name.toLowerCase())
    .join(', ');

  return `Award-winning food photography of "${recipeName}" — a finished, plated dish. The plate shows: ${visibleIngredients}. Shot from 45-degree overhead angle on a dark ceramic plate, rustic wooden table. Natural window light with soft directional shadows. Steam gently rising. Fresh herb garnish on top. Vibrant, appetizing colors with visible texture — crispy edges, glistening oil, charred marks, melted cheese, fresh greens. Shallow depth of field, 85mm lens, Bon Appétit magazine quality. Photorealistic, not illustrated. No text, no logos, no watermarks, no hands.`;
}

/**
 * Build a context-aware step image prompt with progressive context.
 * Each step knows what happened before it for visual continuity.
 */
function buildStepPrompt(
  recipeName: string,
  currentStep: { title?: string; description?: string },
  stepIndex: number,
  totalSteps: number,
  previousSteps: { title?: string; description?: string }[],
  ingredients: { name: string; quantity?: string }[],
): string {
  const stepDesc = currentStep.description || currentStep.title || '';

  // Extract specific ingredients WITH quantities mentioned in this step
  const mentionedIngredients = ingredients
    .filter((ing) => {
      const words = ing.name.toLowerCase().split(/[\s(]/);
      return words.some((w) => w.length > 2 && stepDesc.toLowerCase().includes(w));
    })
    .map((i) => `${i.quantity || ''} ${i.name}`.trim())
    .slice(0, 5);

  // Detect the physical state of food at this step
  const descLower = stepDesc.toLowerCase();

  // Detect cut sizes explicitly
  let cutSize = '';
  if (/small.*piece|cube|dice|1.inch|bite.size/i.test(stepDesc)) cutSize = 'cut into small 1-inch cubes';
  else if (/strip|julienne|thin.*slice/i.test(stepDesc)) cutSize = 'cut into thin strips';
  else if (/large.*piece|chunk|quarter/i.test(stepDesc)) cutSize = 'in large chunks';
  else if (/mince|fine.*chop/i.test(stepDesc)) cutSize = 'finely minced';
  else if (/slice/i.test(stepDesc)) cutSize = 'sliced into even pieces';

  // Detect cooking state
  let cookingState = '';
  if (/golden.brown|brown|carameliz/i.test(stepDesc)) cookingState = 'golden brown and caramelized';
  else if (/crispy|crisp|crunchy/i.test(stepDesc)) cookingState = 'crispy and golden with visible char marks';
  else if (/tender|soft|translucent/i.test(stepDesc)) cookingState = 'softened and translucent';
  else if (/boil|bubble/i.test(stepDesc)) cookingState = 'bubbling with visible steam';
  else if (/simmer/i.test(stepDesc)) cookingState = 'gently simmering with small bubbles';
  else if (/marinate|coat|rub/i.test(stepDesc)) cookingState = 'being coated evenly with the marinade/seasoning';
  else if (/raw|fresh|uncooked/i.test(stepDesc)) cookingState = 'fresh and raw';

  // Detect cookware
  let cookware = '';
  if (/pan|skillet|wok|sauté|stir.fry/i.test(stepDesc)) cookware = 'dark cast iron skillet on gas stove, oil shimmering';
  else if (/pot|boil|simmer|stew|broth/i.test(stepDesc)) cookware = 'large stainless steel pot on the stove';
  else if (/oven|bake|roast|broil|sheet/i.test(stepDesc)) cookware = 'rimmed baking sheet lined with parchment paper';
  else if (/grill/i.test(stepDesc)) cookware = 'hot grill grates with visible char lines';
  else if (/chop|dice|slice|mince|cut|peel/i.test(stepDesc)) cookware = 'wooden cutting board with a sharp chef knife';
  else if (/mix|whisk|stir|combine|toss/i.test(stepDesc)) cookware = 'large glass mixing bowl';
  else if (/marinate|season/i.test(stepDesc)) cookware = 'glass bowl with the food being coated';
  else if (/serve|plate|garnish|finish/i.test(stepDesc)) cookware = 'dark ceramic plate being plated';
  else cookware = 'clean kitchen counter with prep area';

  // Build accumulated context from ALL previous steps with full descriptions
  // This ensures step 6 knows exactly what the food should look like from steps 1-5
  const prevContext = previousSteps.length > 0
    ? 'PREVIOUS STEPS (food should reflect the cumulative result of all these):\n' +
      previousSteps.map((s, i) => {
        const desc = s.description || s.title || '';
        // Extract key visual transformations from each step
        const visual = desc.length > 100 ? desc.slice(0, 100) + '...' : desc;
        return `  Step ${i + 1}: ${s.title || 'Prep'} — ${visual}`;
      }).join('\n') +
      '\nThe pan/plate should show the ACCUMULATED result of ALL above steps — not just the current step.'
    : '';

  return `Photorealistic food photography — Step ${stepIndex + 1} of ${totalSteps} for "${recipeName}".

SCENE: ${stepDesc}
${mentionedIngredients.length > 0 ? `EXACT INGREDIENTS VISIBLE: ${mentionedIngredients.join(', ')}` : ''}
${cutSize ? `FOOD SIZE/CUT: The food is ${cutSize} — this MUST be visually accurate` : ''}
${cookingState ? `COOKING STATE: The food looks ${cookingState}` : ''}
COOKWARE: ${cookware}
${prevContext}

CRITICAL VISUAL RULES:
- If the step says "cut into small cubes" the image MUST show small 1-inch cubes, NOT large pieces
- If the step says "golden brown" the food MUST look golden brown, not raw
- Quantities must match: "500g chicken" should look like a substantial amount, not a tiny piece
- Show realistic portion sizes matching the quantities listed
- Overhead 45-degree angle, natural window light, warm tones
- Real photograph look — oil glistening, steam if hot, natural food imperfections
- No text, no logos, no watermarks, no illustrated/cartoon style`;
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
