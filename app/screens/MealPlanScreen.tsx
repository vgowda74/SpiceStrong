/**
 * MealPlanScreen.tsx — SpiceStrong
 * Day-by-day meal plan view.
 * Header: ← Month Day, Year → (prev/next day navigation)
 * Body: recipes grouped by meal slot (Breakfast / Lunch-Dinner / Snack-Dessert)
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getMealPlanForDate,
  removeFromMealPlan,
  SLOT_LABELS,
  type MealPlanEntry,
  type MealSlot,
} from '../../services/mealPlanService';

const ORANGE = '#E85D26';
const BG = '#0F0F0F';
const SURFACE = '#1A1A1A';
const BORDER = 'rgba(255,255,255,0.10)';
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'PlayfairDisplay_700Bold',
  default: 'serif',
});

const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch_dinner', 'snack_dessert'];

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function dateFromString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function stringFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(dateStr: string): string {
  const d = dateFromString(dateStr);
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function MealPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const today = stringFromDate(new Date());
  const [currentDate, setCurrentDate] = useState(today);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEntries = useCallback(async (date: string) => {
    setLoading(true);
    const data = await getMealPlanForDate(date);
    setEntries(data);
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
    Alert.alert(
      'Remove from Meal Plan',
      `Remove "${entry.recipeName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeFromMealPlan(entry.id, entry.date);
            loadEntries(currentDate);
          },
        },
      ]
    );
  };

  const groupedBySlot: Record<MealSlot, MealPlanEntry[]> = {
    breakfast: [],
    lunch_dinner: [],
    snack_dessert: [],
  };
  entries.forEach((e) => {
    if (groupedBySlot[e.slot]) groupedBySlot[e.slot].push(e);
  });

  const isToday = currentDate === today;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meal Plan</Text>
        <TouchableOpacity
          onPress={() => setCurrentDate(today)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.todayBtn, isToday && styles.todayBtnActive]}>Today</Text>
        </TouchableOpacity>
      </View>

      {/* Day navigator */}
      <View style={styles.dayNav}>
        <TouchableOpacity onPress={goToPrev} hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.dayCenter}>
          <Text style={styles.dayLabel}>{formatDisplayDate(currentDate)}</Text>
          {isToday && <View style={styles.todayDot} />}
        </View>
        <TouchableOpacity onPress={goToNext} hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ORANGE} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {entries.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>📅</Text>
              <Text style={styles.emptyTitle}>No meals planned</Text>
              <Text style={styles.emptySub}>
                Tap the 📅 button on any recipe to add it to this day.
              </Text>
            </View>
          )}

          {SLOT_ORDER.map((slot) => {
            const slotEntries = groupedBySlot[slot];
            return (
              <View key={slot} style={styles.slotSection}>
                <Text style={styles.slotTitle}>{SLOT_LABELS[slot]}</Text>
                {slotEntries.length === 0 ? (
                  <View style={styles.emptySlot}>
                    <Text style={styles.emptySlotText}>No recipe planned</Text>
                  </View>
                ) : (
                  slotEntries.map((entry) => (
                    <View key={entry.id} style={styles.recipeCard}>
                      <View style={styles.recipeCardLeft}>
                        <Text style={styles.recipeEmoji}>{entry.proteinEmoji}</Text>
                        <View style={styles.recipeCardText}>
                          <Text style={styles.recipeName} numberOfLines={2}>{entry.recipeName}</Text>
                          <Text style={styles.recipeProtein}>{entry.proteinName}</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => handleRemove(entry)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.removeBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: PLAYFAIR,
  },
  todayBtn: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },
  todayBtnActive: { color: ORANGE },

  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  navArrow: { fontSize: 32, color: ORANGE, fontWeight: '700', lineHeight: 36 },
  dayCenter: { alignItems: 'center', gap: 4 },
  dayLabel: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ORANGE,
  },

  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 8 },
  emptySub: { fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 21 },

  slotSection: { marginBottom: 24 },
  slotTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  emptySlot: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: 'dashed',
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptySlotText: { color: 'rgba(255,255,255,0.30)', fontSize: 14 },

  recipeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 8,
  },
  recipeCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  recipeEmoji: { fontSize: 30 },
  recipeCardText: { flex: 1 },
  recipeName: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 3 },
  recipeProtein: { fontSize: 13, color: 'rgba(255,255,255,0.50)' },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,107,107,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { color: '#FF6B6B', fontSize: 13, fontWeight: '700' },
});
