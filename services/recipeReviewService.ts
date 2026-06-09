/**
 * recipeReviewService.ts — Claude-powered recipe validation engine.
 *
 * Two-phase validation:
 * Phase 1: Recipe Quality Review (text-based)
 *   - Enforces SpiceBuilder prompt constraints (ingredient limits, step limits, quantity precision, etc.)
 *   - Validates nutrition targets, protein density, calorie ceilings
 *   - Checks authenticity and safety
 * Phase 2: Image Verification (vision-based)
 *   - Uses Claude Vision to verify each step photo matches the step instruction
 *   - Checks hero image matches the finished dish
 */

import { type SavedRecipe } from '../src/store/recipes';
import { analyzeNutrition } from './nutritionService';
import { saveAIRecipe, updateRecipeStatus, classifyAndEnrichRecipe, uploadRecipeHeroImage, uploadRecipeStepImage } from './recipeService';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { File } from 'expo-file-system';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
const NOTIFICATIONS_AVAILABLE = Constants.appOwnership !== 'expo';

export interface ReviewResult {
  approved: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
}

export interface ImageVerification {
  stepIndex: number;
  matches: boolean;
  confidence: 'high' | 'medium' | 'low';
  issue?: string;
}

// ════════════════════════════════════════
// PHASE 1: RECIPE QUALITY REVIEW
// ════════════════════════════════════════

const REVIEW_SYSTEM_PROMPT = `You are the SpiceStrong Recipe Quality Engine — a strict validator that enforces
competition-grade recipe standards for a high-protein fitness cooking app.

Review the submitted recipe against EVERY rule below. Return a JSON object.

════════════════════════════════════════
VALIDATION RULES — CHECK EACH ONE
════════════════════════════════════════

INGREDIENT RULES (15 pts)
□ Maximum 15 ingredients total (count every item including oil, salt, water)
□ Every ingredient has a precise quantity — NO "to taste", "some", "a handful", "as needed", "a pinch", "few", "optional", "roughly", "about"
□ 4-6 serving quantities are exactly 2× the 2-3 serving quantities
□ No duplicate ingredients

STEP RULES (15 pts)
□ Minimum 4 steps, maximum 8 steps
□ Each step is a meaningful cooking action (not "serve on a plate" or "enjoy")
□ Steps are in logical cooking order (prep → cook → finish)
□ Every ingredient is used in at least one step
□ No ingredient appears in steps but not in the ingredient list

NUTRITION RULES (25 pts)
□ Protein per serving meets meal type floor:
  - breakfast: >= 15g
  - lunch_dinner: >= 30g
  - snack_dessert: >= 12g
□ Protein density: proteinG / calories * 100 >= 6.4
□ Calorie ceiling per serving:
  - breakfast: <= 500
  - lunch_dinner: <= 700
  - snack_dessert: <= 350
□ Nutrition values are realistic for the ingredients listed (not inflated)

COOK TIME RULES (10 pts)
□ Total cook time matches difficulty:
  - Easy: 15–35 minutes
  - Medium: 25–50 minutes
  - Hard: 40–90 minutes (slow-cook dishes like nihari, rogan josh, biryani can exceed 90 min)
□ Easy/Medium must NEVER exceed 60 minutes

FOOD SAFETY (15 pts)
□ No dangerous ingredients or unsafe cooking instructions
□ Proper cooking temperatures implied (chicken fully cooked, etc.)
□ Raw protein is not served raw in the final dish
□ Marination includes acid or salt for safety

DESCRIPTION QUALITY (10 pts)
□ Description is 1-2 sentences
□ Description mentions the protein name
□ Description accurately represents what the recipe is (not misleading)

STEP-INGREDIENT ACCURACY (15 pts) — MOST CRITICAL
□ For EACH step: every ingredient in ingredientsUsed is actually mentioned in the step description
□ For EACH step: the description includes the QUANTITY of each ingredient mentioned
□ No ingredient in ingredientsUsed appears in a step where it's not actually used
□ Every ingredient from the ingredient list appears in at least one step's ingredientsUsed
□ No orphaned ingredients (in the list but never referenced in any step)

AUTHENTICITY & QUALITY (10 pts)
□ Recipe matches claimed cuisine style
□ Spice ratios are reasonable for the cuisine
□ Instructions are clear with visual doneness cues ("until golden brown", "until oil separates")
□ Chef tip is specific to this dish, not generic
□ No offensive or inappropriate content

════════════════════════════════════════
SCORING
════════════════════════════════════════

- Score each section, total out of 100
- If score >= 70: approved = true
- If score < 70: approved = false
- List EVERY failed check in "issues"
- List improvement ideas in "suggestions"

Return ONLY this JSON (no markdown, no preamble):
{
  "approved": boolean,
  "score": number,
  "issues": ["string — each failed rule with specific detail"],
  "suggestions": ["string — optional improvements"]
}`;

