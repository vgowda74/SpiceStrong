/**
 * RecipeOverviewScreen.tsx — SpiceStrong
 * Shows a quick overview of a recipe when the user taps a recipe card,
 * with ingredient list and Start Cooking / Back buttons.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { getRecipeById, type SavedRecipe, type QuantityTier } from '../../src/store/recipes';
import { type BuiltInRecipe } from '../../src/data/builtInRecipes';
import { getRecipeCardImage } from '../../src/data/recipeImages';
import { incrementCookCount } from '../../src/store/ratingsFavourites';
import { submitCookCount } from '../../services/ratingsService';
import { getRecipeImageUrls } from '../../services/recipeService';
// imageCacheService no longer needed — expo-image handles caching
import { loadRecipeImages } from '../../services/imageGenerationService';
import {
  addToMealPlan,
  getMealPlanForDate,
  SLOT_LABELS,
  SLOT_LIMITS,
  type MealSlot,
} from '../../services/mealPlanService';

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
  const [heroImageUri, setHeroImageUri] = useState<string | null>(null);

  // Meal plan modal state
  const [mealPlanOpen, setMealPlanOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [selectedSlot, setSelectedSlot] = useState<MealSlot | null>(null);
  const [slotCounts, setSlotCounts] = useState<Record<MealSlot, number>>({ breakfast: 0, lunch_dinner: 0, snack_dessert: 0 });
  const [addingMeal, setAddingMeal] = useState(false);
  const mpSlideAnim = useRef(new Animated.Value(300)).current;

  // Reload slot counts when selected date changes
  useEffect(() => {
    getMealPlanForDate(selectedDate).then((entries) => {
      const counts: Record<MealSlot, number> = { breakfast: 0, lunch_dinner: 0, snack_dessert: 0 };
      entries.forEach((e) => { counts[e.slot] = (counts[e.slot] ?? 0) + 1; });
      setSlotCounts(counts);
    });
  }, [selectedDate]);

  const openMealPlan = () => {
    setMealPlanOpen(true);
    Animated.spring(mpSlideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const closeMealPlan = () => {
    Animated.timing(mpSlideAnim, { toValue: 300, duration: 220, useNativeDriver: true }).start(() =>
      setMealPlanOpen(false)
    );
  };

  const handleAddToMealPlan = async () => {
    if (!recipe || !selectedSlot) return;
    setAddingMeal(true);
    const result = await addToMealPlan(selectedDate, selectedSlot, {
      id: recipe.id,
      name: recipe.name,
      proteinName: recipe.proteinName,
      proteinEmoji: recipe.proteinEmoji,
      mealType: recipe.mealType,
    });
    setAddingMeal(false);
    if (result.success) {
      closeMealPlan();
      Alert.alert('Added!', `${recipe.name} added to your meal plan for ${selectedDate}.`);
    } else {
      Alert.alert('Slot Full', result.error ?? 'Could not add to meal plan.');
    }
  };

  // Calendar helpers
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const calendarDays = (() => {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const days: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return days;
  })();

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  useEffect(() => {
    getRecipeById(recipeId).then(setRecipe);

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
  const nutrition = (recipe as BuiltInRecipe).nutrition ?? null;
  // Nutrition is stored as whole "2-3 servings" batch — show batch total
  const batchProteinG = nutrition?.proteinG ?? recipe.aiNutrition?.proteinG ?? null;
  const gradient: readonly [string, string] = (recipe as BuiltInRecipe).gradient ?? ['#8B4513', '#5D2E0C'];
  const builtInImage = getRecipeCardImage(recipe.id);
  // Image fallback: Supabase/AI URI → built-in static → null (emoji)
  const cardImage = heroImageUri ? { uri: heroImageUri } : builtInImage;
  const stepsCount = recipe.steps?.length ?? 0;

  return (
    <ImageBackground
      source={require('../../assets/images/splash-bg.jpg')}
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
                <Image source={cardImage} style={styles.heroImage} contentFit="cover" transition={200} />
              ) : (
                <Text style={styles.heroEmoji}>{recipe.proteinEmoji}</Text>
              )}
            </LinearGradient>
          </View>

          {/* Recipe info */}
          <View style={styles.infoCard}>
            <Text style={styles.recipeName}>{recipe.name.replace(/^High-Protein\s+/i, '')}</Text>

            {/* Quick stats: cook time, protein, steps */}
            <View style={styles.statsRow}>
              {timeMinutes != null && (
                <View style={styles.statBadge}>
                  <Text style={styles.statEmoji}>⏱️</Text>
                  <Text style={styles.statText}>{timeMinutes} min</Text>
                </View>
              )}
              {batchProteinG != null && (
                <View style={styles.statBadge}>
                  <Text style={styles.statEmoji}>💪</Text>
                  <Text style={styles.statText}>{batchProteinG}g protein</Text>
                </View>
              )}
              {stepsCount > 0 && (
                <View style={styles.statBadge}>
                  <Text style={styles.statEmoji}>👣</Text>
                  <Text style={styles.statText}>{stepsCount} steps</Text>
                </View>
              )}
            </View>

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
            style={styles.mealPlanButton}
            onPress={openMealPlan}
            activeOpacity={0.8}
          >
            <Text style={styles.mealPlanButtonText}>📅</Text>
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

      {/* Meal Plan Modal */}
      <Modal visible={mealPlanOpen} transparent animationType="none" onRequestClose={closeMealPlan} statusBarTranslucent>
        <Pressable style={styles.mpBackdrop} onPress={closeMealPlan}>
          <Animated.View style={[styles.mpSheet, { transform: [{ translateY: mpSlideAnim }] }]}>
            <Pressable onPress={() => {}}>
              {/* Handle */}
              <View style={styles.mpHandle} />
              <Text style={styles.mpTitle}>Add to Meal Plan</Text>

              {/* Month navigator */}
              <View style={styles.mpMonthRow}>
                <TouchableOpacity
                  onPress={() => setCalendarMonth(({ year, month }) => month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 })}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.mpNavArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.mpMonthLabel}>
                  {MONTH_NAMES[calendarMonth.month - 1]} {calendarMonth.year}
                </Text>
                <TouchableOpacity
                  onPress={() => setCalendarMonth(({ year, month }) => month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 })}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.mpNavArrow}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Day-of-week headers */}
              <View style={styles.mpDayHeaders}>
                {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => (
                  <Text key={d} style={styles.mpDayHeader}>{d}</Text>
                ))}
              </View>

              {/* Calendar grid */}
              <View style={styles.mpGrid}>
                {calendarDays.map((date, idx) => {
                  if (!date) return <View key={`empty-${idx}`} style={styles.mpDayCell} />;
                  const isToday = date === today;
                  const isSelected = date === selectedDate;
                  const isPast = date < today;
                  return (
                    <TouchableOpacity
                      key={date}
                      style={[
                        styles.mpDayCell,
                        isToday && styles.mpDayCellToday,
                        isSelected && styles.mpDayCellSelected,
                        isPast && styles.mpDayCellPast,
                      ]}
                      onPress={() => !isPast && setSelectedDate(date)}
                      activeOpacity={isPast ? 1 : 0.7}
                    >
                      <Text style={[
                        styles.mpDayNum,
                        isSelected && styles.mpDayNumSelected,
                        isPast && styles.mpDayNumPast,
                      ]}>
                        {parseInt(date.split('-')[2], 10)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Slot selector */}
              <Text style={styles.mpSlotLabel}>MEAL SLOT</Text>
              {(Object.keys(SLOT_LABELS) as MealSlot[]).map((slot) => {
                const count = slotCounts[slot] ?? 0;
                const limit = SLOT_LIMITS[slot];
                const full = count >= limit;
                const selected = selectedSlot === slot;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[styles.mpSlot, selected && styles.mpSlotSelected, full && styles.mpSlotFull]}
                    onPress={() => !full && setSelectedSlot(slot)}
                    activeOpacity={full ? 1 : 0.75}
                  >
                    <Text style={[styles.mpSlotText, selected && styles.mpSlotTextSelected, full && styles.mpSlotTextFull]}>
                      {SLOT_LABELS[slot]}
                    </Text>
                    <Text style={styles.mpSlotCount}>{count}/{limit}</Text>
                  </TouchableOpacity>
                );
              })}

              {/* Confirm button */}
              <TouchableOpacity
                style={[styles.mpConfirmBtn, (!selectedSlot || addingMeal) && styles.mpConfirmBtnDisabled]}
                onPress={handleAddToMealPlan}
                disabled={!selectedSlot || addingMeal}
                activeOpacity={0.8}
              >
                <Text style={styles.mpConfirmText}>{addingMeal ? 'Adding…' : 'Add to Meal Plan'}</Text>
              </TouchableOpacity>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
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
    backgroundColor: 'rgba(232,93,38,0.2)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.5)',
  },
  editButtonText: {
    color: '#E85D26',
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

  // Meal plan button (icon-only, in bottom bar)
  mealPlanButton: {
    backgroundColor: 'rgba(232,93,38,0.18)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.4)',
  },
  mealPlanButtonText: { fontSize: 20 },

  // Meal plan modal sheet
  mpBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  mpSheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  mpHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  mpTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  mpMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  mpNavArrow: { fontSize: 28, color: ORANGE, fontWeight: '700', lineHeight: 32 },
  mpMonthLabel: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  mpDayHeaders: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  mpDayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.40)',
    textTransform: 'uppercase',
  },
  mpGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  mpDayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mpDayCellToday: {
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: ORANGE,
  },
  mpDayCellSelected: {
    borderRadius: 100,
    backgroundColor: ORANGE,
  },
  mpDayCellPast: { opacity: 0.30 },
  mpDayNum: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  mpDayNumSelected: { color: '#FFFFFF', fontWeight: '800' },
  mpDayNumPast: { color: 'rgba(255,255,255,0.4)' },

  // Slot selector
  mpSlotLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  mpSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#252525',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  mpSlotSelected: { borderColor: ORANGE, backgroundColor: 'rgba(232,93,38,0.15)' },
  mpSlotFull: { opacity: 0.40 },
  mpSlotText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  mpSlotTextSelected: { color: ORANGE },
  mpSlotTextFull: { color: 'rgba(255,255,255,0.5)' },
  mpSlotCount: { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '600' },

  mpConfirmBtn: {
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  mpConfirmBtnDisabled: { opacity: 0.45 },
  mpConfirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
