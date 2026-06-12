/**
 * AddRecipeScreen.tsx — Full 5-step recipe creation wizard.
 * Allows users to submit their own recipes with photos, voice input, and auto nutrition.
 *
 * Steps: Basics → Ingredients → Cooking Steps → Hero Image → Review & Submit
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput,
  Alert, Platform, ImageBackground, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { QUANTITY_TIERS, type QuantityTier, type IngredientsByTier, type CookingStep, saveRecipe, getRecipeById } from '../../src/store/recipes';
import { saveAIRecipe, uploadRecipeHeroImage, uploadStepImage, updateRecipeStatus } from '../../services/recipeService';
import { generateAllRecipeImages, saveRecipeImages, loadRecipeImages, type RecipeImageResults } from '../../services/imageGenerationService';
import { submitRecipeForReview, reviewRecipe } from '../../services/recipeReviewService';
import { INGREDIENT_MAP, CATEGORY_EMOJI } from '../../src/data/ingredientMapping';
import { PROTEINS } from '../../src/theme';
import { filterProteinsForPreference, getDietPreference, hasNonVegText, isNonVegProteinId, type DietPreference } from '../../src/utils/dietPreference';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { analyzeNutrition } from '../../services/nutritionService';
import VoiceInput from '../../components/VoiceInput';
import { HomeButton } from '../../components/HomeButton';
import { ProcessingRing } from '../../components/ProcessingRing';

type WizardStep = 'image_import' | 'basics' | 'ingredients' | 'steps' | 'hero' | 'review';
const WIZARD_STEPS: WizardStep[] = ['image_import', 'basics', 'ingredients', 'steps', 'hero', 'review'];
const STEP_LABELS = ['Import', 'Basics', 'Ingredients', 'Steps', 'Photo', 'Review'];

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch_dinner', label: 'Lunch / Dinner' },
  { key: 'snack_dessert', label: 'Snack / Dessert' },
] as const;

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;

const CUISINES = ['Indian', 'Thai', 'Mediterranean', 'Chinese', 'Mexican', 'American', 'Other'];

function defaultIngredientsByTier(): IngredientsByTier {
  return { '2-3 servings': [{ name: '', quantity: '' }], '4-6 servings': [] };
}

export default function AddRecipeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    proteinId: string;
    proteinName: string;
    proteinEmoji: string;
    editRecipeId?: string;
    fromMenu?: string;
    copyAsNew?: string;
    copyId?: string;
  }>();
  const { proteinEmoji } = params;
  const fromMenu = params.fromMenu === 'true';
  const isCopyAsNew = params.copyAsNew === 'true';
  const isEditing = !!params.editRecipeId;

  // Protein can be overridden when coming from menu (user picks or Claude detects)
  const [proteinId, setProteinId] = useState(params.proteinId || '');
  const [proteinName, setProteinName] = useState(params.proteinName || '');
  const [selectedProteinEmoji, setSelectedProteinEmoji] = useState(params.proteinEmoji || '🍽');
  const [dietPreference, setDietPreferenceState] = useState<DietPreference | null>('veg');

  // Image import state
  const [importImageUri, setImportImageUri] = useState<string | null>(null);
  const [importImageBase64, setImportImageBase64] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extractionProgress, setExtractionProgress] = useState<string | null>(null);
  const [fromImageExtraction, setFromImageExtraction] = useState(false);

  // Wizard state — start at image_import for new recipes, basics for editing
  const [currentStep, setCurrentStep] = useState<WizardStep>(isEditing ? 'basics' : 'image_import');
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Basics
  const [recipeName, setRecipeName] = useState('');
  const [description, setDescription] = useState('');
  const [mealType, setMealType] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [cookTime, setCookTime] = useState('');
  const [cuisine, setCuisine] = useState<string | null>(null);

  // Step 2: Ingredients
  const [ingredientsByTier, setIngredientsByTier] = useState<IngredientsByTier>(defaultIngredientsByTier);
  const [selectedTier, setSelectedTier] = useState<QuantityTier>('2-3 servings');

  // Step 3: Cooking Steps
  const [steps, setSteps] = useState<(CookingStep & { photoUri?: string })[]>([
    { title: '', description: '', emoji: '🔥' },
  ]);

  // Step 4: Hero Image
  const [heroImageUri, setHeroImageUri] = useState<string | null>(null);
  // Nutrition from Edamam
  const [extractedNutrition, setExtractedNutrition] = useState<{ calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; sugarG: number; sodiumMg: number } | null>(null);
  const allowedProteins = filterProteinsForPreference(PROTEINS, dietPreference);

  // ── Load existing recipe when editing ──
  useEffect(() => {
    getDietPreference().then((preference) => {
      setDietPreferenceState(preference);
      if (preference === 'veg' && isNonVegProteinId(proteinId)) {
        const fallback = PROTEINS.find((p) => p.id === 'paneer') ?? PROTEINS.find((p) => p.category === 'VEG');
        if (fallback) {
          setProteinId(fallback.id);
          setProteinName(fallback.name);
          setSelectedProteinEmoji(fallback.emoji);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!params.editRecipeId) return;
    (async () => {
      const existing = await getRecipeById(params.editRecipeId!);
      if (!existing) return;

      // Populate basics
      setRecipeName(existing.name);
      setDescription(existing.description || '');
      setMealType(existing.mealType || null);
      setDifficulty(existing.difficulty || null);
      setCookTime(existing.timeMinutes ? `${existing.timeMinutes} min` : '');
      setCuisine(existing.cuisine || null);

      // Populate ingredients
      if (existing.ingredients) {
        setIngredientsByTier(existing.ingredients);
      }

      // Populate steps
      if (existing.steps?.length > 0) {
        setSteps(existing.steps.map(s => ({
          ...s,
          photoUri: (s as any).photoUri || (s as any).photoStorageUrl || undefined,
        })));
      }

      // Load images
      const imgs = await loadRecipeImages(params.editRecipeId!);
      if (imgs?.dishImage) setHeroImageUri(imgs.dishImage);
      if (imgs?.stepImages) {
        setSteps(prev => prev.map((s, i) => ({
          ...s,
          photoUri: s.photoUri || imgs.stepImages[String(i)] || undefined,
        })));
      }
    })();
  }, [params.editRecipeId]);

  // --- Helpers ---
  const currentStepIndex = WIZARD_STEPS.indexOf(currentStep);

  const currentIngredients = ingredientsByTier[selectedTier];

  const addIngredient = () => {
    setIngredientsByTier(prev => ({
      ...prev,
      [selectedTier]: [...prev[selectedTier], { name: '', quantity: '' }],
    }));
  };

  const updateIngredient = (tier: QuantityTier, index: number, field: 'name' | 'quantity', value: string) => {
    setIngredientsByTier(prev => {
      const list = [...prev[tier]];
      if (list[index]) list[index] = { ...list[index], [field]: value };
      return { ...prev, [tier]: list };
    });
  };

  const removeIngredient = (tier: QuantityTier, index: number) => {
    setIngredientsByTier(prev => {
      const list = prev[tier].filter((_, i) => i !== index);
      return { ...prev, [tier]: list.length > 0 ? list : [{ name: '', quantity: '' }] };
    });
  };

  const addStep = () => {
    setSteps([...steps, { title: '', description: '', emoji: '🍳' }]);
  };

  const updateStep = (index: number, field: string, value: string | number) => {
    const updated = [...steps];
    (updated[index] as any)[field] = value;
    setSteps(updated);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== index));
  };

  // --- Image Picker ---
  const pickImage = useCallback(async (source: 'camera' | 'gallery'): Promise<string | null> => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
    };

    let result;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Permission', 'Please enable camera access in Settings.');
        return null;
      }
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo Library Permission', 'Please enable photo access in Settings.');
        return null;
      }
      result = await ImagePicker.launchImageLibraryAsync(options);
    }

    if (!result.canceled && result.assets[0]) {
      return result.assets[0].uri;
    }
    return null;
  }, []);

  const showImagePicker = useCallback(async (onSelect: (uri: string) => void) => {
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Camera', onPress: async () => { const uri = await pickImage('camera'); if (uri) onSelect(uri); } },
      { text: 'Gallery', onPress: async () => { const uri = await pickImage('gallery'); if (uri) onSelect(uri); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [pickImage]);

  // --- Validation ---
  const validateStep = (): boolean => {
    switch (currentStep) {
      case 'basics':
        if (!recipeName.trim()) { Alert.alert('Missing Info', 'Please enter a recipe name.'); return false; }
        if (!mealType) { Alert.alert('Missing Info', 'Please select a meal type.'); return false; }
        if (!difficulty) { Alert.alert('Missing Info', 'Please select difficulty.'); return false; }
        return true;
      case 'ingredients':
        const validIngs = ingredientsByTier['2-3 servings'].filter(i => i.name.trim());
        if (validIngs.length < 2) { Alert.alert('Missing Info', 'Please add at least 2 ingredients.'); return false; }
        return true;
      case 'steps':
        if (!steps[0]?.description?.trim()) { Alert.alert('Missing Info', 'Please add at least one cooking step.'); return false; }
        return true;
      case 'hero':
        if (!heroImageUri) { Alert.alert('Missing Photo', 'Please add a photo of the finished dish.'); return false; }
        return true;
      default:
        return true;
    }
  };

  const goNext = () => {
    if (!validateStep()) return;
    const next = WIZARD_STEPS[currentStepIndex + 1];
    if (next) setCurrentStep(next);
  };

  const goBack = () => {
    // When editing, 'basics' is the first step — go back to previous screen
    if (isEditing && currentStep === 'basics') {
      router.back();
      return;
    }
    if (currentStepIndex === 0) {
      router.back();
      return;
    }
    let prevIdx = currentStepIndex - 1;
    // Skip image_import when editing
    if (isEditing && WIZARD_STEPS[prevIdx] === 'image_import') {
      router.back();
      return;
    }
    const prev = WIZARD_STEPS[prevIdx];
    if (prev) setCurrentStep(prev);
  };

  // --- Submit ---
  const handleSubmit = async (publish: boolean = false) => {
    setSubmitting(true);
    try {
      const recipeId = isCopyAsNew ? (params.copyId || `copy-${Date.now()}`) : isEditing ? params.editRecipeId! : `user-${Date.now()}`;
      const timeMatch = cookTime.match(/(\d+)/);
      const timeMinutes = timeMatch ? parseInt(timeMatch[1], 10) : undefined;

      const finalProteinId = proteinId || 'my_recipes';
      const finalProteinName = proteinName || 'My Recipes';
      const finalProteinEmoji = selectedProteinEmoji || '🍽';

      const recipe = {
        id: recipeId,
        name: recipeName.trim(),
        proteinId: finalProteinId,
        proteinName: finalProteinName,
        proteinEmoji: finalProteinEmoji,
        description: description.trim() || undefined,
        ingredients: ingredientsByTier,
        steps: steps.filter(s => s.description.trim()),
        chefTip: `User recipe — ${finalProteinName}`,
        createdAt: Date.now(),
        mealType: mealType as any,
        difficulty: difficulty as any,
        cuisine: cuisine || undefined,
        timeMinutes,
        status: 'ready' as const,
        source: 'user' as const,
        aiNutrition: extractedNutrition || undefined,
      };

      if (publish) {
        // ── PUBLISH FLOW ──
        // Image-extracted recipes were already validated + auto-fixed during extraction
        // Only run full review for manually-created recipes
        if (!fromImageExtraction) {
          const reviewResult = await reviewRecipe(recipe as any);

          if (!reviewResult.approved) {
            const issueList = reviewResult.issues.slice(0, 3).join('\n• ');
          const suggestions = reviewResult.suggestions.slice(0, 2);
          // Build friendly, actionable feedback — deduplicated
          const seen = new Set<string>();
          const friendlyIssues = reviewResult.issues.slice(0, 6).map((issue) => {
            let friendly = '';
            if (issue.includes('Too many ingredients')) friendly = '📝 Simplify to 15 or fewer ingredients';
            else if (issue.includes('Too few steps')) friendly = '📝 Add more detailed steps (at least 4)';
            else if (issue.includes('Too many steps')) friendly = '📝 Combine some steps (maximum 8)';
            else if (issue.includes('Vague quantity') || issue.includes('Missing quantity')) friendly = '📏 Use exact measurements for all ingredients';
            else if (issue.includes('description') || issue.includes('Description')) friendly = '✏️ Add a description mentioning the protein';
            else if (issue.includes('protein density') || issue.includes('6.4')) friendly = '💪 Add more protein to meet the 6.4g/100cal standard';
            else friendly = `📝 ${issue}`;
            if (seen.has(friendly)) return null;
            seen.add(friendly);
            return friendly;
          }).filter(Boolean);
          const friendlyList = friendlyIssues.join('\n');

          Alert.alert(
            'Just a Few Tweaks 💪',
            `"${recipeName}" is a great recipe! To publish on SpiceStrong, please adjust:\n\n${friendlyList}${suggestions.length > 0 ? '\n\n💡 ' + suggestions[0] : ''}`,
            [
              { text: 'Save & Fix Later', onPress: async () => {
                await saveRecipe(recipe);
                Alert.alert('Saved! 💾', `"${recipeName}" is saved. Edit and publish when ready.`, [{ text: 'OK', onPress: () => router.back() }]);
              }},
              { text: 'Fix Now', style: 'cancel' },
            ],
          );
          setSubmitting(false);
          return;
        }

          // Passed validation — save and publish
          await saveRecipe(recipe);
          Alert.alert(
            'Published! 🎉',
            `"${recipeName}" passed quality review and is now being shared with the community!`,
            [{ text: 'OK', onPress: () => router.back() }],
          );
        } else {
          // Image-extracted recipe — only check protein density
          const nutrition = extractedNutrition;
          if (nutrition && nutrition.calories > 0) {
            const density = (nutrition.proteinG / nutrition.calories) * 100;
            if (density < 6.4) {
              Alert.alert(
                'Protein Too Low 💪',
                `"${recipeName}" has ${Math.round(nutrition.proteinG)}g protein and ${Math.round(nutrition.calories)} calories per serving (density: ${density.toFixed(1)}). SpiceStrong requires at least 6.4g protein per 100 calories.\n\nTry increasing the protein source or reducing oils and carbs.`,
                [
                  { text: 'Save & Fix Later', onPress: async () => {
                    await saveRecipe(recipe);
                    Alert.alert('Saved! 💾', `"${recipeName}" is saved. Adjust protein and publish when ready.`, [{ text: 'OK', onPress: () => router.back() }]);
                  }},
                  { text: 'Fix Now', style: 'cancel' },
                ],
              );
              setSubmitting(false);
              return;
            }
          }
          // Passed protein check — publish
          await saveRecipe(recipe);
          Alert.alert(
            'Published! 🎉',
            `"${recipeName}" is now being shared with the community!`,
            [{ text: 'OK', onPress: () => router.back() }],
          );
        }
      } else {
        // ── SAVE FLOW: save locally without validation ──
        await saveRecipe(recipe);
        Alert.alert(
          'Saved! 💾',
          `"${recipeName}" has been saved to your recipes. You can publish it later from the recipe list.`,
          [{ text: 'OK', onPress: () => router.back() }],
        );
      }

      // Background: generate AI images + upload to Supabase + review pipeline
      (async () => {
        try {
          // 1. Generate AI hero + step images (context-aware)
          console.log('[SpiceStrong] Starting AI image generation for recipe:', recipeName.trim());
          const aiImages = await generateAllRecipeImages({
            id: recipeId,
            name: recipeName.trim(),
            ingredients: ingredientsByTier,
            steps: steps.filter(s => s.description.trim()),
          });
          await saveRecipeImages(recipeId, aiImages);

          // 2. Upload hero image to Supabase Storage
          if (aiImages.dishImage) {
            await uploadRecipeHeroImage(recipeId, aiImages.dishImage);
          }

          // 3. Upload step photos to Supabase Storage
          for (const [idx, uri] of Object.entries(aiImages.stepImages)) {
            if (uri) {
              try {
                await uploadStepImage(recipeId, parseInt(idx, 10), uri);
              } catch (e) {
                console.warn(`[SpiceStrong] Step ${idx} image upload failed:`, e);
              }
            }
          }

          // 4. Mark recipe as ready
          recipe.status = 'ready' as const;
          await saveAIRecipe(recipe);
          updateRecipeStatus(recipeId, 'ready').catch(() => {});

          // 5. Run review + nutrition + classification pipeline
          await submitRecipeForReview(recipe);
        } catch (err) {
          console.error('[SpiceStrong] Background recipe processing failed:', err);
          // Still mark as ready so it doesn't stay stuck
          try {
            recipe.status = 'ready' as const;
            await saveAIRecipe(recipe);
          } catch { /* best effort */ }
        }
      })();
    } catch (err) {
      console.error('[SpiceStrong] Recipe submission failed:', err);
      Alert.alert('Error', 'Failed to save recipe. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Get ingredient category emoji ---
  const getIngredientEmoji = (name: string): string => {
    const lower = name.toLowerCase().trim();
    // Check exact match first, then partial match
    if (INGREDIENT_MAP[lower]) return CATEGORY_EMOJI[INGREDIENT_MAP[lower].category] || '📦';
    // Try partial match — find first key that the name contains
    for (const key of Object.keys(INGREDIENT_MAP)) {
      if (lower.includes(key) || key.includes(lower)) {
        return CATEGORY_EMOJI[INGREDIENT_MAP[key].category] || '📦';
      }
    }
    return '📦';
  };

  // ── Image import handlers ──
  const handlePickImportImage = async (useCamera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      base64: false, // Don't get base64 from picker — we'll resize first
    };
    let result: ImagePicker.ImagePickerResult;
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Camera access required.'); return; }
      result = await ImagePicker.launchCameraAsync(opts);
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Photo library access required.'); return; }
      result = await ImagePicker.launchImageLibraryAsync(opts);
    }
    if (!result.canceled && result.assets?.[0]) {
      const uri = result.assets[0].uri;

      // Save URI for preview only — hero image will be AI-generated
      setImportImageUri(uri);

      // Resize to 1024px wide + 50% JPEG compression (guaranteed under 5MB)
      try {
        const manipulated = await manipulateAsync(
          uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.5, format: SaveFormat.JPEG, base64: true },
        );
        const b64 = manipulated.base64 || '';
        console.log(`[SpiceStrong] Import: hero saved, compressed base64=${Math.round(b64.length / 1024)}KB`);
        setImportImageBase64(b64 || null);
        setExtractionError(null);
      } catch (e) {
        console.error('[SpiceStrong] Image compression failed:', e);
        setExtractionError('Could not process image. Try a different photo.');
      }
    }
  };

  const handleExtractRecipe = async () => {
    if (!importImageBase64) return;
    setExtracting(true);
    setExtractionError(null);
    setExtractionProgress('Analyzing your photo...');
    try {
      const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
      if (!apiKey) throw new Error('No API key');

      const b64 = importImageBase64;
      let mediaType = 'image/jpeg';
      if (b64.startsWith('iVBOR')) mediaType = 'image/png';
      else if (b64.startsWith('UklGR')) mediaType = 'image/webp';

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: `You are a recipe extraction engine for a high-protein cooking app.

STEP 1: Determine if the image contains food.
- If the image is NOT food (person, landscape, object, text without recipe, etc.), return: {"error": "not_food"}
- If the image IS food or a recipe (screenshot, book, handwritten, or a dish), proceed to Step 2.

STEP 2: Extract the recipe and identify the PRIMARY protein.
Return ONLY this JSON:
{
  "name": "Recipe name",
  "description": "1-2 sentence description",
  "primaryProtein": "chicken|fish|lamb|goat|pork|beef|prawns|eggs|paneer|tofu|soy|beans|milk|whey",
  "mealType": "breakfast|lunch_dinner|snack_dessert",
  "difficulty": "Easy|Medium|Hard",
  "cookTime": "30 min",
  "cuisine": "Indian|Thai|Mediterranean|Chinese|Mexican|American|Other",
  "ingredients": {
    "2-3 servings": [{"name": "Ingredient", "quantity": "500g"}],
    "4-6 servings": [{"name": "Ingredient", "quantity": "1kg"}]
  },
  "steps": [{"title": "Step", "description": "Details with quantities for each ingredient used", "emoji": "🔥", "timerMinutes": 5, "ingredientsUsed": "comma-separated ingredient names ONLY from this step", "imagePrompt": "Short literal description of ONLY what is physically visible at this moment — max 15 words, no recipe name"}],
  "chefTip": "One line tip"
}

CRITICAL RULES:
- primaryProtein MUST be one of: chicken, fish, lamb, goat, pork, beef, prawns, eggs, paneer, tofu, soy, beans, milk, whey
- If the dish has multiple proteins, pick the DOMINANT one
- If no clear protein is visible, use "eggs" as default
- Max 15 ingredients, 4-8 steps, precise quantities, 4-6 tier = 2x of 2-3 tier
- ingredientsUsed for each step must ONLY list ingredients actually used in THAT step — never include ingredients from other steps
- Every ingredient from the ingredient list must appear in exactly one step's ingredientsUsed
- Step description must mention each ingredient in ingredientsUsed with its quantity`,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
              { type: 'text', text: 'Analyze this image. If it contains food or a recipe, extract the full recipe. If not food, return {"error": "not_food"}.' },
            ],
          }],
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`API returned ${res.status}: ${errBody.slice(0, 200)}`);
      }
      const data = await res.json();
      let text = (data.content?.[0]?.text || '').trim();
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace <= firstBrace) throw new Error('Could not parse response');
      const parsed = JSON.parse(text.substring(firstBrace, lastBrace + 1));

      // Check if image was rejected as not food
      if (parsed.error === 'not_food') {
        setExtractionError('This doesn\'t look like food or a recipe. Please upload a photo of a dish or a recipe screenshot.');
        setExtracting(false);
        return;
      }

      // Must have a recipe name
      if (!parsed.name) {
        setExtractionError('Could not identify a recipe from this image. Try a clearer photo.');
        setExtracting(false);
        return;
      }

      if (dietPreference === 'veg' && hasNonVegText(JSON.stringify(parsed))) {
        setExtractionError('This recipe appears to include non-vegetarian ingredients. Vegetarian mode only supports vegetarian recipes.');
        setExtracting(false);
        return;
      }

      // Auto-detect protein from image
      const detectedProtein = parsed.primaryProtein;
      const match = allowedProteins.find((p) => p.id === detectedProtein);
      if (match && !(dietPreference === 'veg' && isNonVegProteinId(match.id))) {
        setProteinId(match.id);
        setProteinName(match.name);
        setSelectedProteinEmoji(match.emoji);
      } else {
        const fallback = allowedProteins.find((p) => p.id === 'paneer') ?? allowedProteins[0];
        if (fallback) {
          setProteinId(fallback.id);
          setProteinName(fallback.name);
          setSelectedProteinEmoji(fallback.emoji);
        }
      }

      // Pre-fill all form fields
      setRecipeName(parsed.name || '');
      setDescription(parsed.description || '');
      setMealType(parsed.mealType || null);
      setDifficulty(parsed.difficulty || null);
      setCookTime(parsed.cookTime || '');
      setCuisine(parsed.cuisine || null);
      if (parsed.ingredients) setIngredientsByTier(parsed.ingredients);
      if (parsed.steps?.length > 0) {
        setSteps(parsed.steps.map((s: any) => ({
          title: s.title || '', description: s.description || '',
          emoji: s.emoji || '🔥', timerMinutes: s.timerMinutes || undefined,
        })));
      }

      setExtractionProgress('Getting nutrition details...');
      // Get nutrition from Edamam using extracted ingredients
      try {
        const tier23 = parsed.ingredients?.['2-3 servings'] || [];
        if (tier23.length > 0) {
          const nutrition = await analyzeNutrition(tier23, 2.5);
          if (nutrition) {
            setExtractedNutrition(nutrition);
            console.log(`[SpiceStrong] Nutrition: ${nutrition.calories} cal, ${nutrition.proteinG}g P`);
          }
        }
      } catch (nutritionErr) {
        console.warn('[SpiceStrong] Nutrition analysis failed (non-blocking):', nutritionErr);
      }

      // Validate + auto-fix recipe to meet SpiceStrong standards
      setExtractionProgress('Optimizing for high-protein standards...');
      try {
        const fixRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 2048,
            system: `You are a high-protein recipe optimizer for SpiceStrong. Fix the recipe to meet these MANDATORY requirements:

1. PROTEIN DENSITY: proteinG / calories × 100 >= 6.4 (CRITICAL)
   - If too low: increase protein source quantity, reduce oils/carbs, add protein-rich ingredients
2. MAX 15 ingredients, MIN 4 steps, MAX 8 steps
3. ALL quantities must be precise (no "to taste", "some", "a pinch")
4. "2-3 servings" and "4-6 servings" tiers (4-6 = exactly 2× of 2-3)
5. Description must mention the protein name and be 1-2 sentences
6. Each step must have a clear title and detailed description with quantities
7. chefTip must mention protein per serving and calories
8. Each step MUST have "ingredientsUsed" listing ONLY ingredients used in THAT step (not other steps)
9. Every ingredient must appear in exactly one step's ingredientsUsed
10. Each step MUST have "imagePrompt": a short (max 15 words) literal description of what is physically visible at that cooking moment — no recipe name, no ingredients from other steps

Return the FIXED recipe as the same JSON format. If already compliant, return as-is.
Return ONLY the JSON, no explanation.`,
            messages: [{ role: 'user', content: `Fix this recipe to meet SpiceStrong standards:\n${JSON.stringify(parsed)}` }],
          }),
        });
        if (fixRes.ok) {
          const fixData = await fixRes.json();
          const fixText = (fixData.content?.[0]?.text || '').trim();
          const fixFirst = fixText.indexOf('{');
          const fixLast = fixText.lastIndexOf('}');
          if (fixFirst !== -1 && fixLast > fixFirst) {
            const fixed = JSON.parse(fixText.substring(fixFirst, fixLast + 1));
            // Apply fixes
            if (fixed.name) setRecipeName(fixed.name);
            if (fixed.description) setDescription(fixed.description);
            if (fixed.ingredients) {
              setIngredientsByTier(fixed.ingredients);
              parsed.ingredients = fixed.ingredients; // Update for image generation
            }
            if (fixed.steps?.length > 0) {
              const fixedSteps = fixed.steps.map((s: any) => ({
                title: s.title || '', description: s.description || '',
                emoji: s.emoji || '🔥', timerMinutes: s.timerMinutes || undefined,
              }));
              setSteps(fixedSteps);
              parsed.steps = fixed.steps; // Update for image generation
            }
            if (fixed.chefTip) parsed.chefTip = fixed.chefTip;
            console.log('[SpiceStrong] Recipe optimized for SpiceStrong standards');
          }
        }
      } catch (fixErr) {
        console.warn('[SpiceStrong] Auto-fix failed (non-blocking):', fixErr);
      }

      // Re-run nutrition after auto-fix (ingredients may have changed)
      try {
        const fixedTier23 = parsed.ingredients?.['2-3 servings'] || [];
        if (fixedTier23.length > 0) {
          const fixedNutrition = await analyzeNutrition(fixedTier23, 2.5);
          if (fixedNutrition) {
            setExtractedNutrition(fixedNutrition);
          }
        }
      } catch {}

      // Generate AI hero + step images
      setExtractionProgress('Creating recipe images...');
      try {
        const recipeId = `user-${Date.now()}`;
        const stepsForImages = (parsed.steps || []).map((s: any) => ({
          title: s.title || '', description: s.description || '',
        }));
        const ingredientsForImages = parsed.ingredients || { '2-3 servings': [] };

        console.log(`[SpiceStrong] Generating AI images for extracted recipe: ${parsed.name}`);

        // Generate hero image first (user sees it on review)
        const aiImages = await generateAllRecipeImages({
          id: recipeId,
          name: parsed.name || 'Recipe',
          ingredients: ingredientsForImages,
          steps: stepsForImages,
        });
        await saveRecipeImages(recipeId, aiImages);

        // Set hero image so it shows in the hero step
        if (aiImages.dishImage) {
          setHeroImageUri(aiImages.dishImage);
          console.log(`[SpiceStrong] Hero image generated: ${aiImages.dishImage}`);
        }

        // Set step images on the step objects
        if (Object.keys(aiImages.stepImages).length > 0) {
          setSteps((prev) => prev.map((s, i) => ({
            ...s,
            photoUri: aiImages.stepImages[String(i)] || s.photoUri,
          })));
          console.log(`[SpiceStrong] Step images generated: ${Object.keys(aiImages.stepImages).length}`);
        }
      } catch (imgErr) {
        console.warn('[SpiceStrong] Image generation failed (non-blocking):', imgErr);
      }

      setFromImageExtraction(true);
      setCurrentStep('basics');
    } catch (err: any) {
      console.error('[SpiceStrong] Recipe extraction failed:', err);
      setExtractionError(err?.message || 'Could not extract recipe. Try a clearer photo.');
    } finally {
      setExtracting(false);
    }
  };

  // --- Render ---
  return (
    <ImageBackground
      source={require('../../assets/images/splash-bg.jpg')}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      <View style={StyleSheet.absoluteFillObject}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {currentStepIndex === 4 ? 'Review Recipe' : isEditing ? `${proteinEmoji} Edit Recipe` : `${proteinEmoji} Add Your Recipe`}
          </Text>
          <HomeButton />
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBar}>
          {WIZARD_STEPS.map((step, i) => (
            <View key={step} style={styles.progressItem}>
              <View style={[
                styles.progressDot,
                i <= currentStepIndex && styles.progressDotActive,
                i < currentStepIndex && styles.progressDotDone,
              ]}>
                {i < currentStepIndex ? (
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.progressDotText, i <= currentStepIndex && { color: '#FFF' }]}>
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text style={[styles.progressLabel, i <= currentStepIndex && styles.progressLabelActive]}>
                {STEP_LABELS[i]}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* ========== STEP 0: IMAGE IMPORT ========== */}
          {currentStep === 'image_import' && (
            <View style={styles.importStep}>
              {/* Protein picker when coming from menu */}

              {!importImageUri && !extracting && (
                <View style={styles.importCenter}>
                  <Ionicons name="image-outline" size={64} color="#8F3A1F" />
                  <Text style={styles.importTitle}>Import from a photo</Text>
                  <Text style={styles.importSubtitle}>Take a photo or upload a screenshot of any recipe</Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                    <TouchableOpacity style={[styles.importBtn, { flex: 1 }]} onPress={() => handlePickImportImage(true)} activeOpacity={0.8}>
                      <Text style={styles.importBtnText}>📷 Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.importBtn, { flex: 1, backgroundColor: 'rgba(143,58,31,0.20)' }]} onPress={() => handlePickImportImage(false)} activeOpacity={0.8}>
                      <Text style={[styles.importBtnText, { color: '#8F3A1F' }]}>🖼 Gallery</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => setCurrentStep('basics')} activeOpacity={0.7}>
                    <Text style={styles.importSkipText}>Skip — enter recipe manually</Text>
                  </TouchableOpacity>
                </View>
              )}

              {importImageUri && !extracting && (
                <View style={styles.importPreview}>
                  <Image source={{ uri: importImageUri }} style={styles.importPreviewImg} contentFit="cover" />
                  {extractionError && <Text style={styles.importError}>{extractionError}</Text>}
                  <TouchableOpacity style={styles.importBtn} onPress={handleExtractRecipe} activeOpacity={0.8}>
                    <Text style={styles.importBtnText}>Extract Recipe from Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setImportImageUri(null); setImportImageBase64(null); }} activeOpacity={0.7}>
                    <Text style={styles.importSkipText}>Choose a different photo</Text>
                  </TouchableOpacity>
                </View>
              )}

              {extracting && (
                <View style={styles.importCenter}>
                  <ProcessingRing
                    label={extractionProgress || 'Extracting recipe...'}
                    sublabel="This may take a moment"
                    expectedMs={18000}
                  />
                </View>
              )}
            </View>
          )}

          {/* Extraction banner */}
          {fromImageExtraction && currentStep !== 'image_import' && currentStep !== 'review' && (
            <View style={styles.extractionBanner}>
              <Text style={styles.extractionBannerText}>✅ Extracted from photo — review and edit below</Text>
            </View>
          )}

          {/* ========== STEP 1: BASICS ========== */}
          {currentStep === 'basics' && (
            <>
              {/* Protein selector — shown when editing or from menu */}
              <Text style={styles.sectionTitle}>Protein Type *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, maxHeight: 44 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {allowedProteins.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.proteinChip, proteinId === p.id && styles.proteinChipActive]}
                      onPress={() => { setProteinId(p.id); setProteinName(p.name); setSelectedProteinEmoji(p.emoji); }}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.proteinChipEmoji}>{p.emoji}</Text>
                      <Text style={[styles.proteinChipText, proteinId === p.id && styles.proteinChipTextActive]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.sectionTitle}>Recipe Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Spicy Tandoori Chicken"
                placeholderTextColor="#666"
                value={recipeName}
                onChangeText={setRecipeName}
              />

              <Text style={styles.sectionTitle}>Description</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="A brief description of your recipe..."
                placeholderTextColor="#666"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              <Text style={styles.sectionTitle}>Protein</Text>
              <View style={[styles.input, styles.readOnlyField]}>
                <Text style={styles.readOnlyText}>{proteinEmoji} {proteinName}</Text>
              </View>

              <Text style={styles.sectionTitle}>Meal Type *</Text>
              <View style={styles.chipRow}>
                {MEAL_TYPES.map(mt => (
                  <TouchableOpacity
                    key={mt.key}
                    style={[styles.chip, mealType === mt.key && styles.chipActive]}
                    onPress={() => setMealType(mt.key)}
                  >
                    <Text style={[styles.chipText, mealType === mt.key && styles.chipTextActive]}>
                      {mt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Difficulty *</Text>
              <View style={styles.chipRow}>
                {DIFFICULTIES.map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.chip, difficulty === d && styles.chipActive]}
                    onPress={() => setDifficulty(d)}
                  >
                    <Text style={[styles.chipText, difficulty === d && styles.chipTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Cook Time</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 30 min"
                placeholderTextColor="#666"
                value={cookTime}
                onChangeText={setCookTime}
              />

              <Text style={styles.sectionTitle}>Cuisine</Text>
              <View style={styles.chipRow}>
                {CUISINES.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, cuisine === c && styles.chipActive]}
                    onPress={() => setCuisine(c)}
                  >
                    <Text style={[styles.chipText, cuisine === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* ========== STEP 2: INGREDIENTS ========== */}
          {currentStep === 'ingredients' && (
            <>
              <Text style={styles.sectionTitle}>Ingredients</Text>
              <View style={styles.tierTabs}>
                {QUANTITY_TIERS.map(tier => (
                  <TouchableOpacity
                    key={tier}
                    style={[styles.tierTab, selectedTier === tier && styles.tierTabActive]}
                    onPress={() => setSelectedTier(tier)}
                  >
                    <Text style={[styles.tierTabText, selectedTier === tier && styles.tierTabTextActive]}>
                      {tier}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {currentIngredients.map((ing, i) => (
                <View key={i} style={styles.ingredientRow}>
                  <Text style={styles.ingredientEmoji}>{getIngredientEmoji(ing.name)}</Text>
                  <TextInput
                    style={[styles.input, { flex: 2, marginBottom: 0 }]}
                    placeholder="Ingredient"
                    placeholderTextColor="#666"
                    value={ing.name}
                    onChangeText={v => updateIngredient(selectedTier, i, 'name', v)}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="Qty"
                    placeholderTextColor="#666"
                    value={ing.quantity}
                    onChangeText={v => updateIngredient(selectedTier, i, 'quantity', v)}
                  />
                  <TouchableOpacity onPress={() => removeIngredient(selectedTier, i)} style={styles.removeBtn}>
                    <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.3)" />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity style={styles.addBtn} onPress={addIngredient}>
                <Ionicons name="add-circle-outline" size={18} color="#8F3A1F" />
                <Text style={styles.addBtnText}>Add Ingredient</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ========== STEP 3: COOKING STEPS ========== */}
          {currentStep === 'steps' && (
            <>
              <Text style={styles.sectionTitle}>Cooking Steps</Text>

              {steps.map((step, i) => (
                <View key={i} style={styles.stepCard}>
                  <View style={styles.stepHeader}>
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepBadgeText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.stepLabel}>Step {i + 1}</Text>
                    {steps.length > 1 && (
                      <TouchableOpacity onPress={() => removeStep(i)} style={{ marginLeft: 'auto' }}>
                        <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.3)" />
                      </TouchableOpacity>
                    )}
                  </View>

                  <TextInput
                    style={styles.input}
                    placeholder="Step title (e.g. Marinate the chicken)"
                    placeholderTextColor="#666"
                    value={step.title}
                    onChangeText={v => updateStep(i, 'title', v)}
                  />

                  <View style={styles.descriptionRow}>
                    <TextInput
                      style={[styles.input, styles.multiline, { flex: 1, marginBottom: 0 }]}
                      placeholder="Describe what to do... or tap the mic to speak"
                      placeholderTextColor="#666"
                      value={step.description}
                      onChangeText={v => updateStep(i, 'description', v)}
                      multiline
                      numberOfLines={3}
                    />
                    <VoiceInput
                      onTranscript={(text) => {
                        const current = step.description;
                        updateStep(i, 'description', current ? `${current} ${text}` : text);
                      }}
                      onTimerDetected={(minutes) => {
                        updateStep(i, 'timerMinutes', minutes);
                      }}
                    />
                  </View>

                  <View style={styles.stepExtras}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>Timer (min)</Text>
                      <TextInput
                        style={[styles.input, styles.miniInput]}
                        placeholder="0"
                        placeholderTextColor="#666"
                        value={step.timerMinutes ? String(step.timerMinutes) : ''}
                        onChangeText={v => updateStep(i, 'timerMinutes', parseInt(v) || 0)}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.miniLabel}>Tip (optional)</Text>
                      <TextInput
                        style={[styles.input, styles.miniInput]}
                        placeholder="Chef's tip for this step"
                        placeholderTextColor="#666"
                        value={step.tip || ''}
                        onChangeText={v => updateStep(i, 'tip', v)}
                      />
                    </View>
                  </View>

                  {/* Step Photo */}
                  {step.photoUri ? (
                    <TouchableOpacity
                      style={styles.stepPhotoPreview}
                      onPress={() => showImagePicker(uri => updateStep(i, 'photoUri', uri))}
                    >
                      <Image source={{ uri: step.photoUri }} style={styles.stepPhotoImage} contentFit="cover" />
                      <View style={styles.stepPhotoOverlay}>
                        <Ionicons name="camera" size={16} color="#FFF" />
                        <Text style={styles.stepPhotoOverlayText}>Change</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.stepPhotoBtn}
                      onPress={() => showImagePicker(uri => updateStep(i, 'photoUri', uri))}
                    >
                      <Ionicons name="camera-outline" size={20} color="#8F3A1F" />
                      <Text style={styles.stepPhotoBtnText}>Add Step Photo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity style={styles.addBtn} onPress={addStep}>
                <Ionicons name="add-circle-outline" size={18} color="#8F3A1F" />
                <Text style={styles.addBtnText}>Add Step</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ========== STEP 4: HERO IMAGE ========== */}
          {currentStep === 'hero' && (
            <>
              <Text style={styles.sectionTitle}>Final Dish Photo</Text>
              <Text style={styles.sectionSub}>
                Take a photo of your finished dish — this will be the recipe cover image.
              </Text>

              {heroImageUri ? (
                <TouchableOpacity
                  style={styles.heroPreview}
                  onPress={() => showImagePicker(uri => setHeroImageUri(uri))}
                >
                  <Image source={{ uri: heroImageUri }} style={styles.heroImage} contentFit="cover" />
                  <View style={styles.heroOverlay}>
                    <Ionicons name="camera" size={24} color="#FFF" />
                    <Text style={styles.heroOverlayText}>Change Photo</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.heroPickerArea}
                  onPress={() => showImagePicker(uri => setHeroImageUri(uri))}
                >
                  <Ionicons name="camera-outline" size={48} color="#8F3A1F" />
                  <Text style={styles.heroPickerText}>Tap to add photo</Text>
                  <Text style={styles.heroPickerSub}>Camera or Gallery</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ========== STEP 5: REVIEW ========== */}
          {currentStep === 'review' && (
            <>
              <Text style={styles.sectionTitle}>Review Your Recipe</Text>

              {/* Hero Image Preview */}
              {heroImageUri && (
                <Image source={{ uri: heroImageUri }} style={styles.reviewHero} contentFit="cover" />
              )}

              {/* Recipe Details */}
              <View style={styles.reviewCard}>
                <Text style={styles.reviewRecipeName}>{recipeName}</Text>
                {description ? <Text style={styles.reviewDescription}>{description}</Text> : null}
                <View style={styles.reviewMeta}>
                  <Text style={styles.reviewMetaItem}>{proteinEmoji} {proteinName}</Text>
                  {difficulty && <Text style={styles.reviewMetaItem}>📊 {difficulty}</Text>}
                  {cookTime && <Text style={styles.reviewMetaItem}>⏱️ {cookTime}</Text>}
                  {cuisine && <Text style={styles.reviewMetaItem}>🌍 {cuisine}</Text>}
                </View>
              </View>

              {/* Ingredients */}
              <View style={styles.reviewCard}>
                <Text style={styles.reviewSectionTitle}>
                  Ingredients ({ingredientsByTier['2-3 servings'].filter(i => i.name.trim()).length})
                </Text>
                {ingredientsByTier['2-3 servings'].filter(i => i.name.trim()).map((ing, i) => (
                  <Text key={i} style={styles.reviewIngredient}>
                    {getIngredientEmoji(ing.name)} {ing.quantity} {ing.name}
                  </Text>
                ))}
              </View>

              {/* Steps */}
              <View style={styles.reviewCard}>
                <Text style={styles.reviewSectionTitle}>
                  Cooking Steps ({steps.filter(s => s.description.trim()).length})
                </Text>
                {steps.filter(s => s.description.trim()).map((step, i) => (
                  <View key={i} style={styles.reviewStep}>
                    <View style={styles.reviewStepBadge}>
                      <Text style={styles.reviewStepBadgeText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      {step.title ? <Text style={styles.reviewStepTitle}>{step.title}</Text> : null}
                      <Text style={styles.reviewStepDesc}>{step.description}</Text>
                      {step.timerMinutes ? (
                        <Text style={styles.reviewStepTimer}>⏱️ {step.timerMinutes} min</Text>
                      ) : null}
                    </View>
                    {step.photoUri && (
                      <Image source={{ uri: step.photoUri }} style={styles.reviewStepPhoto} contentFit="cover" />
                    )}
                  </View>
                ))}
              </View>

              {/* Info note */}
              <View style={styles.disclaimer}>
                <Ionicons name="bookmark-outline" size={16} color="rgba(255,255,255,0.5)" />
                <Text style={styles.disclaimerText}>
                  Your recipe will be saved to your device for personal use.
                </Text>
              </View>
            </>
          )}
        </ScrollView>

        {/* Bottom Navigation */}
        <View style={styles.bottomBar}>
          {currentStep === 'review' ? (
            <TouchableOpacity
              style={[styles.nextBtn, submitting && styles.submitBtnDisabled]}
              onPress={() => handleSubmit(false)}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.nextBtnText}>Save Recipe</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
              <Text style={styles.nextBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  // Image import step
  importStep: { paddingVertical: 20 },
  importSection: { marginBottom: 20 },
  importCenter: { alignItems: 'center', paddingTop: 40, gap: 12 },
  importTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginTop: 12 },
  importSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
  importBtn: {
    marginTop: 16,
    backgroundColor: '#8F3A1F',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    ...Platform.select({
      ios: { shadowColor: '#8F3A1F', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  importBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  importSkipText: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 20,
    textDecorationLine: 'underline',
  },
  importPreview: { alignItems: 'center', gap: 12 },
  importPreviewImg: { width: '90%', height: 200, borderRadius: 16 },
  importError: { color: '#FF4444', fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },

  // Protein picker chips
  proteinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  proteinChipActive: { borderColor: '#8F3A1F', backgroundColor: 'rgba(143,58,31,0.15)' },
  proteinChipEmoji: { fontSize: 18 },
  proteinChipText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.60)' },
  proteinChipTextActive: { color: '#8F3A1F' },

  // Extraction banner
  extractionBanner: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.30)',
  },
  extractionBannerText: { fontSize: 13, fontWeight: '600', color: '#22C55E', textAlign: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(13,11,9,0.54)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    textAlign: 'center',
    marginHorizontal: 8,
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  progressItem: { alignItems: 'center', gap: 4 },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotActive: {
    borderColor: '#8F3A1F',
    backgroundColor: 'rgba(143,58,31,0.2)',
  },
  progressDotDone: {
    backgroundColor: '#8F3A1F',
    borderColor: '#8F3A1F',
  },
  progressDotText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  progressLabel: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: '600' },
  progressLabelActive: { color: '#8F3A1F' },

  scrollView: { flex: 1 },
  content: { padding: 16, paddingBottom: 100 },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#8F3A1F',
    marginTop: 20,
    marginBottom: 8,
  },
  sectionSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 16,
  },

  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 8,
    fontSize: 15,
  },
  multiline: { height: 80, textAlignVertical: 'top' },
  readOnlyField: { backgroundColor: 'rgba(255,255,255,0.05)' },
  readOnlyText: { color: 'rgba(255,255,255,0.7)', fontSize: 15 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  chipActive: {
    backgroundColor: 'rgba(143,58,31,0.2)',
    borderColor: '#8F3A1F',
  },
  chipText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#8F3A1F' },

  // Ingredients
  tierTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tierTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  tierTabActive: { borderColor: '#8F3A1F', backgroundColor: 'rgba(143,58,31,0.15)' },
  tierTabText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  tierTabTextActive: { color: '#8F3A1F' },

  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  ingredientEmoji: { fontSize: 18, width: 28, textAlign: 'center' },
  removeBtn: { padding: 4 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.4)',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  addBtnText: { color: '#8F3A1F', fontWeight: '700', fontSize: 14 },

  // Steps
  stepCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#8F3A1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  stepLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  descriptionRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },

  stepExtras: { flexDirection: 'row', gap: 8, marginTop: 8 },
  miniLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, fontWeight: '600' },
  miniInput: { marginBottom: 0, padding: 10, fontSize: 13 },

  stepPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.3)',
    borderStyle: 'dashed',
    marginTop: 10,
  },
  stepPhotoBtnText: { color: '#8F3A1F', fontSize: 13, fontWeight: '600' },
  stepPhotoPreview: { marginTop: 10, borderRadius: 10, overflow: 'hidden', height: 120 },
  stepPhotoImage: { width: '100%', height: '100%' },
  stepPhotoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  stepPhotoOverlayText: { color: '#FFF', fontSize: 13, fontWeight: '600' },

  // Hero Image
  heroPickerArea: {
    height: 250,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(143,58,31,0.3)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 8,
  },
  heroPickerText: { color: '#8F3A1F', fontSize: 16, fontWeight: '700' },
  heroPickerSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  heroPreview: { height: 250, borderRadius: 16, overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  heroOverlayText: { color: '#FFF', fontSize: 15, fontWeight: '600' },

  // Review
  reviewHero: { width: '100%', height: 200, borderRadius: 14, marginBottom: 16 },
  reviewCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  reviewRecipeName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    marginBottom: 6,
  },
  reviewDescription: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 10 },
  reviewMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  reviewMetaItem: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  reviewSectionTitle: { fontSize: 15, fontWeight: '700', color: '#8F3A1F', marginBottom: 10 },
  reviewIngredient: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  reviewStep: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  reviewStepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#8F3A1F',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  reviewStepBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  reviewStepTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  reviewStepDesc: { fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 18 },
  reviewStepTimer: { fontSize: 12, color: '#8F3A1F', marginTop: 4, fontWeight: '600' },
  reviewStepPhoto: { width: 60, height: 60, borderRadius: 8 },

  disclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginTop: 8,
  },
  disclaimerText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, flex: 1 },

  // Bottom Bar
  bottomBar: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    paddingTop: 12,
    backgroundColor: 'rgba(26,10,0,0.9)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#8F3A1F',
    borderRadius: 14,
    padding: 16,
  },
  nextBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#8F3A1F',
    borderRadius: 14,
    padding: 16,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  reviewBtnRow: { flexDirection: 'row', gap: 10 },
  saveDraftBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  saveDraftBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  publishBtn: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8F3A1F',
    borderRadius: 14,
    padding: 16,
  },
  publishBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