/**
 * Local pre-validation — catches obvious issues before sending to Claude.
 * Returns issues array (empty = passed).
 */
function localValidation(recipe: SavedRecipe): string[] {
  const issues: string[] = [];
  const ingredients = recipe.ingredients?.['2-3 servings'] || [];
  const ingredientsLarge = recipe.ingredients?.['4-6 servings'] || [];
  const steps = recipe.steps || [];

  // Ingredient count
  if (ingredients.length > 15) {
    issues.push(`Too many ingredients: ${ingredients.length} (max 15)`);
  }
  if (ingredients.length === 0) {
    issues.push('No ingredients provided');
  }

  // Step count
  if (steps.length < 4) {
    issues.push(`Too few steps: ${steps.length} (min 4)`);
  }
  if (steps.length > 8) {
    issues.push(`Too many steps: ${steps.length} (max 8)`);
  }

  // Quantity precision — check for banned phrases
  const BANNED = /\b(to taste|some|a handful|as needed|a pinch|few|adjust|optional|roughly|about|approximately)\b/i;
  for (const ing of ingredients) {
    if (BANNED.test(ing.quantity) || BANNED.test(ing.name)) {
      issues.push(`Vague quantity: "${ing.quantity} ${ing.name}" — must be precise`);
    }
    if (!ing.quantity || ing.quantity.trim() === '') {
      issues.push(`Missing quantity for: "${ing.name}"`);
    }
  }

  // 4-6 serving tier exists and has same count
  if (ingredientsLarge.length > 0 && ingredientsLarge.length !== ingredients.length) {
    issues.push(`4-6 serving tier has ${ingredientsLarge.length} ingredients but 2-3 tier has ${ingredients.length}`);
  }

  // Cook time by difficulty
  const time = recipe.timeMinutes ?? 0;
  const diff = recipe.difficulty?.toLowerCase();
  if (diff === 'easy' && time > 35) {
    issues.push(`Easy recipe too long: ${time}min (max 35)`);
  }
  if (diff === 'hard' && time < 40) {
    issues.push(`Hard recipe too short: ${time}min (min 40)`);
  }
  // 60min+ allowed for Hard difficulty (slow-cook recipes)
  if (diff !== 'hard' && time > 60) {
    issues.push(`Cook time exceeds 60 min for ${recipe.difficulty || 'Easy/Medium'}: ${time}min — only Hard recipes can exceed 60 min`);
  }

  // Description validation
  const desc = recipe.description || '';
  if (!desc || desc.trim().length < 10) {
    issues.push('Missing or too short description');
  } else {
    const proteinName = (recipe.proteinName || '').toLowerCase();
    if (proteinName && !desc.toLowerCase().includes(proteinName.toLowerCase())) {
      issues.push(`Description doesn't mention the protein "${recipe.proteinName}"`);
    }
  }

  // ingredientsUsed accuracy — cross-check with step descriptions
  const ingredientNames = ingredients.map(i => (i.name || '').toLowerCase().split('(')[0].trim());
  const usedInAnyStep = new Set<string>();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepDesc = (step.description || '').toLowerCase();
    const usedRaw = step.ingredientsUsed || '';
    const usedList = usedRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    if (usedList.length === 0 && stepDesc.length > 20) {
      // Check if description mentions ingredients but ingredientsUsed is empty
      const mentionedIngredients = ingredientNames.filter(name =>
        name.length > 2 && stepDesc.includes(name)
      );
      if (mentionedIngredients.length > 0) {
        issues.push(`Step ${i + 1} "${step.title}": ingredientsUsed is empty but description mentions: ${mentionedIngredients.join(', ')}`);
      }
    }

    // Check if ingredientsUsed items are mentioned in description
    for (const used of usedList) {
      usedInAnyStep.add(used);
      // Fuzzy check: does description mention this ingredient?
      const baseWords = used.split(' ').filter(w => w.length > 2);
      const mentioned = baseWords.some(w => stepDesc.includes(w));
      if (!mentioned && used.length > 2) {
        issues.push(`Step ${i + 1} "${step.title}": lists "${used}" in ingredientsUsed but description doesn't mention it`);
      }
    }
  }

  // Check for orphaned ingredients (in list but never used in any step)
  for (const ingName of ingredientNames) {
    if (ingName.length < 3) continue; // skip very short names
    const baseWords = ingName.split(' ').filter(w => w.length > 2);
    const usedSomewhere = [...usedInAnyStep].some(used => {
      return baseWords.some(w => used.includes(w)) || used.split(' ').some(w => ingName.includes(w));
    });
    if (!usedSomewhere) {
      issues.push(`Ingredient "${ingName}" is in the ingredient list but never appears in any step's ingredientsUsed`);
    }
  }

  return issues;
}

