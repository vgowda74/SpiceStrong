/**
 * RecipeOverviewScreen.tsx — SpiceStrong
 * Shows a quick overview of a recipe when the user taps a recipe card,
 * with ingredient list and Start Cooking / Back buttons.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ImageBackground,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { getRecipeById, getCompletionStats, type SavedRecipe, type QuantityTier } from '../../src/store/recipes';
import { type BuiltInRecipe } from '../../src/data/builtInRecipes';
import { getRecipeCardImage } from '../../src/data/recipeImages';
import { incrementCookCount } from '../../src/store/ratingsFavourites';
import { submitCookCount } from '../../services/ratingsService';
import { getRecipeImageUrls } from '../../services/recipeService';
// imageCacheService no longer needed — expo-image handles caching
import { loadRecipeImages } from '../../services/imageGenerationService';
import { trackEvent } from '../../services/analyticsService';

const ORANGE = '#8F3A1F';
const CARD_WHITE = '#FFFFFF';

export default function RecipeOverviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    recipeId: string;
    quantityTier: string;
  }>();

  const recipeId = params.recipeId ?? '';
  const quantityTier = (params.quantityTier ?? '2-3 servings') as QuantityTier;

  const [recipe, setRecipe] = useState<SavedRecipe | null>(null);
  const [heroImageUri, setHeroImageUri] = useState<string | null>(null);

  useEffect(() => {
    getRecipeById(recipeId).then((r) => {
      setRecipe(r);
      if (r) {
        trackEvent('recipe_viewed', {
          screen: 'RecipeOverviewScreen',
          recipeId,
          proteinId: (r as { proteinId?: string }).proteinId,
          metadata: { recipeName: r.name, quantityTier },
        });
      }
    });

    // Load hero image from Supabase → AI → built-in fallback chain
    (async () => {
      // Try Supabase hero image (expo-image caches automatically)
      try {
        const urls = await getRecipeImageUrls(recipeId);
        if (urls.heroUrl) { setHeroImageUri(urls.heroUrl); return; }
      } catch { /* continue */ }

      // Try AI-generated dish image
      try {
        const aiImgs = await loadRecipeImages(recipeId);
        if (aiImgs?.dishImage) { setHeroImageUri(aiImgs.dishImage); return; }
      } catch { /* continue */ }
    })();
  }, [recipeId]);

  if (!recipe) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const ingredients = recipe.ingredients[quantityTier] ?? recipe.ingredients['2-3 servings'] ?? [];
  const timeMinutes = (recipe as BuiltInRecipe).timeMinutes ?? null;
  const stats = getCompletionStats(recipe, quantityTier);
  const gradient: readonly [string, string] = (recipe as BuiltInRecipe).gradient ?? ['#8B4513', '#5D2E0C'];
  const builtInImage = getRecipeCardImage(recipe.id);
  // Image fallback: Supabase/AI URI → built-in static → null (emoji)
  const cardImage = heroImageUri ? { uri: heroImageUri } : builtInImage;
  const stepsCount = recipe.steps?.length ?? 0;
  const hasNutrition = stats.calories > 0;

  return (
    <ImageBackground
      source={require('../../assets/images/splash-bg.jpg')}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <View style={styles.container}>
        {/* Back button */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Hero section */}
          <View style={styles.heroWrap}>
            <LinearGradient colors={[gradient[0], gradient[1]]} style={styles.heroGradient}>
              {cardImage ? (
                <Image source={cardImage} style={styles.heroImage} contentFit="cover" transition={200} />
              ) : (
                <Text style={styles.heroEmoji}>{recipe.proteinEmoji}</Text>
              )}
            </LinearGradient>
          </View>

          {/* Recipe info */}
          <View style={styles.infoCard}>
            <Text style={styles.recipeName}>{recipe.name.replace(/^High-Protein\s+/i, '')}</Text>

            {/* Quick stats: cook time, steps */}
            <View style={styles.statsRow}>
              {timeMinutes != null && (
                <View style={styles.statBadge}>
                  <Text style={styles.statEmoji}>⏱️</Text>
                  <Text style={styles.statText}>{timeMinutes} min</Text>
                </View>
              )}
              {stepsCount > 0 && (
                <View style={styles.statBadge}>
                  <Text style={styles.statEmoji}>👣</Text>
                  <Text style={styles.statText}>{stepsCount} steps</Text>
                </View>
              )}
              <View style={styles.statBadge}>
                <Text style={styles.statEmoji}>🍽</Text>
                <Text style={styles.statText}>{stats.servings} servings</Text>
              </View>
            </View>

            {/* Per-serving nutrition */}
            {hasNutrition && (
              <View style={styles.macroCard}>
                <Text style={styles.macroCardTitle}>Per Serving</Text>
                <View style={styles.macroCardRow}>
                  <View style={styles.macroCardItem}>
                    <Text style={styles.macroCardValue}>{stats.calories}</Text>
                    <Text style={styles.macroCardLabel}>kcal</Text>
                  </View>
                  <View style={styles.macroCardDivider} />
                  <View style={styles.macroCardItem}>
                    <Text style={[styles.macroCardValue, styles.macroCardProtein]}>{stats.proteinG}g</Text>
                    <Text style={styles.macroCardLabel}>Protein</Text>
                  </View>
                  <View style={styles.macroCardDivider} />
                  <View style={styles.macroCardItem}>
                    <Text style={styles.macroCardValue}>{stats.carbsG}g</Text>
                    <Text style={styles.macroCardLabel}>Carbs</Text>
                  </View>
                  <View style={styles.macroCardDivider} />
                  <View style={styles.macroCardItem}>
                    <Text style={styles.macroCardValue}>{stats.fatG}g</Text>
                    <Text style={styles.macroCardLabel}>Fat</Text>
                  </View>
                </View>
              </View>
            )}

            {/* One-line description */}
            {(recipe.description || recipe.chefTip) ? (
              <Text style={styles.description} numberOfLines={2}>
                {recipe.description || recipe.chefTip}
              </Text>
            ) : null}

            {/* Ingredients (names only) */}
            {ingredients.length > 0 && (
              <View style={styles.ingredientSection}>
                <Text style={styles.sectionTitle}>Ingredients</Text>
                {ingredients.map((ing, i) => (
                  <View key={i} style={styles.ingredientRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.ingredientName}>{ing.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Bottom buttons */}
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.startButton}
            onPress={async () => {
              await incrementCookCount(recipe.id);
              submitCookCount(recipe.id).catch(() => {}); // Community count (fire-and-forget)
              router.push({
                pathname: '/screens/IngredientChecklistScreen',
                params: { recipeId: recipe.id, quantityTier },
              });
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.startButtonText}>Start Cooking 🔥</Text>
          </TouchableOpacity>
        </View>
      </View>

    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A0A00' },
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
  backText: {
    color: CARD_WHITE,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 30,
    ...Platform.select({
      ios: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
    }),
  },

  scroll: { paddingTop: 0, paddingBottom: 100 },

  // Hero
  heroWrap: {
    height: 220,
    overflow: 'hidden',
  },
  heroGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImage: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%',
    height: '100%',
  },
  heroEmoji: {
    fontSize: 80,
    ...Platform.select({
      ios: { textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 2, height: 4 }, textShadowRadius: 8 },
    }),
  },

  // Info card
  infoCard: {
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
  recipeName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 12,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
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

  // Per-serving macro card
  macroCard: {
    backgroundColor: '#FFF8F4',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0E4DC',
    padding: 14,
    marginBottom: 14,
  },
  macroCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8B7355',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 10,
  },
  macroCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  macroCardItem: { alignItems: 'center', flex: 1 },
  macroCardValue: { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  macroCardProtein: { color: '#8F3A1F' },
  macroCardLabel: { fontSize: 11, color: '#8B7355', marginTop: 2 },
  macroCardDivider: { width: 1, height: 30, backgroundColor: '#F0E4DC' },

  // Description
  description: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 16,
  },

  // Ingredients
  ingredientSection: { marginTop: 4 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EDE9E3',
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ORANGE,
    marginRight: 10,
  },
  ingredientName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
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
  editButton: {
    backgroundColor: 'rgba(143,58,31,0.2)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.5)',
  },
  editButtonText: {
    color: '#8F3A1F',
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
