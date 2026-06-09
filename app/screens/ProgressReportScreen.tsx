/**
 * ProgressReportScreen.tsx — SpiceStrong
 * Weekly/Monthly progress report with side-by-side comparison.
 * - Current vs Previous period macros
 * - Body stats trend (weight, body fat)
 * - Before/After photos
 * - AI weekly summary
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
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { getMealPlanForDate, type MealPlanEntry } from '../../services/mealPlanService';
import { getRecipeById, getCompletionStats } from '../../src/store/recipes';
import { getFitnessProfile, getBodyStatsHistory, type FitnessProfile, type BodyStatsEntry } from '../../services/fitnessProfileService';
import { PremiumScreen } from '../../components/PremiumScreen';

const ORANGE = '#8F3A1F';
const SURFACE = 'rgba(248,241,232,0.08)';
const BORDER = 'rgba(248,241,232,0.12)';
const GREEN = '#22C55E';
const RED = '#EF4444';
const PLAYFAIR = Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'PlayfairDisplay_700Bold', default: 'serif' });

const PROGRESS_PHOTOS_KEY = 'spicestrong_progress_photos';
const MACRO_OVERRIDE_PREFIX = 'spicestrong_macro_override_';

type Period = 'weekly' | 'monthly';

interface PeriodStats {
  avgCalories: number;
  avgProteinG: number;
  avgCarbsG: number;
  avgFatG: number;
  daysTracked: number;
  proteinGoalHits: number;
  totalDays: number;
}

interface ProgressPhoto {
  uri: string;
  date: string;
  label: string;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ProgressReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [period, setPeriod] = useState<Period>('weekly');
  const [currentStats, setCurrentStats] = useState<PeriodStats | null>(null);
  const [previousStats, setPreviousStats] = useState<PeriodStats | null>(null);
  const [profile, setProfile] = useState<FitnessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState('');
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [bodyHistory, setBodyHistory] = useState<BodyStatsEntry[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const prof = await getFitnessProfile();
    setProfile(prof);

    const today = new Date();
    const daysBack = period === 'weekly' ? 7 : 30;

    // Current period dates
    const currentDates: string[] = [];
    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      currentDates.push(formatDate(d));
    }

    // Previous period dates
    const previousDates: string[] = [];
    for (let i = daysBack; i < daysBack * 2; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      previousDates.push(formatDate(d));
    }

    const currentS = await calculatePeriodStats(currentDates, prof);
    const previousS = await calculatePeriodStats(previousDates, prof);
    setCurrentStats(currentS);
    setPreviousStats(previousS);

    // Load body stats history
    const history = await getBodyStatsHistory();
    setBodyHistory(history);

    // Load progress photos
    try {
      const raw = await AsyncStorage.getItem(PROGRESS_PHOTOS_KEY);
      if (raw) setPhotos(JSON.parse(raw));
    } catch {}

    // AI summary
    if (currentS.daysTracked > 0) {
      try {
        const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
        if (apiKey) {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              max_tokens: 200,
              messages: [{ role: 'user', content: `Fitness coach — give a 2-3 sentence ${period} report card. Be encouraging but honest.

This ${period === 'weekly' ? 'week' : 'month'}: ${currentS.avgCalories} cal avg, ${currentS.avgProteinG}g protein avg, tracked ${currentS.daysTracked}/${currentS.totalDays} days, hit protein goal ${currentS.proteinGoalHits}/${currentS.daysTracked} days.
Previous ${period === 'weekly' ? 'week' : 'month'}: ${previousS.avgCalories} cal avg, ${previousS.avgProteinG}g protein avg, tracked ${previousS.daysTracked}/${previousS.totalDays} days.
${prof ? `Goal: ${prof.goal}, Target: ~${Math.round(prof.weightKg * 2)}g protein/day` : ''}

Start with a grade emoji (🅰️ 🅱️ 🆎 etc). Mention specific improvements or concerns.` }],
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setAiSummary(data.content?.[0]?.text || '');
          }
        }
      } catch {}
    }

    setLoading(false);
  }, [period]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  async function calculatePeriodStats(dates: string[], prof: FitnessProfile | null): Promise<PeriodStats> {
    let totalCal = 0, totalPro = 0, totalCarb = 0, totalFat = 0;
    let daysTracked = 0;
    let proteinGoalHits = 0;
    const dailyProteinTarget = prof ? Math.round(prof.weightKg * 2) : 130;

    for (const date of dates) {
      const entries = await getMealPlanForDate(date);
      if (entries.length === 0) continue;

      let dayCal = 0, dayPro = 0, dayCarb = 0, dayFat = 0;
      for (const entry of entries) {
        // Check for macro override first
        try {
          const overrideStr = await AsyncStorage.getItem(`${MACRO_OVERRIDE_PREFIX}${entry.id}`);
          if (overrideStr) {
            const o = JSON.parse(overrideStr);
            dayCal += o.calories || 0;
            dayPro += o.proteinG || 0;
            dayCarb += o.carbsG || 0;
            dayFat += o.fatG || 0;
            continue;
          }
        } catch {}

        // Get from recipe
        const recipe = await getRecipeById(entry.recipeId);
        if (recipe) {
          const stats = getCompletionStats(recipe, '2-3 servings');
          dayCal += stats.calories;
          dayPro += stats.proteinG;
          dayCarb += stats.carbsG;
          dayFat += stats.fatG;
        }
      }

      if (dayCal > 0) {
        daysTracked++;
        totalCal += dayCal;
        totalPro += dayPro;
        totalCarb += dayCarb;
        totalFat += dayFat;
        if (dayPro >= dailyProteinTarget) proteinGoalHits++;
      }
    }

    return {
      avgCalories: daysTracked > 0 ? Math.round(totalCal / daysTracked) : 0,
      avgProteinG: daysTracked > 0 ? Math.round(totalPro / daysTracked) : 0,
      avgCarbsG: daysTracked > 0 ? Math.round(totalCarb / daysTracked) : 0,
      avgFatG: daysTracked > 0 ? Math.round(totalFat / daysTracked) : 0,
      daysTracked,
      proteinGoalHits,
      totalDays: dates.length,
    };
  }

  const takeProgressPhoto = async () => {
    // Check if user already took a photo this week
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)
    const weekStartStr = formatDate(weekStart);

    const thisWeekPhoto = photos.find((p) => p.date >= weekStartStr);
    if (thisWeekPhoto) {
      Alert.alert('One Photo Per Week', `You already took a progress photo this week (${thisWeekPhoto.date}). Come back next week!`);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.5,
    });
    if (!result.canceled && result.assets?.[0]) {
      const today = formatDate(new Date());
      const newPhoto: ProgressPhoto = { uri: result.assets[0].uri, date: today, label: `Week of ${today}` };

      // Keep photos from last 6 months only
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      const sixMonthsAgoStr = formatDate(sixMonthsAgo);

      const updated = [...photos, newPhoto].filter((p) => p.date >= sixMonthsAgoStr);
      setPhotos(updated);
      await AsyncStorage.setItem(PROGRESS_PHOTOS_KEY, JSON.stringify(updated));
    }
  };

  // Helper for trend arrow
  const trend = (current: number, previous: number, lowerIsBetter = false) => {
    if (previous === 0) return { arrow: '', color: 'rgba(255,255,255,0.40)' };
    const diff = current - previous;
    if (Math.abs(diff) < 1) return { arrow: '→', color: 'rgba(255,255,255,0.40)' };
    const isUp = diff > 0;
    const isGood = lowerIsBetter ? !isUp : isUp;
    return { arrow: isUp ? '↑' : '↓', color: isGood ? GREEN : RED };
  };

  return (
    <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Progress Report</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Period toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity style={[styles.toggleBtn, period === 'weekly' && styles.toggleBtnActive]} onPress={() => setPeriod('weekly')}>
          <Text style={[styles.toggleText, period === 'weekly' && styles.toggleTextActive]}>Weekly</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, period === 'monthly' && styles.toggleBtnActive]} onPress={() => setPeriod('monthly')}>
          <Text style={[styles.toggleText, period === 'monthly' && styles.toggleTextActive]}>Monthly</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={ORANGE} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>

          {/* AI Summary */}
          {aiSummary ? (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryText}>{aiSummary}</Text>
            </View>
          ) : null}

          {/* Macro Comparison Table */}
          {currentStats && previousStats && (
            <View style={styles.comparisonCard}>
              <View style={styles.compHeader}>
                <Text style={styles.compHeaderLabel}>Metric</Text>
                <Text style={styles.compHeaderCurrent}>Current</Text>
                <Text style={styles.compHeaderPrev}>Previous</Text>
                <Text style={styles.compHeaderTrend}>Trend</Text>
              </View>
              {[
                { label: '🔥 Avg Calories', current: currentStats.avgCalories, prev: previousStats.avgCalories, unit: '', lowerBetter: profile?.goal === 'fat_loss' },
                { label: '💪 Avg Protein', current: currentStats.avgProteinG, prev: previousStats.avgProteinG, unit: 'g', lowerBetter: false },
                { label: '🌾 Avg Carbs', current: currentStats.avgCarbsG, prev: previousStats.avgCarbsG, unit: 'g', lowerBetter: false },
                { label: '🥑 Avg Fat', current: currentStats.avgFatG, prev: previousStats.avgFatG, unit: 'g', lowerBetter: true },
              ].map((row, i) => {
                const t = trend(row.current, row.prev, row.lowerBetter);
                return (
                  <View key={i} style={styles.compRow}>
                    <Text style={styles.compLabel}>{row.label}</Text>
                    <Text style={styles.compCurrent}>{row.current}{row.unit}</Text>
                    <Text style={styles.compPrev}>{row.prev}{row.unit}</Text>
                    <Text style={[styles.compTrend, { color: t.color }]}>{t.arrow}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Tracking Stats */}
          {currentStats && (
            <View style={styles.trackingCard}>
              <View style={styles.trackingRow}>
                <View style={styles.trackingItem}>
                  <Text style={styles.trackingValue}>{currentStats.daysTracked}/{currentStats.totalDays}</Text>
                  <Text style={styles.trackingLabel}>Days Tracked</Text>
                </View>
                <View style={styles.trackingDivider} />
                <View style={styles.trackingItem}>
                  <Text style={[styles.trackingValue, { color: GREEN }]}>{currentStats.proteinGoalHits}/{currentStats.daysTracked}</Text>
                  <Text style={styles.trackingLabel}>Protein Goal Hit</Text>
                </View>
                <View style={styles.trackingDivider} />
                <View style={styles.trackingItem}>
                  <Text style={styles.trackingValue}>{currentStats.daysTracked > 0 ? Math.round((currentStats.proteinGoalHits / currentStats.daysTracked) * 100) : 0}%</Text>
                  <Text style={styles.trackingLabel}>Adherence</Text>
                </View>
              </View>
            </View>
          )}

          {/* Body Stats — current vs previous period */}
          {profile && (
            <View style={styles.bodyCard}>
              <Text style={styles.cardTitle}>Body Stats</Text>
              {(() => {
                const daysBack = period === 'weekly' ? 7 : 30;
                const now = new Date();
                const currentPeriodStart = new Date(now); currentPeriodStart.setDate(now.getDate() - daysBack);
                const prevPeriodStart = new Date(now); prevPeriodStart.setDate(now.getDate() - daysBack * 2);

                // Find most recent entry in each period
                const currentEntry = bodyHistory
                  .filter((e) => new Date(e.date) >= currentPeriodStart)
                  .sort((a, b) => b.timestamp - a.timestamp)[0];
                const prevEntry = bodyHistory
                  .filter((e) => new Date(e.date) >= prevPeriodStart && new Date(e.date) < currentPeriodStart)
                  .sort((a, b) => b.timestamp - a.timestamp)[0];

                const currentWeight = currentEntry?.weightKg ?? profile.weightKg;
                const prevWeight = prevEntry?.weightKg ?? currentWeight;
                const currentBF = currentEntry?.bodyFatPercent ?? profile.bodyFatPercent;
                const prevBF = prevEntry?.bodyFatPercent;

                const weightTrend = trend(currentWeight, prevWeight, true);
                const bfTrend = currentBF && prevBF ? trend(currentBF, prevBF, true) : null;

                return (
                  <>
                    <View style={styles.bodyCompRow}>
                      <Text style={styles.bodyCompLabel}>⚖️ Weight</Text>
                      <Text style={styles.bodyCompCurrent}>{Math.round(currentWeight * 2.20462)} lbs</Text>
                      <Text style={styles.bodyCompPrev}>{prevEntry ? `${Math.round(prevWeight * 2.20462)} lbs` : '—'}</Text>
                      <Text style={[styles.bodyCompTrend, { color: weightTrend.color }]}>{weightTrend.arrow}</Text>
                    </View>
                    {currentBF != null && (
                      <View style={styles.bodyCompRow}>
                        <Text style={styles.bodyCompLabel}>📊 Body Fat</Text>
                        <Text style={[styles.bodyCompCurrent, { color: ORANGE }]}>{currentBF}%</Text>
                        <Text style={styles.bodyCompPrev}>{prevBF ? `${prevBF}%` : '—'}</Text>
                        {bfTrend && <Text style={[styles.bodyCompTrend, { color: bfTrend.color }]}>{bfTrend.arrow}</Text>}
                      </View>
                    )}
                    {profile.targetWeightKg && (
                      <View style={styles.bodyCompRow}>
                        <Text style={styles.bodyCompLabel}>🎯 Target</Text>
                        <Text style={styles.bodyCompCurrent}>{Math.round(profile.targetWeightKg * 2.20462)} lbs</Text>
                        <Text style={styles.bodyCompPrev}>{Math.round(Math.abs(currentWeight - profile.targetWeightKg) * 2.20462)} lbs to go</Text>
                        <Text style={styles.bodyCompTrend} />
                      </View>
                    )}
                  </>
                );
              })()}
            </View>
          )}

          {/* Progress Photos */}
          <View style={styles.photoCard}>
            <View style={styles.photoHeader}>
              <Text style={styles.cardTitle}>Progress Photos</Text>
              <TouchableOpacity style={styles.photoAddBtn} onPress={takeProgressPhoto} activeOpacity={0.75}>
                <Text style={styles.photoAddText}>📸 Add</Text>
              </TouchableOpacity>
            </View>
            {photos.length >= 2 ? (
              <View style={styles.photoCompare}>
                <View style={styles.photoCol}>
                  <Image source={{ uri: photos[photos.length - 2].uri }} style={styles.photoImg} contentFit="cover" />
                  <Text style={styles.photoDate}>{photos[photos.length - 2].date}</Text>
                </View>
                <Text style={styles.photoVs}>→</Text>
                <View style={styles.photoCol}>
                  <Image source={{ uri: photos[photos.length - 1].uri }} style={styles.photoImg} contentFit="cover" />
                  <Text style={styles.photoDate}>{photos[photos.length - 1].date}</Text>
                </View>
              </View>
            ) : photos.length === 1 ? (
              <View style={styles.photoSingle}>
                <Image source={{ uri: photos[0].uri }} style={styles.photoImg} contentFit="cover" />
                <Text style={styles.photoHint}>Take another photo next {period === 'weekly' ? 'week' : 'month'} to compare</Text>
              </View>
            ) : (
              <Text style={styles.photoEmpty}>Take your first progress photo to start tracking your transformation</Text>
            )}
          </View>
        </ScrollView>
      )}
    </PremiumScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(248,241,232,0.12)',
  },
  backBtn: {
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
  back: { fontSize: 28, lineHeight: 30, color: '#FFFFFF', fontWeight: '900' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },

  // Period toggle
  toggleRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 10, gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  toggleBtnActive: { backgroundColor: ORANGE },
  toggleText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.50)' },
  toggleTextActive: { color: '#FFFFFF' },

  scroll: { paddingHorizontal: 20, paddingTop: 12 },

  // AI Summary
  summaryCard: { backgroundColor: 'rgba(143,58,31,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(143,58,31,0.20)', padding: 16, marginBottom: 14 },
  summaryText: { fontSize: 14, color: 'rgba(255,255,255,0.80)', lineHeight: 22 },

  // Comparison table
  comparisonCard: { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 14, overflow: 'hidden' },
  compHeader: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.04)' },
  compHeaderLabel: { flex: 2, fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5 },
  compHeaderCurrent: { flex: 1, fontSize: 11, fontWeight: '800', color: ORANGE, textAlign: 'center', letterSpacing: 0.5 },
  compHeaderPrev: { flex: 1, fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.35)', textAlign: 'center', letterSpacing: 0.5 },
  compHeaderTrend: { width: 30, fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.35)', textAlign: 'center' },
  compRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' },
  compLabel: { flex: 2, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.70)' },
  compCurrent: { flex: 1, fontSize: 15, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  compPrev: { flex: 1, fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.40)', textAlign: 'center' },
  compTrend: { width: 30, fontSize: 18, fontWeight: '800', textAlign: 'center' },

  // Tracking stats
  trackingCard: { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 14 },
  trackingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  trackingItem: { alignItems: 'center', flex: 1 },
  trackingValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  trackingLabel: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
  trackingDivider: { width: 1, height: 36, backgroundColor: BORDER },

  // Body stats
  bodyCard: { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', marginBottom: 12 },
  bodyCompRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  bodyCompLabel: { flex: 2, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.70)' },
  bodyCompCurrent: { flex: 1, fontSize: 15, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  bodyCompPrev: { flex: 1, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.40)', textAlign: 'center' },
  bodyCompTrend: { width: 30, fontSize: 18, fontWeight: '800', textAlign: 'center' },

  // Progress photos
  photoCard: { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 14 },
  photoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  photoAddBtn: { backgroundColor: 'rgba(143,58,31,0.15)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(143,58,31,0.35)' },
  photoAddText: { fontSize: 12, fontWeight: '700', color: ORANGE },
  photoCompare: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  photoCol: { flex: 1, alignItems: 'center' },
  photoImg: { width: '100%', height: 180, borderRadius: 12 },
  photoDate: { fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 6 },
  photoVs: { fontSize: 24, color: ORANGE, fontWeight: '800' },
  photoSingle: { alignItems: 'center' },
  photoHint: { fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 8, textAlign: 'center' },
  photoEmpty: { fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', paddingVertical: 20 },
});
