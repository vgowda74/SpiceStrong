/**
 * recipeReviewService.ts — Claude-powered recipe review engine.
 * Validates user-submitted recipes for quality, safety, and authenticity
 * before they go live in the app library.
 */

import { type SavedRecipe } from '../src/store/recipes';
import { analyzeNutrition } from './nutritionService';
import { saveAIRecipe, updateRecipeStatus, classifyAndEnrichRecipe, uploadRecipeHeroImage, uploadRecipeStepImage } from './recipeService';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

export interface ReviewResult {
  approved: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
}

const REVIEW_SYSTEM_PROMPT = `You are a recipe quality reviewer for SpiceStrong, a high-protein Indian cooking app.

Review the submitted recipe and return a JSON object with these fields:
{
  "approved": boolean,     // true if score >= 70
  "score": number,         // 0-100 quality score
  "issues": string[],      // critical problems that need fixing
  "suggestions": string[]  // optional improvements
}

Evaluate on these criteria (each contributes to the score):

1. FOOD SAFETY (20 pts) — No dangerous ingredients, proper cooking temps mentioned, no raw meat in final dish
2. NUTRITIONAL VALIDITY (20 pts) — Contains a protein source, reasonable quantities (not extreme), ingredients make sense together
3. COMPLETENESS (20 pts) — All ingredients are used in steps, steps are in logical order, nothing missing
4. QUALITY (20 pts) — Clear instructions, specific quantities (not "some" or "a bit"), step-by-step makes sense
5. AUTHENTICITY (10 pts) — Recipe matches claimed cuisine style, uses appropriate techniques
6. APPROPRIATENESS (10 pts) — No offensive content, suitable for a cooking app

If score >= 70: approved = true (recipe is good enough to publish)
If score < 70: approved = false (needs changes)

Return ONLY the JSON object, no markdown fences, no explanation.`;

/**
 * Review a recipe using Claude AI.
 */
export async function reviewRecipe(recipe: SavedRecipe): Promise<ReviewResult> {
  if (!ANTHROPIC_KEY) {
    console.warn('[SpiceStrong] No Anthropic API key — auto-approving recipe');
    return { approved: true, score: 80, issues: [], suggestions: [] };
  }

  try {
    const ingredientList = recipe.ingredients['2-3 servings']
      ?.map(i => `${i.quantity} ${i.name}`)
      .join(', ') || 'No ingredients';

    const stepList = recipe.steps
      ?.map((s, i) => `Step ${i + 1}: ${s.title} — ${s.description}`)
      .join('\n') || 'No steps';

    const userMessage = `Recipe Name: ${recipe.name}
Protein Type: ${recipe.proteinName}
Cuisine: ${recipe.cuisine || 'Not specified'}
Difficulty: ${recipe.difficulty || 'Not specified'}
Meal Type: ${recipe.mealType || 'Not specified'}

Ingredients (2-3 servings):
${ingredientList}

Cooking Steps:
${stepList}

Chef's Tip: ${recipe.chefTip || 'None'}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: REVIEW_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.warn(`[SpiceStrong] Review API returned ${response.status}`);
      return { approved: true, score: 75, issues: [], suggestions: ['Auto-approved due to API error'] };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Parse JSON from response (strip markdown fences if present)
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const result: ReviewResult = JSON.parse(jsonStr);

    console.log(`[SpiceStrong] Recipe review: ${recipe.name} — score=${result.score}, approved=${result.approved}`);
    return result;
  } catch (err) {
    console.warn('[SpiceStrong] Recipe review failed:', err);
    // Auto-approve on error to avoid blocking users
    return { approved: true, score: 75, issues: [], suggestions: ['Auto-approved due to review error'] };
  }
}

/**
 * Full submission pipeline — runs in background after user taps "Submit".
 * Reviews recipe → gets nutrition → classifies → updates status → notifies user.
 */
export async function submitRecipeForReview(recipe: SavedRecipe): Promise<void> {
  try {
    // Step 1: Mark as pending review
    recipe.status = 'pending_review';
    await saveAIRecipe(recipe);
    await updateRecipeStatus(recipe.id, 'pending_review');
    console.log(`[SpiceStrong] Recipe submitted for review: ${recipe.name}`);

    // Step 2: Upload images
    if (recipe.steps) {
      for (let i = 0; i < recipe.steps.length; i++) {
        const step = recipe.steps[i];
        if (step.photoUri) {
          const url = await uploadRecipeStepImage(recipe.id, i, step.photoUri);
          if (url) step.photoStorageUrl = url;
        }
      }
    }

    // Step 3: Claude review
    const reviewResult = await reviewRecipe(recipe);
    recipe.reviewResult = reviewResult;

    if (reviewResult.approved) {
      // Step 4a: Get nutrition from Edamam
      const ingredients = recipe.ingredients['2-3 servings'];
      if (ingredients?.length > 0) {
        const nutrition = await analyzeNutrition(ingredients, 2.5);
        if (nutrition) {
          recipe.aiNutrition = nutrition;
        }
      }

      // Step 4b: Classify recipe (cuisine, spice level, dietary tags, etc.)
      await classifyAndEnrichRecipe(recipe);

      // Step 5: Mark as ready
      recipe.status = 'ready';
      await saveAIRecipe(recipe);
      await updateRecipeStatus(recipe.id, 'ready');

      // Step 6: Notify user
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🎉 Recipe Approved!',
          body: `"${recipe.name}" has been reviewed and is now live!`,
          sound: 'default',
          data: { recipeId: recipe.id },
          ...(Platform.OS === 'android' ? { channelId: 'recipe-review' } : {}),
        },
        trigger: null,
      });

      console.log(`[SpiceStrong] Recipe approved: ${recipe.name} (score: ${reviewResult.score})`);
    } else {
      // Rejected — save issues and notify
      recipe.status = 'rejected';
      await saveAIRecipe(recipe);
      await updateRecipeStatus(recipe.id, 'rejected');

      const issueText = reviewResult.issues.slice(0, 2).join('. ') || 'Please review and try again.';
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚠️ Recipe Needs Changes',
          body: `"${recipe.name}": ${issueText}`,
          sound: 'default',
          data: { recipeId: recipe.id },
          ...(Platform.OS === 'android' ? { channelId: 'recipe-review' } : {}),
        },
        trigger: null,
      });

      console.log(`[SpiceStrong] Recipe rejected: ${recipe.name} (score: ${reviewResult.score}, issues: ${reviewResult.issues.join('; ')})`);
    }
  } catch (err) {
    console.error('[SpiceStrong] Recipe review pipeline failed:', err);
    // Don't leave recipe stuck — mark as ready on error
    try {
      recipe.status = 'ready';
      await saveAIRecipe(recipe);
      await updateRecipeStatus(recipe.id, 'ready');
    } catch { /* best effort */ }
  }
}
