import { generateSingleStepImage, loadRecipeImages, saveRecipeImages } from './imageGenerationService';
import {
  adminUpdateRecipeSteps,
  setCachedRecipeStepImageUrl,
  uploadRecipeStepImage,
} from './recipeService';
import { isAdmin } from './adminService';
import { saveRecipe as saveLocalRecipe, type CookingStep, type SavedRecipe } from '../src/store/recipes';
import { invokeAnthropicMessages } from './anthropicService';

export type AdminRecipeFixMode = 'instructions' | 'image' | 'both';

export interface AdminRecipeFixResult {
  recipe: SavedRecipe;
  localImageUri?: string | null;
  publicImageUrl?: string | null;
}

interface ClaudeStepFix {
  title?: string;
  description?: string;
  tip?: string;
  timerMinutes?: number;
  ingredientsUsed?: string;
  cookingMethod?: string;
  imagePrompt?: string;
}

function extractJsonObject(text: string): string {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Claude did not return JSON');
  return stripped.slice(start, end + 1);
}

function sanitizeStepFix(raw: ClaudeStepFix, current: CookingStep): CookingStep {
  return {
    ...current,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : current.title,
    description: typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim()
      : current.description,
    tip: typeof raw.tip === 'string' ? raw.tip.trim() || undefined : current.tip,
    timerMinutes: typeof raw.timerMinutes === 'number' && raw.timerMinutes >= 0
      ? Math.round(raw.timerMinutes)
      : current.timerMinutes,
    ingredientsUsed: typeof raw.ingredientsUsed === 'string'
      ? raw.ingredientsUsed.trim() || undefined
      : current.ingredientsUsed,
    cookingMethod: typeof raw.cookingMethod === 'string'
      ? raw.cookingMethod.trim() || undefined
      : current.cookingMethod,
    imagePrompt: typeof raw.imagePrompt === 'string'
      ? raw.imagePrompt.trim() || undefined
      : (current as CookingStep & { imagePrompt?: string }).imagePrompt,
  } as CookingStep;
}

async function fixStepWithClaude(
  recipe: SavedRecipe,
  stepIndex: number,
  issue: string,
): Promise<CookingStep> {
  const current = recipe.steps[stepIndex];
  if (!current) throw new Error('Step not found');

  const ingredients = recipe.ingredients['2-3 servings'] ?? [];
  const prompt = `Fix one recipe step for SpiceStrong.

Recipe: ${recipe.name}
Step number: ${stepIndex + 1} of ${recipe.steps.length}
Admin reported issue: ${issue}

Recipe ingredients:
${ingredients.map((item) => `- ${item.quantity ? `${item.quantity} ` : ''}${item.name}`).join('\n')}

Current step:
Title: ${current.title}
Description: ${current.description}
Tip: ${current.tip ?? ''}
Timer minutes: ${current.timerMinutes ?? ''}
Ingredients used: ${current.ingredientsUsed ?? ''}
Cooking method: ${current.cookingMethod ?? ''}

Return ONLY JSON with this shape:
{
  "title": "short clear step title",
  "description": "corrected cooking instruction, specific and safe",
  "tip": "optional concise helpful tip",
  "timerMinutes": 0,
  "ingredientsUsed": "comma-separated ingredients used in this step",
  "cookingMethod": "optional cooking method",
  "imagePrompt": "short visual description for a photorealistic replacement step image"
}`;

  const data = await invokeAnthropicMessages({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    messages: [{ role: 'user', content: prompt }],
  });
  const rawText = String(data.content?.[0]?.text ?? '');
  const parsed = JSON.parse(extractJsonObject(rawText)) as ClaudeStepFix;
  return sanitizeStepFix(parsed, current);
}

export async function fixRecipeStepAsAdmin(
  recipe: SavedRecipe,
  stepIndex: number,
  issue: string,
  mode: AdminRecipeFixMode,
): Promise<AdminRecipeFixResult> {
  if (!issue.trim()) throw new Error('Describe what is incorrect first');
  if (!(await isAdmin())) throw new Error('Admin access required');

  const current = recipe.steps[stepIndex];
  if (!current) throw new Error('Step not found');

  let updatedRecipe = recipe;
  if (mode === 'instructions' || mode === 'both') {
    const fixedStep = await fixStepWithClaude(recipe, stepIndex, issue.trim());
    const steps = recipe.steps.map((step, index) => index === stepIndex ? fixedStep : step);
    updatedRecipe = { ...recipe, steps };
    await adminUpdateRecipeSteps(recipe.id, recipe.proteinId, steps);
    await saveLocalRecipe(updatedRecipe);
  } else if (mode === 'image') {
    const fixedStep = await fixStepWithClaude(recipe, stepIndex, issue.trim());
    const imagePrompt = (fixedStep as CookingStep & { imagePrompt?: string }).imagePrompt;
    if (imagePrompt) {
      const steps = recipe.steps.map((step, index) => (
        index === stepIndex ? ({ ...step, imagePrompt } as CookingStep) : step
      ));
      updatedRecipe = { ...recipe, steps };
    }
  }

  let localImageUri: string | null | undefined;
  let publicImageUrl: string | null | undefined;
  if (mode === 'image' || mode === 'both') {
    const imageResult = await generateSingleStepImage(updatedRecipe, stepIndex);
    if (!imageResult.url) {
      throw new Error(imageResult.error || 'Could not generate replacement image');
    }

    localImageUri = imageResult.url;
    publicImageUrl = await uploadRecipeStepImage(recipe.id, stepIndex, localImageUri);
    if (!publicImageUrl) throw new Error('Generated image, but upload to Supabase failed');

    await setCachedRecipeStepImageUrl(recipe.id, stepIndex, publicImageUrl);
    const existingImages = await loadRecipeImages(recipe.id);
    await saveRecipeImages(recipe.id, {
      dishImage: existingImages?.dishImage ?? null,
      ingredientImages: existingImages?.ingredientImages ?? {},
      stepImages: {
        ...(existingImages?.stepImages ?? {}),
        [String(stepIndex)]: localImageUri,
      },
    });
  }

  return { recipe: updatedRecipe, localImageUri, publicImageUrl };
}