/**
 * Review a recipe using Claude AI + local validation.
 */
export async function reviewRecipe(recipe: SavedRecipe): Promise<ReviewResult> {
  // Phase 1a: Local validation (fast, free)
  const localIssues = localValidation(recipe);

  if (!ANTHROPIC_KEY) {
    console.warn('[SpiceStrong] No Anthropic API key — local validation only');
    const passed = localIssues.length === 0;
    return {
      approved: passed,
      score: passed ? 80 : 50,
      issues: localIssues,
      suggestions: [],
    };
  }

  // Phase 1b: Claude validation (thorough)
  try {
    const ingredientList = recipe.ingredients['2-3 servings']
      ?.map(i => `${i.quantity} ${i.name}`)
      .join('\n  ') || 'No ingredients';

    const ingredientListLarge = recipe.ingredients['4-6 servings']
      ?.map(i => `${i.quantity} ${i.name}`)
      .join('\n  ') || 'Not provided';

    const stepList = recipe.steps
      ?.map((s, i) => `Step ${i + 1}: ${s.title}\n  ${s.description}\n  Ingredients used: ${s.ingredientsUsed || 'not specified'}\n  Timer: ${s.timerMinutes ?? 'none'}min`)
      .join('\n') || 'No steps';

    const nutrition = recipe.aiNutrition;
    const nutritionText = nutrition
      ? `Calories: ${nutrition.calories}, Protein: ${nutrition.proteinG}g, Fat: ${nutrition.fatG}g, Carbs: ${nutrition.carbsG}g`
      : 'Not provided';

    const userMessage = `RECIPE TO REVIEW:

Name: ${recipe.name}
Protein: ${recipe.proteinName} (${recipe.proteinId})
Cuisine: ${recipe.cuisine || 'Not specified'}
Difficulty: ${recipe.difficulty || 'Not specified'}
Meal Type: ${recipe.mealType || 'Not specified'}
Cook Time: ${recipe.timeMinutes || 'Not specified'} minutes

Ingredients (2-3 servings):
  ${ingredientList}

Ingredients (4-6 servings):
  ${ingredientListLarge}

Cooking Steps:
${stepList}

Nutrition (per batch for 2-3 servings, divide by 2.5 for per-serving):
${nutritionText}

Chef's Tip: ${recipe.chefTip || 'None'}

LOCAL VALIDATION ISSUES (already detected):
${localIssues.length > 0 ? localIssues.map(i => `- ${i}`).join('\n') : 'None — passed local checks'}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: REVIEW_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.warn(`[SpiceStrong] Review API returned ${response.status}`);
      return { approved: localIssues.length === 0, score: 75, issues: localIssues, suggestions: ['Claude review unavailable'] };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const result: ReviewResult = JSON.parse(jsonStr);

    // Merge local issues into Claude's result
    const allIssues = [...new Set([...localIssues, ...result.issues])];
    result.issues = allIssues;

    // If local validation found critical issues, override approval
    if (localIssues.length > 2) {
      result.approved = false;
      result.score = Math.min(result.score, 60);
    }

    console.log(`[SpiceStrong] Recipe review: ${recipe.name} — score=${result.score}, approved=${result.approved}`);
    return result;
  } catch (err) {
    console.warn('[SpiceStrong] Recipe review failed:', err);
    return {
      approved: localIssues.length === 0,
      score: localIssues.length === 0 ? 75 : 50,
      issues: localIssues,
      suggestions: ['Auto-reviewed due to API error'],
    };
  }
}

// ════════════════════════════════════════
// PHASE 2: IMAGE VERIFICATION
// ════════════════════════════════════════

const IMAGE_REVIEW_PROMPT = `You are a food photography quality reviewer for SpiceStrong, a cooking app.

You will be shown an image alongside a cooking step description. Verify:

1. RELEVANCE — Does the image show food/cooking content related to the step description?
2. STAGE MATCH — Does it look like the correct stage of cooking described?
   (e.g., if step says "marinate chicken", image should show raw chicken in marinade, not a finished curry)
3. QUALITY — Is the image clear enough to be useful in a cooking guide?
   (not blurry, not too dark, food is visible)

Return ONLY this JSON:
{
  "matches": boolean,
  "confidence": "high" | "medium" | "low",
  "issue": "string or null — only if matches is false, explain what's wrong"
}`;

/**
 * Verify a single step image matches the step description using Claude Vision.
 */
async function verifyStepImage(
  stepDescription: string,
  stepTitle: string,
  imageUri: string,
  stepIndex: number,
): Promise<ImageVerification> {
  if (!ANTHROPIC_KEY) {
    return { stepIndex, matches: true, confidence: 'low', issue: 'No API key — skipped verification' };
  }

  try {
    // Read image as base64
    const base64 = new File(imageUri).base64();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        system: IMAGE_REVIEW_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64,
              },
            },
            {
              type: 'text',
              text: `Step ${stepIndex + 1}: "${stepTitle}"\nDescription: ${stepDescription}\n\nDoes this image match this cooking step?`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.warn(`[SpiceStrong] Image verification API returned ${response.status}`);
      return { stepIndex, matches: true, confidence: 'low', issue: 'API error — skipped' };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr);

    return {
      stepIndex,
      matches: result.matches ?? true,
      confidence: result.confidence ?? 'medium',
      issue: result.issue ?? undefined,
    };
  } catch (err) {
    console.warn(`[SpiceStrong] Step ${stepIndex} image verification failed:`, err);
    return { stepIndex, matches: true, confidence: 'low', issue: 'Verification error — skipped' };
  }
}

/**
 * Verify hero image matches the recipe name/description.
 */
async function verifyHeroImage(
  recipeName: string,
  description: string,
  imageUri: string,
): Promise<ImageVerification> {
  if (!ANTHROPIC_KEY) {
    return { stepIndex: -1, matches: true, confidence: 'low' };
  }

  try {
    const base64 = new File(imageUri).base64();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        system: IMAGE_REVIEW_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64,
              },
            },
            {
              type: 'text',
              text: `This should be the hero/final photo of: "${recipeName}"\nDescription: ${description}\n\nDoes this image show the finished dish?`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      return { stepIndex: -1, matches: true, confidence: 'low', issue: 'API error' };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr);

    return {
      stepIndex: -1,
      matches: result.matches ?? true,
      confidence: result.confidence ?? 'medium',
      issue: result.issue ?? undefined,
    };
  } catch (err) {
    console.warn('[SpiceStrong] Hero image verification failed:', err);
    return { stepIndex: -1, matches: true, confidence: 'low' };
  }
}

/**
 * Verify all images in a recipe (hero + step photos).
 */
export async function verifyRecipeImages(recipe: SavedRecipe): Promise<{
  heroResult?: ImageVerification;
  stepResults: ImageVerification[];
  allPassed: boolean;
  failedSteps: number[];
}> {
  const stepResults: ImageVerification[] = [];
  let heroResult: ImageVerification | undefined;

  // Verify step images (in parallel, max 3 at a time)
  const stepsWithPhotos = (recipe.steps || [])
    .map((s, i) => ({ step: s, index: i }))
    .filter(({ step }) => step.photoUri);

  // Process in batches of 3 to avoid rate limits
  for (let i = 0; i < stepsWithPhotos.length; i += 3) {
    const batch = stepsWithPhotos.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(({ step, index }) =>
        verifyStepImage(step.description, step.title, step.photoUri!, index)
      ),
    );
    stepResults.push(...results);
  }

  // Verify hero image
  // Check if there's a hero image stored in the steps or recipe data
  const heroUri = (recipe as any).heroImageUri;
  if (heroUri) {
    heroResult = await verifyHeroImage(
      recipe.name,
      recipe.description || '',
      heroUri,
    );
  }

  const failedSteps = stepResults.filter(r => !r.matches).map(r => r.stepIndex);
  const allPassed = failedSteps.length === 0 && (heroResult?.matches !== false);

  if (!allPassed) {
    console.log(`[SpiceStrong] Image verification: ${failedSteps.length} step(s) failed, hero=${heroResult?.matches ?? 'no image'}`);
  }

  return { heroResult, stepResults, allPassed, failedSteps };
}

// ════════════════════════════════════════
// FULL SUBMISSION PIPELINE
// ════════════════════════════════════════

/**
 * Full submission pipeline — runs in background after user taps "Submit".
 * Phase 1: Recipe quality review (text)
 * Phase 2: Image verification (vision)
 * Phase 3: Nutrition + classification
 * Phase 4: Status update + notification
 */
export async function submitRecipeForReview(recipe: SavedRecipe): Promise<void> {
  try {
    // Step 1: Mark as pending review
    recipe.status = 'pending_review' as any;
    await saveAIRecipe(recipe);
    updateRecipeStatus(recipe.id, 'ready').catch(() => {}); // Use 'ready' for DB constraint
    console.log(`[SpiceStrong] Recipe submitted for review: ${recipe.name}`);

    // Step 2: Upload images to Supabase
    if (recipe.steps) {
      for (let i = 0; i < recipe.steps.length; i++) {
        const step = recipe.steps[i];
        if (step.photoUri) {
          const url = await uploadRecipeStepImage(recipe.id, i, step.photoUri);
          if (url) step.photoStorageUrl = url;
        }
      }
    }

    // Step 3: Phase 1 — Recipe quality review
    const reviewResult = await reviewRecipe(recipe);
    recipe.reviewResult = reviewResult;
    console.log(`[SpiceStrong] Quality review: score=${reviewResult.score}, approved=${reviewResult.approved}`);

    // Step 4: Phase 2 — Image verification (only if recipe passed quality check)
    let imageIssues: string[] = [];
    if (reviewResult.approved) {
      const imageVerification = await verifyRecipeImages(recipe);
      if (!imageVerification.allPassed) {
        imageIssues = imageVerification.stepResults
          .filter(r => !r.matches)
          .map(r => `Step ${r.stepIndex + 1} photo doesn't match: ${r.issue || 'unrelated to step'}`);

        if (imageVerification.heroResult && !imageVerification.heroResult.matches) {
          imageIssues.unshift(`Hero photo doesn't match dish: ${imageVerification.heroResult.issue || 'not the finished dish'}`);
        }

        // Fail if there are high or medium confidence mismatches
        const significantFails = imageVerification.stepResults
          .filter(r => !r.matches && (r.confidence === 'high' || r.confidence === 'medium'));
        const heroFailed = imageVerification.heroResult && !imageVerification.heroResult.matches
          && imageVerification.heroResult.confidence !== 'low';
        if (significantFails.length > 0 || heroFailed) {
          reviewResult.approved = false;
          reviewResult.score = Math.min(reviewResult.score, 55);
          reviewResult.issues = [...reviewResult.issues, ...imageIssues];
        } else {
          // Low confidence only — add as suggestions, don't block
          reviewResult.suggestions = [...reviewResult.suggestions, ...imageIssues];
        }
      }
    }

    if (reviewResult.approved) {
      // Step 5a: Get nutrition from Edamam
      const ingredients = recipe.ingredients['2-3 servings'];
      if (ingredients?.length > 0) {
        const nutrition = await analyzeNutrition(ingredients, 2.5);
        if (nutrition) {
          recipe.aiNutrition = nutrition;
        }
      }

      // Step 5b: Classify recipe
      await classifyAndEnrichRecipe(recipe);

      // Step 6: Mark as ready
      recipe.status = 'ready';
      await saveAIRecipe(recipe);
      await updateRecipeStatus(recipe.id, 'ready');

      // Step 7: Notify user
      if (NOTIFICATIONS_AVAILABLE) await Notifications.scheduleNotificationAsync({
        content: {
          title: '🎉 Recipe Approved!',
          body: `"${recipe.name}" passed quality review (score: ${reviewResult.score}/100) and is now live!`,
          sound: 'default',
          data: { recipeId: recipe.id },
          ...(Platform.OS === 'android' ? { channelId: 'recipe' } : {}),
        },
        trigger: null,
      });

      console.log(`[SpiceStrong] Recipe approved: ${recipe.name} (score: ${reviewResult.score})`);
    } else {
      // Rejected
      recipe.status = 'ready' as any; // Use 'ready' for DB, reviewResult.approved=false signals rejection
      await saveAIRecipe(recipe);
      await updateRecipeStatus(recipe.id, 'ready');

      const issueText = reviewResult.issues.slice(0, 2).join('. ') || 'Please review and try again.';
      if (NOTIFICATIONS_AVAILABLE) await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚠️ Recipe Needs Changes',
          body: `"${recipe.name}": ${issueText}`,
          sound: 'default',
          data: { recipeId: recipe.id },
          ...(Platform.OS === 'android' ? { channelId: 'recipe' } : {}),
        },
        trigger: null,
      });

      console.log(`[SpiceStrong] Recipe rejected: ${recipe.name} (score: ${reviewResult.score}, issues: ${reviewResult.issues.join('; ')})`);
    }
  } catch (err) {
    console.error('[SpiceStrong] Recipe review pipeline failed:', err);
    // Don't leave recipe stuck
    try {
      recipe.status = 'ready';
      await saveAIRecipe(recipe);
      await updateRecipeStatus(recipe.id, 'ready');
    } catch { /* best effort */ }
  }
}
