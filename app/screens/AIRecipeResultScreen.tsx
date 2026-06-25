/**
 * AIRecipeResultScreen.tsx — SpiceStrong
 * Displays a fully enriched AI-generated recipe with DALL-E images
 * for ingredients and cooking steps.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { getRecipeById, type SavedRecipe, type QuantityTier, SERVINGS_PER_TIER } from '../../src/store/recipes';
import { type BuiltInRecipe } from '../../src/data/builtInRecipes';
import { incrementCookCount } from '../../src/store/ratingsFavourites';
import { loadRecipeImages, type RecipeImageResults } from '../../services/imageGenerationService';

const ORANGE = '#8F3A1F';
const DARK_BG = '#1A0A00';

export default function AIRecipeResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    recipeId: string;
    quantityTier: string;
    fromBuilder: string;
  }>();

  const recipeId = params.recipeId ?? '';
  const quantityTier = (params.quantityTier ?? '2-3 servings') as QuantityTier;

  const [recipe, setRecipe] = useState<SavedRecipe | null>(null);
  const [aiImages, setAiImages] = useState<RecipeImageResults | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getRecipeById(recipeId).then(setRecipe);
    loadRecipeImages(recipeId).then(setAiImages);
  }, [recipeId]);

  // Poll for background-generated images every 30s until they arrive
  useEffect(() => {
    if (aiImages) return; // already have images
    pollRef.current = setInterval(() => {
      loadRecipeImages(recipeId).then((result) => {
        if (result) {
          setAiImages(result);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      });
    }, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [recipeId, aiImages]);

  const ingredientImages = aiImages?.ingredientImages ?? {};
  const stepImages = aiImages?.stepImages ?? {};

  if (!recipe) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const ingredients = recipe.ingredients[quantityTier] ?? recipe.ingredients['2-3 servings'] ?? [];
  // Nutrition is stored as whole "2-3 servings" batch — divide for per-serving display
  const nutrition = (recipe as BuiltInRecipe).nutrition ?? null;
  const s = SERVINGS_PER_TIER['2-3 servings']; // 2.5
  const batchProteinG = nutrition?.proteinG ?? recipe.aiNutrition?.proteinG ?? null;
  const batchCalories = nutrition?.calories ?? recipe.aiNutrition?.calories ?? null;
  const proteinG = batchProteinG != null ? Math.round(batchProteinG / s) : null;
  const calories = batchCalories != null ? Math.round(batchCalories / s) : null;
  const steps = recipe.steps ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.overlay} />
      <View style={styles.container}>
        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.backBtnText}>{'\u2190'}</Text>
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Hero section */}
          <View style={styles.heroWrap}>
            <LinearGradient colors={['#8B4513', '#5D2E0C']} style={styles.heroGradient}>
              <Text style={styles.heroEmoji}>{recipe.proteinEmoji}</Text>
            </LinearGradient>
          </View>

          {/* Recipe header card */}
          <View style={styles.headerCard}>
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>{'\u2728'} AI Generated</Text>
            </View>
            {!aiImages && (
              <View style={styles.imgGenBanner}>
                <ActivityIndicator size="small" color="#8F3A1F" />
                <Text style={styles.imgGenBannerText}>
                  AI images are generating in the background. They'll appear automatically in a few minutes.
                </Text>
              </View>
            )}
            <Text style={styles.recipeName}>{recipe.name}</Text>

            {/* Stats row */}
            <View style={styles.statsRow}>
              {proteinG != null && (
                <View style={styles.statBadge}>
                  <Text style={styles.statEmoji}>{'\uD83D\uDCAA'}</Text>
                  <Text style={styles.statText}>{proteinG}g protein</Text>
                </View>
              )}
              {calories != null && (
                <View style={styles.statBadge}>
                  <Text style={styles.statEmoji}>{'\uD83D\uDD25'}</Text>
                  <Text style={styles.statText}>{calories} kcal</Text>
                </View>
              )}
              {steps.length > 0 && (
                <View style={styles.statBadge}>
                  <Text style={styles.statEmoji}>{'\uD83D\uDC63'}</Text>
                  <Text style={styles.statText}>{steps.length} steps</Text>
                </View>
              )}
            </View>

            {/* Description */}
            {(recipe.description || recipe.chefTip) ? (
              <Text style={styles.description} numberOfLines={2}>
                {recipe.description || recipe.chefTip}
              </Text>
            ) : null}
          </View>

          {/* Ingredients section */}
          {ingredients.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ingredients</Text>
              {ingredients.map((ing, i) => {
                const imgUrl = ingredientImages[ing.name] ?? null;
                return (
                  <View key={i} style={styles.ingredientRow}>
                    <View style={styles.ingredientImgWrap}>
                      {imgUrl ? (
                        <View>
                          <Image source={{ uri: imgUrl }} style={styles.ingredientImg} />
                          <View style={styles.aiWatermark}>
                            <Text style={styles.aiWatermarkText}>{'\u2728'}</Text>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.ingredientPlaceholder}>
                          <Text style={styles.ingredientPlaceholderEmoji}>{'\uD83E\uDD58'}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.ingredientInfo}>
                      <Text style={styles.ingredientName}>{ing.name}</Text>
                      {ing.quantity ? (
                        <Text style={styles.ingredientQty}>{ing.quantity}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Cooking Steps section */}
          {steps.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>How to Cook</Text>
              {steps.map((step, i) => {
                const imgUrl = stepImages[String(i)] ?? null;
                return (
                  <View key={i} style={styles.stepCard}>
                    {imgUrl ? (
                      <View style={styles.stepImgWrap}>
                        <Image source={{ uri: imgUrl }} style={styles.stepImg} />
                        <View style={styles.aiWatermark}>
                          <Text style={styles.aiWatermarkText}>{'\u2728'}</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.stepPlaceholder}>
                        <View style={styles.stepNumberCircle}>
                          <Text style={styles.stepNumberText}>{i + 1}</Text>
                        </View>
                      </View>
                    )}
                    <View style={styles.stepContent}>
                      <Text style={styles.stepLabel}>
                        {step.emoji ? `${step.emoji} ` : ''}Step {i + 1}
                        {step.title ? ` — ${step.title}` : ''}
                      </Text>
                      <Text style={styles.stepDesc}>{step.description}</Text>
                      {step.timerMinutes != null && step.timerMinutes > 0 && (
                        <View style={styles.timerBadge}>
                          <Text style={styles.timerText}>
                            {'\u23F1\uFE0F'} {step.timerMinutes} min
                          </Text>
                        </View>
                      )}
                      {step.tip ? (
                        <Text style={styles.stepTip}>
                          {'\uD83D\uDCA1'} {step.tip}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Bottom buttons */}
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backButtonText}>{'\u2190'} Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.startButton}
            onPress={async () => {
              await incrementCookCount(recipe.id);
              router.push({
                pathname: '/screens/IngredientChecklistScreen',
                params: { recipeId: recipe.id, quantityTier },
              });
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.startButtonText}>Start Cooking {'\uD83D\uDD25'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0D0B09' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK_BG },
  loadingText: { color: '#fff', fontSize: 16 },

  backBtn: {
    position: 'absolute',
    top: 52,
    left: 16,
    zIndex: 10,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,11,9,0.54)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '900',
    ...Platform.select({
      ios: { textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
    }),
  },

  scroll: { paddingTop: 0, paddingBottom: 120 },

  // Hero
  heroWrap: { height: 200, overflow: 'hidden' },
  heroGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroEmoji: {
    fontSize: 80,
    ...Platform.select({
      ios: { textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 2, height: 4 }, textShadowRadius: 8 },
    }),
  },

  // Header card
  headerCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    marginHorizontal: 16,
    marginTop: -24,
    borderRadius: 20,
    padding: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 8 },
    }),
  },
  aiBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(143,58,31,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 8,
  },
  aiBadgeText: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: '700',
  },
  imgGenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(143,58,31,0.08)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  imgGenBannerText: {
    color: '#ccc',
    fontSize: 12,
    flex: 1,
  },
  recipeName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 12,
    fontFamily: Platform.OS === 'ios' ? 'Playfair Display' : undefined,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3ED',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  statEmoji: { fontSize: 13 },
  statText: { fontSize: 13, fontWeight: '600', color: '#8B4513' },
  description: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },

  // Sections
  section: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 16,
    fontFamily: Platform.OS === 'ios' ? 'Playfair Display' : undefined,
  },

  // Ingredients
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EDE9E3',
  },
  ingredientImgWrap: {
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 14,
  },
  ingredientImg: {
    width: 60,
    height: 60,
    borderRadius: 12,
  },
  ingredientPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#FFF3ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingredientPlaceholderEmoji: { fontSize: 28 },
  ingredientInfo: { flex: 1 },
  ingredientName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  ingredientQty: {
    fontSize: 13,
    color: '#8B4513',
    fontWeight: '500',
    marginTop: 2,
  },

  // Steps
  stepCard: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FAFAF8',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EDE9E3',
  },
  stepImgWrap: {
    width: '100%',
    height: 180,
    overflow: 'hidden',
  },
  stepImg: {
    width: '100%',
    height: 180,
  },
  stepPlaceholder: {
    width: '100%',
    height: 100,
    backgroundColor: '#FFF3ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  stepContent: {
    padding: 16,
  },
  stepLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  stepDesc: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  timerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF3ED',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginTop: 10,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8B4513',
  },
  stepTip: {
    fontSize: 13,
    color: '#8B4513',
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 18,
  },

  // AI Watermark
  aiWatermark: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  aiWatermarkText: {
    fontSize: 10,
    color: '#FFFFFF',
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    paddingTop: 12,
    gap: 12,
    backgroundColor: 'rgba(26,10,0,0.9)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  startButton: {
    flex: 2,
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
});
