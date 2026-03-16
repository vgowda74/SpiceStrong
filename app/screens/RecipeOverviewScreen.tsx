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
  Image,
} from 'react-native';

import { getRecipeById, type SavedRecipe, type QuantityTier } from '../../src/store/recipes';
import { type BuiltInRecipe, type NutritionInfo } from '../../src/data/builtInRecipes';
import { getRecipeCardImage } from '../../src/data/recipeImages';

const ORANGE = '#E85D26';
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

  useEffect(() => {
    getRecipeById(recipeId).then(setRecipe);
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
  const difficulty = (recipe as BuiltInRecipe).difficulty ?? null;
  const nutrition = (recipe as BuiltInRecipe).nutrition ?? null;
  const gradient: readonly [string, string] = (recipe as BuiltInRecipe).gradient ?? ['#8B4513', '#5D2E0C'];
  const cardImage = getRecipeCardImage(recipe.id);
  const stepsCount = recipe.steps?.length ?? 0;

  return (
    <ImageBackground
      source={require('../../assets/images/splash-bg.png')}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <View style={styles.container}>
        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Hero section */}
          <View style={styles.heroWrap}>
            <LinearGradient colors={[gradient[0], gradient[1]]} style={styles.heroGradient}>
              {cardImage ? (
                <Image source={cardImage} style={styles.heroImage} resizeMode="cover" />
              ) : (
                <Text style={styles.heroEmoji}>{recipe.proteinEmoji}</Text>
              )}
            </LinearGradient>
          </View>

          {/* Recipe info */}
          <View style={styles.infoCard}>
            <Text style={styles.recipeName}>{recipe.name}</Text>

            {/* Quick stats */}
            <View style={styles.statsRow}>
              {timeMinutes != null && (
                <View style={styles.statBadge}>
                  <Text style={styles.statEmoji}>⏱️</Text>
                  <Text style={styles.statText}>{timeMinutes} min</Text>
                </View>
              )}
              {difficulty != null && (
                <View style={styles.statBadge}>
                  <Text style={styles.statEmoji}>📊</Text>
                  <Text style={styles.statText}>{difficulty}</Text>
                </View>
              )}
              {stepsCount > 0 && (
                <View style={styles.statBadge}>
                  <Text style={styles.statEmoji}>👣</Text>
                  <Text style={styles.statText}>{stepsCount} steps</Text>
                </View>
              )}
            </View>

            {/* Nutrition quick view */}
            {nutrition && (
              <View style={styles.nutritionRow}>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{nutrition.calories}</Text>
                  <Text style={styles.nutritionLabel}>kcal</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{nutrition.proteinG}g</Text>
                  <Text style={styles.nutritionLabel}>protein</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{nutrition.fatG}g</Text>
                  <Text style={styles.nutritionLabel}>fat</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{nutrition.carbsG}g</Text>
                  <Text style={styles.nutritionLabel}>carbs</Text>
                </View>
              </View>
            )}

            {/* Description / chef tip */}
            {recipe.chefTip ? (
              <Text style={styles.description}>{recipe.chefTip}</Text>
            ) : recipe.description ? (
              <Text style={styles.description}>{recipe.description}</Text>
            ) : null}

            {/* Ingredients */}
            <View style={styles.ingredientSection}>
              <Text style={styles.sectionTitle}>Ingredients ({quantityTier})</Text>
              {ingredients.map((ing, i) => (
                <View key={i} style={styles.ingredientRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.ingredientName}>{ing.name}</Text>
                  <Text style={styles.ingredientQty}>{ing.quantity}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Bottom buttons */}
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.startButton}
            onPress={() =>
              router.push({
                pathname: '/screens/IngredientChecklistScreen',
                params: { recipeId: recipe.id, quantityTier },
              })
            }
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

  backBtn: { position: 'absolute', top: 52, left: 20, zIndex: 10 },
  backText: {
    color: CARD_WHITE,
    fontSize: 30,
    fontWeight: '700',
    ...Platform.select({
      ios: { textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
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

  // Nutrition
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FAF7F2',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  nutritionItem: { alignItems: 'center' },
  nutritionValue: { fontSize: 16, fontWeight: '800', color: ORANGE },
  nutritionLabel: { fontSize: 11, fontWeight: '600', color: '#8B7355', marginTop: 2 },

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
  ingredientQty: {
    fontSize: 14,
    fontWeight: '600',
    color: ORANGE,
    marginLeft: 8,
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
