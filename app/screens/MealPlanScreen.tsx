/**
 * MealPlanScreen.tsx — SpiceStrong
 * Fancy day-by-day meal plan view.
 * - Day navigator in header (← Month Day, Year →)
 * - Daily macro summary bar (total cal, protein, carbs, fat)
 * - Hero image recipe cards per meal slot, styled like RecipeListScreen
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ImageBackground,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getMealPlanForDate,
  removeFromMealPlan,
  SLOT_LABELS,
  type MealPlanEntry,
  type MealSlot,
} from '../../services/mealPlanService';
import { getRecipeById, getCompletionStats, type SavedRecipe } from '../../src/store/recipes';
import { getRecipeImageUrls } from '../../services/recipeService';
import { loadRecipeImages } from '../../services/imageGenerationService';
import { getRecipeCardImage } from '../../src/data/recipeImages';

const ORANGE = '#E85D26';
const BG = '#0F0F0F';
const SURFACE = '#1A1A1A';
const BORDER = 'rgba(255,255,255,0.10)';
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'PlayfairDisplay_700Bold',
  default: 'serif',
});

const CARD_W = Dimensions.get('window').width - 48;
const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch_dinner', 'snack_dessert'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

interface EnrichedEntry extends MealPlanEntry {
  recipe: SavedRecipe | null;
  imageUri: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

function dateFromString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function stringFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function formatDisplayDate(dateStr: string): string {
  const d = dateFromString(dateStr);
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

async function resolveImage(recipeId: string, recipe: SavedRecipe | null): Promise<string | null> {
  try {
    const urls = await getRecipeImageUrls(recipeId);
    if (urls.heroUrl) return urls.heroUrl;
  } catch {}
  try {
    const ai = await loadRecipeImages(recipeId);
    if (ai?.dishImage) return ai.dishImage;
  } catch {}
  if (recipe) {
    const builtin = getRecipeCardImage(recipe);
    if (builtin) return null; // built-in returns require() — handle below
  }
  return null;
}

export default function MealPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const today = stringFromDate(new Date());
  const [currentDate, setCurrentDate] = useState(today);
  const [enriched, setEnriched] = useState<EnrichedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEntries = useCallback(async (date: string) => {
    setLoading(true);
    const entries = await getMealPlanForDate(date);

    // Enrich each entry with full recipe details + images + nutrition
    const enrichedEntries = await Promise.all(
      entries.map(async (entry): Promise<EnrichedEntry> => {
        const recipe = await getRecipeById(entry.recipeId);
        const imageUri = await resolveImage(entry.recipeId, recipe);
        let calories = 0, proteinG = 0, carbsG = 0, fatG = 0;
        if (recipe) {
          const stats = getCompletionStats(recipe, '2-3 servings');
          calories = stats.calories;
          proteinG = stats.proteinG;
          carbsG = stats.carbsG;
          fatG = stats.fatG;
        }
        return { ...entry, recipe, imageUri, calories, proteinG, carbsG, fatG };
      })
    );

    setEnriched(enrichedEntries);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    loadEntries(currentDate);
  }, [currentDate, loadEntries]));

  const goToPrev = () => {
    const d = dateFromString(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(stringFromDate(d));
  };
  const goToNext = () => {
    const d = dateFromString(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(stringFromDate(d));
  };

  const handleRemove = (entry: MealPlanEntry) => {
    Alert.alert('Remove from Meal Plan', `Remove "${entry.recipeName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeFromMealPlan(entry.id, entry.date);
          loadEntries(currentDate);
        },
      },
    ]);
  };

  // Daily totals
  const totals = enriched.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      proteinG: acc.proteinG + e.proteinG,
      carbsG: acc.carbsG + e.carbsG,
      fatG: acc.fatG + e.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );

  const grouped: Record<MealSlot, EnrichedEntry[]> = {
    breakfast: [],
    lunch_dinner: [],
    snack_dessert: [],
  };
  enriched.forEach((e) => { if (grouped[e.slot]) grouped[e.slot].push(e); });

  const isToday = currentDate === today;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meal Plan</Text>
        <TouchableOpacity onPress={() => setCurrentDate(today)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.todayBtn, isToday && styles.todayBtnActive]}>Today</Text>
        </TouchableOpacity>
      </View>

      {/* Day navigator */}
      <View style={styles.dayNav}>
        <TouchableOpacity onPress={goToPrev} hitSlop={{ top: 12, bottom: 12, left: 20, right: 20 }}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.dayCenter}>
          <Text style={styles.dayLabel}>{formatDisplayDate(currentDate)}</Text>
          {isToday && (
            <View style={styles.todayPill}>
              <Text style={styles.todayPillText}>TODAY</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={goToNext} hitSlop={{ top: 12, bottom: 12, left: 20, right: 20 }}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ORANGE} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Daily macro summary — only show if there are entries */}
          {enriched.length > 0 && (
            <View style={styles.macroBar}>
              <Text style={styles.macroBarTitle}>Daily Total</Text>
              <View style={styles.macroRow}>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{totals.calories}</Text>
                  <Text style={styles.macroLabel}>kcal</Text>
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroItem}>
                  <Text style={[styles.macroValue, styles.macroProtein]}>{totals.proteinG}g</Text>
                  <Text style={styles.macroLabel}>Protein</Text>
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{totals.carbsG}g</Text>
                  <Text style={styles.macroLabel}>Carbs</Text>
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{totals.fatG}g</Text>
                  <Text style={styles.macroLabel}>Fat</Text>
                </View>
              </View>
            </View>
          )}

          {enriched.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>📅</Text>
              <Text style={styles.emptyTitle}>No meals planned</Text>
              <Text style={styles.emptySub}>
                Tap{' '}
                <Text style={styles.emptyHighlight}>Meal Plan</Text>
                {' '}on any recipe overview to add it here.
              </Text>
            </View>
          )}

          {SLOT_ORDER.map((slot) => {
            const slotEntries = grouped[slot];
            return (
              <View key={slot} style={styles.slotSection}>
                <Text style={styles.slotTitle}>{SLOT_LABELS[slot]}</Text>

                {slotEntries.length === 0 ? (
                  <View style={styles.emptySlot}>
                    <Text style={styles.emptySlotText}>No recipe planned</Text>
                  </View>
                ) : (
                  slotEntries.map((entry) => {
                    const builtinImg = entry.recipe ? getRecipeCardImage(entry.recipe) : null;
                    return (
                      <View key={entry.id} style={styles.card}>
                        {/* Hero image */}
                        <View style={styles.cardHero}>
                          {entry.imageUri ? (
                            <Image
                              source={{ uri: entry.imageUri }}
                              style={styles.cardHeroImg}
                              contentFit="cover"
                            />
                          ) : builtinImg ? (
                            <Image
                              source={builtinImg}
                              style={styles.cardHeroImg}
                              contentFit="cover"
                            />
                          ) : (
                            <LinearGradient
                              colors={['#3D1A0A', '#1A0500']}
                              style={styles.cardHeroFallback}
                            >
                              <Text style={styles.cardHeroEmoji}>{entry.proteinEmoji}</Text>
                            </LinearGradient>
                          )}
                          <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.75)']}
                            style={styles.cardHeroGradient}
                          />
                          {/* Remove button */}
                          <TouchableOpacity
                            style={styles.removeBtn}
                            onPress={() => handleRemove(entry)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.removeBtnText}>✕</Text>
                          </TouchableOpacity>
                        </View>

                        {/* Card body */}
                        <View style={styles.cardBody}>
                          <View style={styles.cardTitleRow}>
                            <Text style={styles.cardTitle} numberOfLines={2}>{entry.recipeName}</Text>
                          </View>
                          <View style={styles.cardMeta}>
                            <View style={styles.cardPill}>
                              <Text style={styles.cardPillText}>{entry.proteinEmoji} {entry.proteinName}</Text>
                            </View>
                            {entry.calories > 0 && (
                              <View style={styles.cardPill}>
                                <Text style={styles.cardPillText}>🔥 {entry.calories} kcal</Text>
                              </View>
                            )}
                            {entry.proteinG > 0 && (
                              <View style={[styles.cardPill, styles.cardPillProtein]}>
                                <Text style={[styles.cardPillText, styles.cardPillProteinText]}>💪 {entry.proteinG}g protein</Text>
                              </View>
                            )}
                          </View>
                          {entry.carbsG > 0 || entry.fatG > 0 ? (
                            <View style={styles.cardMacroRow}>
                              {entry.carbsG > 0 && (
                                <Text style={styles.cardMacroText}>Carbs {entry.carbsG}g</Text>
                              )}
                              {entry.carbsG > 0 && entry.fatG > 0 && (
                                <Text style={styles.cardMacroDot}>·</Text>
                              )}
                              {entry.fatG > 0 && (
                                <Text style={styles.cardMacroText}>Fat {entry.fatG}g</Text>
                              )}
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  back: { fontSize: 24, color: '#FFFFFF', fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', fontFamily: PLAYFAIR },
  todayBtn: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.40)' },
  todayBtnActive: { color: ORANGE },

  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  navArrow: { fontSize: 34, color: ORANGE, fontWeight: '700', lineHeight: 38 },
  dayCenter: { alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  todayPill: {
    backgroundColor: 'rgba(232,93,38,0.20)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.45)',
  },
  todayPillText: { fontSize: 10, fontWeight: '800', color: ORANGE, letterSpacing: 1 },

  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  // Macro summary bar
  macroBar: {
    backgroundColor: SURFACE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 24,
  },
  macroBarTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    textAlign: 'center',
  },
  macroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  macroItem: { alignItems: 'center', flex: 1 },
  macroValue: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  macroProtein: { color: ORANGE },
  macroLabel: { fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 2 },
  macroDivider: { width: 1, height: 36, backgroundColor: BORDER },

  // Empty states
  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 10 },
  emptySub: { fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 22 },
  emptyHighlight: { color: ORANGE, fontWeight: '700' },

  // Slot sections
  slotSection: { marginBottom: 28 },
  slotTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  emptySlot: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: 'dashed',
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptySlotText: { color: 'rgba(255,255,255,0.25)', fontSize: 14 },

  // Recipe hero card
  card: {
    width: CARD_W,
    backgroundColor: SURFACE,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BORDER,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 6 },
    }),
  },
  cardHero: { height: 160, position: 'relative' },
  cardHeroImg: { width: '100%', height: '100%' },
  cardHeroFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeroEmoji: { fontSize: 56 },
  cardHeroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  removeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  cardBody: { padding: 14 },
  cardTitleRow: { marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', lineHeight: 22 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  cardPill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  cardPillText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  cardPillProtein: {
    backgroundColor: 'rgba(232,93,38,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.35)',
  },
  cardPillProteinText: { color: ORANGE },
  cardMacroRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardMacroText: { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },
  cardMacroDot: { fontSize: 12, color: 'rgba(255,255,255,0.25)' },
});
