/**
 * AddRecipeScreen.tsx — Full 5-step recipe creation wizard.
 * Allows users to submit their own recipes with photos, voice input, and auto nutrition.
 *
 * Steps: Basics → Ingredients → Cooking Steps → Hero Image → Review & Submit
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput,
  Alert, Platform, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { QUANTITY_TIERS, type QuantityTier, type IngredientsByTier, type CookingStep, saveRecipe, getRecipeById } from '../../src/store/recipes';
import { saveAIRecipe, uploadRecipeHeroImage, uploadStepImage, updateRecipeStatus } from '../../services/recipeService';
import { generateAllRecipeImages, saveRecipeImages, loadRecipeImages } from '../../services/imageGenerationService';
import { submitRecipeForReview, reviewRecipe } from '../../services/recipeReviewService';
import { INGREDIENT_MAP, CATEGORY_EMOJI } from '../../src/data/ingredientMapping';
import { PROTEINS } from '../../src/theme';
import { filterProteinsForPreference, getDietPreference, isNonVegProteinId, type DietPreference } from '../../src/utils/dietPreference';
import VoiceInput from '../../components/VoiceInput';
import { HomeButton } from '../../components/HomeButton';

type WizardStep = 'basics' | 'ingredients' | 'steps' | 'hero' | 'review';
const WIZARD_STEPS: WizardStep[] = ['basics', 'ingredients', 'steps', 'hero', 'review'];
const STEP_LABELS = ['Basics', 'Ingredients', 'Steps', 'Photo', 'Review'];

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
  const isCopyAsNew = params.copyAsNew === 'true';
  const isEditing = !!params.editRecipeId;

  // Protein can be overridden when coming from menu (user picks or Claude detects)
  const [proteinId, setProteinId] = useState(params.proteinId || '');
  const [proteinName, setProteinName] = useState(params.proteinName || '');
  const [selectedProteinEmoji, setSelectedProteinEmoji] = useState(params.proteinEmoji || '🍽');
  const [dietPreference, setDietPreferenceState] = useState<DietPreference | null>('veg');

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('basics');
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
    if (currentStep === 'basics') {
      router.back();
      return;
    }
    let prevIdx = currentStepIndex - 1;
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

  // --- Render ---
  return (
    <View style={styles.screen}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0D0B09' },
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
