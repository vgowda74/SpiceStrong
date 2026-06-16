/**
 * ProgressReportScreen.tsx — SpiceStrong
 * Weekly/Monthly progress report with side-by-side comparison.
 * - Current vs Previous period macros
 * - Body stats trend (weight, body fat)
 * - Before/After photos
 * - AI weekly summary
 */

import React, { useCallback, useRef, useState } from 'react';
import { ProcessingRing } from '../../components/ProcessingRing';
import {
  Alert,
  ImageBackground,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { getMealPlanForDate } from '../../services/mealPlanService';
import { getRecipeById, getCompletionStats } from '../../src/store/recipes';
import { calculateMacroTargets, getFitnessProfile, getBodyStatsHistory, type FitnessProfile, type BodyStatsEntry, type MacroTargets } from '../../services/fitnessProfileService';
import { PremiumScreen } from '../../components/PremiumScreen';
import { HomeButton } from '../../components/HomeButton';
import { invokeAnthropicMessages } from '../../services/anthropicService';

const ORANGE = '#8F3A1F';
const SURFACE = 'rgba(248,241,232,0.08)';
const BORDER = 'rgba(248,241,232,0.12)';
const GREEN = '#22C55E';
const RED = '#EF4444';
const PLAYFAIR = Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'serif', default: 'serif' });

const PROGRESS_PHOTOS_KEY = 'spicestrong_progress_photos';
const MACRO_OVERRIDE_PREFIX = 'spicestrong_macro_override_';

type Period = 'weekly' | 'monthly';

interface PeriodStats {
  avgCalories: number;
  avgProteinG: number;
  avgCarbsG: number;
  avgFatG: number;
  avgRating: number;
  daysTracked: number;
  proteinGoalHits: number;
  totalDays: number;
  dailyReports: DailyProgressReport[];
}

interface ProgressPhoto {
  uri: string;
  date: string;
  label: string;
}

interface MacroDiff {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface DailyProgressReport {
  date: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  diff: MacroDiff;
  rating: number;
  tracked: boolean;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getFallbackTargets(prof: FitnessProfile | null): MacroTargets {
  if (prof) return calculateMacroTargets(prof);
  return { calories: 2000, proteinG: 130, carbsG: 200, fatG: 70, tdee: 2000, bmr: 1600 };
}

function scoreCloseness(actual: number, target: number, tolerance: number): number {
  const safeTarget = Math.max(target, 1);
  const missRatio = Math.max(0, Math.abs(actual - target) / safeTarget - tolerance);
  return Math.max(0, Math.round(100 - missRatio * 160));
}

function scoreAtLeast(actual: number, target: number, tolerance: number): number {
  const safeTarget = Math.max(target, 1);
  const missRatio = Math.max(0, (target - actual) / safeTarget - tolerance);
  return Math.max(0, Math.round(100 - missRatio * 180));
}

function calculateDailyRating(day: Omit<DailyProgressReport, 'diff' | 'rating' | 'tracked'>, targets: MacroTargets): number {
  if (day.calories <= 0) return 0;
  const calorieScore = scoreCloseness(day.calories, targets.calories, 0.08);
  const proteinScore = scoreAtLeast(day.proteinG, targets.proteinG, 0.05);
  const carbsScore = scoreCloseness(day.carbsG, targets.carbsG, 0.18);
  const fatScore = scoreCloseness(day.fatG, targets.fatG, 0.18);

  return Math.round(
    calorieScore * 0.35 +
    proteinScore * 0.35 +
    carbsScore * 0.15 +
    fatScore * 0.15
  );
}

function getRatingLabel(rating: number): string {
  if (rating >= 90) return 'Elite';
  if (rating >= 80) return 'Strong';
  if (rating >= 70) return 'Solid';
  if (rating >= 60) return 'Building';
  return 'Reset';
}

function formatDiff(value: number, unit = ''): string {
  if (value === 0) return `0${unit}`;
  return `${value > 0 ? '+' : ''}${value}${unit}`;
}

function getProgressMotivation(stats: PeriodStats): string {
  if (stats.daysTracked === 0) return 'Start with one tracked meal today. Momentum begins with a single honest rep.';
  const adherence = Math.round((stats.proteinGoalHits / Math.max(stats.daysTracked, 1)) * 100);
  if (stats.avgRating >= 85) return 'Strong week. You are turning discipline into proof.';
  if (adherence >= 75) return 'Protein consistency is carrying your progress. Keep showing up.';
  if (stats.daysTracked >= Math.ceil(stats.totalDays * 0.6)) return 'The habit is alive. Tighten one meal and the numbers will follow.';
  return 'No reset is wasted. Win the next meal and rebuild the streak.';
}

function getBodySlideStats(profile: FitnessProfile | null, bodyHistory: BodyStatsEntry[], period: Period) {
  if (!profile) return null;
  const daysBack = period === 'weekly' ? 7 : 30;
  const now = new Date();
  const currentPeriodStart = new Date(now);
  currentPeriodStart.setDate(now.getDate() - daysBack);
  const prevPeriodStart = new Date(now);
  prevPeriodStart.setDate(now.getDate() - daysBack * 2);
  const currentEntry = bodyHistory
    .filter((e) => new Date(e.date) >= currentPeriodStart)
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  const prevEntry = bodyHistory
    .filter((e) => new Date(e.date) >= prevPeriodStart && new Date(e.date) < currentPeriodStart)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  const currentWeight = currentEntry?.weightKg ?? profile.weightKg;
  const previousWeight = prevEntry?.weightKg ?? currentWeight;
  const targetWeight = profile.targetWeightKg;
  return {
    currentWeightLbs: Math.round(currentWeight * 2.20462),
    previousWeightLbs: Math.round(previousWeight * 2.20462),
    targetWeightLbs: targetWeight ? Math.round(targetWeight * 2.20462) : null,
    bodyFatPercent: currentEntry?.bodyFatPercent ?? profile.bodyFatPercent,
  };
}

function ProgressReportShareSlide({
  period,
  currentStats,
  previousStats,
  profile,
  bodyHistory,
  photos,
  aiSummary,
}: {
  period: Period;
  currentStats: PeriodStats;
  previousStats: PeriodStats;
  profile: FitnessProfile | null;
  bodyHistory: BodyStatsEntry[];
  photos: ProgressPhoto[];
  aiSummary: string;
}) {
  const adherence = currentStats.daysTracked > 0
    ? Math.round((currentStats.proteinGoalHits / currentStats.daysTracked) * 100)
    : 0;
  const body = getBodySlideStats(profile, bodyHistory, period);
  const latestPhoto = photos[photos.length - 1];
  const macroRows = [
    { label: 'Calories', current: currentStats.avgCalories, previous: previousStats.avgCalories, unit: '' },
    { label: 'Protein', current: currentStats.avgProteinG, previous: previousStats.avgProteinG, unit: 'g' },
    { label: 'Carbs', current: currentStats.avgCarbsG, previous: previousStats.avgCarbsG, unit: 'g' },
    { label: 'Fat', current: currentStats.avgFatG, previous: previousStats.avgFatG, unit: 'g' },
  ];
  const bestDays = currentStats.dailyReports
    .filter((day) => day.tracked)
    .slice(0, period === 'weekly' ? 7 : 10);
  const note = aiSummary || getProgressMotivation(currentStats);

  return (
    <View style={slideStyles.cardOuter}>
      <ImageBackground source={require('../../assets/images/splash-bg.jpg')} style={slideStyles.bg} resizeMode="cover">
        <View style={slideStyles.overlay} />
        <View style={slideStyles.headerRow}>
          <View style={slideStyles.titleBanner}>
            <Text style={slideStyles.brand}>SpiceStrong</Text>
            <Text style={slideStyles.title}>{period === 'weekly' ? 'Weekly' : 'Monthly'} Progress Report</Text>
          </View>
          <View style={slideStyles.ratingBadge}>
            <Text style={slideStyles.ratingValue}>{currentStats.avgRating}</Text>
            <Text style={slideStyles.ratingLabel}>{getRatingLabel(currentStats.avgRating)}</Text>
          </View>
        </View>

        <View style={slideStyles.heroRow}>
          <View style={slideStyles.coachPanel}>
            <Text style={slideStyles.panelEyebrow}>Coach Note</Text>
            <Text style={slideStyles.coachText} numberOfLines={4}>{note}</Text>
            <Text style={slideStyles.motivationText} numberOfLines={2}>{getProgressMotivation(currentStats)}</Text>
          </View>
          <View style={slideStyles.photoPanel}>
            {latestPhoto ? (
              <>
                <Image source={{ uri: latestPhoto.uri }} style={slideStyles.progressPhoto} contentFit="cover" />
                <Text style={slideStyles.photoDate}>{latestPhoto.date}</Text>
              </>
            ) : (
              <View style={slideStyles.photoPlaceholder}>
                <Text style={slideStyles.photoPlaceholderText}>Progress photo ready when you are.</Text>
              </View>
            )}
          </View>
        </View>

        <View style={slideStyles.metricRow}>
          <View style={slideStyles.metricCard}>
            <Text style={slideStyles.metricValue}>{currentStats.daysTracked}/{currentStats.totalDays}</Text>
            <Text style={slideStyles.metricLabel}>Days Tracked</Text>
          </View>
          <View style={slideStyles.metricCard}>
            <Text style={[slideStyles.metricValue, { color: GREEN }]}>{currentStats.proteinGoalHits}/{currentStats.daysTracked}</Text>
            <Text style={slideStyles.metricLabel}>Protein Hits</Text>
          </View>
          <View style={slideStyles.metricCard}>
            <Text style={slideStyles.metricValue}>{adherence}%</Text>
            <Text style={slideStyles.metricLabel}>Adherence</Text>
          </View>
          <View style={slideStyles.metricCard}>
            <Text style={slideStyles.metricValue}>{body?.currentWeightLbs ?? '--'}</Text>
            <Text style={slideStyles.metricLabel}>Current Lbs</Text>
          </View>
        </View>

        <View style={slideStyles.columnsRow}>
          <View style={slideStyles.column}>
            <View style={slideStyles.sectionHeader}>
              <Text style={slideStyles.sectionHeaderText}>Macro Momentum</Text>
            </View>
            <View style={slideStyles.sectionBody}>
              {macroRows.map((row) => {
                const diff = row.current - row.previous;
                return (
                  <View key={row.label} style={slideStyles.macroRow}>
                    <Text style={slideStyles.macroLabel}>{row.label}</Text>
                    <Text style={slideStyles.macroCurrent}>{row.current}{row.unit}</Text>
                    <Text style={slideStyles.macroPrevious}>prev {row.previous}{row.unit}</Text>
                    <Text style={[slideStyles.macroDiff, { color: diff >= 0 ? GREEN : RED }]}>{formatDiff(diff, row.unit)}</Text>
                  </View>
                );
              })}
              {body ? (
                <View style={slideStyles.bodySummary}>
                  <Text style={slideStyles.bodySummaryText}>Weight {body.currentWeightLbs} lbs</Text>
                  <Text style={slideStyles.bodySummarySub}>
                    Previous {body.previousWeightLbs} lbs{body.targetWeightLbs ? `  |  Target ${body.targetWeightLbs} lbs` : ''}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={slideStyles.column}>
            <View style={slideStyles.sectionHeader}>
              <Text style={slideStyles.sectionHeaderText}>Daily Scorecard</Text>
            </View>
            <View style={slideStyles.sectionBody}>
              {bestDays.map((day) => (
                <View key={day.date} style={slideStyles.scoreRow}>
                  <Text style={slideStyles.scoreDate}>{day.date.slice(5)}</Text>
                  <View style={slideStyles.scoreTrack}>
                    <View style={[slideStyles.scoreFill, { width: `${Math.min(day.rating, 100)}%` }]} />
                  </View>
                  <Text style={slideStyles.scoreValue}>{day.rating}</Text>
                </View>
              ))}
              {bestDays.length === 0 ? (
                <Text style={slideStyles.emptyScore}>Track meals to build your first scorecard.</Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={slideStyles.footer}>
          <Text style={slideStyles.footerTag}>Built by SpiceStrong - one strong meal at a time.</Text>
          <Text style={slideStyles.footerUrl}>www.spicestrong.app</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

export default function ProgressReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const shareSlideRef = useRef<{ capture?: () => Promise<string> } | null>(null);

  const [period, setPeriod] = useState<Period>('weekly');
  const [currentStats, setCurrentStats] = useState<PeriodStats | null>(null);
  const [previousStats, setPreviousStats] = useState<PeriodStats | null>(null);
  const [profile, setProfile] = useState<FitnessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState('');
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [bodyHistory, setBodyHistory] = useState<BodyStatsEntry[]>([]);
  const [sharingReport, setSharingReport] = useState(false);

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
        const data = await invokeAnthropicMessages({
          model: 'claude-sonnet-4-6',
          max_tokens: 200,
          messages: [{ role: 'user', content: `Fitness coach — give a 2-3 sentence ${period} report card. Be encouraging but honest.

This ${period === 'weekly' ? 'week' : 'month'}: ${currentS.avgCalories} cal avg, ${currentS.avgProteinG}g protein avg, tracked ${currentS.daysTracked}/${currentS.totalDays} days, hit protein goal ${currentS.proteinGoalHits}/${currentS.daysTracked} days.
Previous ${period === 'weekly' ? 'week' : 'month'}: ${previousS.avgCalories} cal avg, ${previousS.avgProteinG}g protein avg, tracked ${previousS.daysTracked}/${previousS.totalDays} days.
${prof ? `Goal: ${prof.goal}, Target: ~${Math.round(prof.weightKg * 2)}g protein/day` : ''}

Start with a grade emoji (🅰️ 🅱️ 🆎 etc). Mention specific improvements or concerns.` }],
        });
        setAiSummary(data.content?.[0]?.text || '');
      } catch {}
    }

    setLoading(false);
  }, [period]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  async function calculatePeriodStats(dates: string[], prof: FitnessProfile | null): Promise<PeriodStats> {
    let totalCal = 0, totalPro = 0, totalCarb = 0, totalFat = 0;
    let daysTracked = 0;
    let proteinGoalHits = 0;
    let ratingTotal = 0;
    const dailyReports: DailyProgressReport[] = [];
    const targets = getFallbackTargets(prof);

    for (const date of dates) {
      const entries = await getMealPlanForDate(date);

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

      const tracked = dayCal > 0;
      const baseDay = {
        date,
        calories: Math.round(dayCal),
        proteinG: Math.round(dayPro),
        carbsG: Math.round(dayCarb),
        fatG: Math.round(dayFat),
      };
      const rating = tracked ? calculateDailyRating(baseDay, targets) : 0;
      dailyReports.push({
        ...baseDay,
        diff: {
          calories: Math.round(dayCal - targets.calories),
          proteinG: Math.round(dayPro - targets.proteinG),
          carbsG: Math.round(dayCarb - targets.carbsG),
          fatG: Math.round(dayFat - targets.fatG),
        },
        rating,
        tracked,
      });

      if (tracked) {
        daysTracked++;
        totalCal += dayCal;
        totalPro += dayPro;
        totalCarb += dayCarb;
        totalFat += dayFat;
        ratingTotal += rating;
        if (dayPro >= targets.proteinG) proteinGoalHits++;
      }
    }

    return {
      avgCalories: daysTracked > 0 ? Math.round(totalCal / daysTracked) : 0,
      avgProteinG: daysTracked > 0 ? Math.round(totalPro / daysTracked) : 0,
      avgCarbsG: daysTracked > 0 ? Math.round(totalCarb / daysTracked) : 0,
      avgFatG: daysTracked > 0 ? Math.round(totalFat / daysTracked) : 0,
      avgRating: daysTracked > 0 ? Math.round(ratingTotal / dates.length) : 0,
      daysTracked,
      proteinGoalHits,
      totalDays: dates.length,
      dailyReports,
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

  const shareProgressReport = async () => {
    if (!currentStats || !previousStats) {
      Alert.alert('Report Not Ready', 'Your progress data is still loading.');
      return;
    }
    if (!shareSlideRef.current?.capture) {
      Alert.alert('Report Not Ready', 'Please try again in a moment.');
      return;
    }

    setSharingReport(true);
    try {
      const imageUri = await shareSlideRef.current.capture();
      if (imageUri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(imageUri, {
          mimeType: 'image/png',
          dialogTitle: 'Share your SpiceStrong progress report',
          UTI: 'public.png',
        });
        return;
      }
      await Share.share({
        title: 'SpiceStrong Progress Report',
        message: `${period === 'weekly' ? 'Weekly' : 'Monthly'} SpiceStrong progress: ${currentStats.avgRating}/100 rating, ${currentStats.daysTracked}/${currentStats.totalDays} days tracked, ${currentStats.proteinGoalHits}/${currentStats.daysTracked} protein hits.`,
      });
    } catch (error) {
      console.error('[SpiceStrong] Progress report share failed:', error);
      Alert.alert('Could Not Share Report', 'Please try again in a moment.');
    } finally {
      setSharingReport(false);
    }
  };

  return (
    <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Progress Report</Text>
        <HomeButton />
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
        <View style={styles.center}><ProcessingRing label="Loading your progress…" expectedMs={3000} /></View>
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
          {currentStats && (
            <View style={styles.ratingCard}>
              <View style={styles.ratingCopy}>
                <Text style={styles.ratingEyebrow}>Weighted Rating</Text>
                <Text style={styles.ratingTitle}>{currentStats.avgRating}/100</Text>
                <Text style={styles.ratingSub}>{getRatingLabel(currentStats.avgRating)} - calories 35%, protein 35%, carbs 15%, fat 15%</Text>
              </View>
              <View style={styles.ratingBadge}>
                <Text style={styles.ratingBadgeText}>{getRatingLabel(currentStats.avgRating)}</Text>
              </View>
            </View>
          )}

          {currentStats && (
            <View style={styles.dailyCard}>
              <Text style={styles.cardTitle}>Daily Macro Scorecard</Text>
              <View style={styles.dailyHeader}>
                <Text style={styles.dailyDate}>Day</Text>
                <Text style={styles.dailyDiff}>Cal</Text>
                <Text style={styles.dailyDiff}>P</Text>
                <Text style={styles.dailyDiff}>C</Text>
                <Text style={styles.dailyDiff}>F</Text>
                <Text style={styles.dailyRating}>Score</Text>
              </View>
              {currentStats.dailyReports.slice(0, period === 'weekly' ? 7 : 10).map((day) => (
                <View key={day.date} style={styles.dailyRow}>
                  <Text style={styles.dailyDate}>{day.date.slice(5)}</Text>
                  <Text style={styles.dailyDiff}>{day.tracked ? formatDiff(day.diff.calories) : '-'}</Text>
                  <Text style={[styles.dailyDiff, day.tracked && { color: day.diff.proteinG >= 0 ? GREEN : RED }]}>
                    {day.tracked ? formatDiff(day.diff.proteinG, 'g') : '-'}
                  </Text>
                  <Text style={styles.dailyDiff}>{day.tracked ? formatDiff(day.diff.carbsG, 'g') : '-'}</Text>
                  <Text style={styles.dailyDiff}>{day.tracked ? formatDiff(day.diff.fatG, 'g') : '-'}</Text>
                  <Text style={[
                    styles.dailyRating,
                    { color: day.rating >= 80 ? GREEN : day.rating >= 60 ? ORANGE : RED },
                  ]}>
                    {day.rating}
                  </Text>
                </View>
              ))}
              {period === 'monthly' && currentStats.dailyReports.length > 10 ? (
                <Text style={styles.dailyMore}>Full monthly scoring is included in the consolidated rating.</Text>
              ) : null}
            </View>
          )}

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
          <View style={styles.shareRow}>
            <TouchableOpacity
              style={[styles.shareBtn, sharingReport && styles.shareBtnDisabled]}
              onPress={shareProgressReport}
              disabled={sharingReport}
              activeOpacity={0.82}
            >
              <Text style={styles.shareBtnText}>{sharingReport ? 'Creating Image...' : 'Share Report'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
      {!loading && currentStats && previousStats ? (
        <View style={styles.hiddenShareSlide} pointerEvents="none">
          <ViewShot ref={shareSlideRef} options={{ format: 'png', quality: 1 }}>
            <ProgressReportShareSlide
              period={period}
              currentStats={currentStats}
              previousStats={previousStats}
              profile={profile}
              bodyHistory={bodyHistory}
              photos={photos}
              aiSummary={aiSummary}
            />
          </ViewShot>
        </View>
      ) : null}
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
  hiddenShareSlide: { position: 'absolute', left: -9999, top: 0 },
  shareRow: {
    paddingTop: 6,
    paddingBottom: 4,
  },
  shareBtn: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(143,58,31,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.18)',
  },
  shareBtnDisabled: {
    opacity: 0.62,
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },

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

  // Weighted rating
  ratingCard: {
    backgroundColor: 'rgba(143,58,31,0.12)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.26)',
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  ratingCopy: { flex: 1 },
  ratingEyebrow: { fontSize: 11, fontWeight: '900', color: 'rgba(248,241,232,0.50)', textTransform: 'uppercase' },
  ratingTitle: { fontSize: 32, fontWeight: '900', color: '#FFFFFF', marginTop: 4 },
  ratingSub: { fontSize: 12, lineHeight: 17, fontWeight: '700', color: 'rgba(248,241,232,0.58)', marginTop: 2 },
  ratingBadge: {
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.26)',
    alignItems: 'center',
  },
  ratingBadgeText: { fontSize: 12, fontWeight: '900', color: GREEN },

  // Daily scorecard
  dailyCard: { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 14 },
  dailyHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 34,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  dailyDate: { flex: 1.05, fontSize: 12, fontWeight: '800', color: 'rgba(248,241,232,0.70)' },
  dailyDiff: { flex: 0.9, fontSize: 11, fontWeight: '800', color: 'rgba(248,241,232,0.58)', textAlign: 'center' },
  dailyRating: { flex: 0.9, fontSize: 12, fontWeight: '900', color: '#FFFFFF', textAlign: 'right' },
  dailyMore: { marginTop: 10, fontSize: 11, lineHeight: 16, fontWeight: '700', color: 'rgba(248,241,232,0.45)' },

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

const slideStyles = StyleSheet.create({
  cardOuter: {
    width: 1400,
    height: 900,
    overflow: 'hidden',
    backgroundColor: '#120B08',
  },
  bg: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(22,10,5,0.70)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 34,
    paddingHorizontal: 38,
  },
  titleBanner: {
    maxWidth: 920,
    paddingVertical: 18,
    paddingHorizontal: 30,
    backgroundColor: '#7B1A1A',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,248,240,0.16)',
  },
  brand: {
    color: ORANGE,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  title: {
    color: '#FFF8F0',
    fontSize: 48,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontStyle: 'italic',
    marginTop: 2,
  },
  ratingBadge: {
    width: 190,
    height: 150,
    borderRadius: 14,
    backgroundColor: 'rgba(245,230,200,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: '#FFFFFF',
    transform: [{ rotate: '3deg' }],
  },
  ratingValue: {
    color: '#3D1A0A',
    fontSize: 62,
    fontWeight: '900',
    lineHeight: 70,
  },
  ratingLabel: {
    color: ORANGE,
    fontSize: 22,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroRow: {
    flexDirection: 'row',
    gap: 22,
    paddingHorizontal: 38,
    paddingTop: 22,
  },
  coachPanel: {
    flex: 1,
    minHeight: 188,
    backgroundColor: 'rgba(245,230,200,0.92)',
    borderRadius: 12,
    padding: 24,
  },
  panelEyebrow: {
    color: ORANGE,
    fontSize: 18,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  coachText: {
    color: '#3D1A0A',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 38,
    marginTop: 8,
  },
  motivationText: {
    color: '#7B1A1A',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 12,
  },
  photoPanel: {
    width: 270,
    height: 188,
    borderRadius: 14,
    borderWidth: 6,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: 'rgba(245,230,200,0.92)',
  },
  progressPhoto: {
    width: '100%',
    height: '100%',
  },
  photoDate: {
    position: 'absolute',
    left: 12,
    bottom: 10,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    backgroundColor: 'rgba(0,0,0,0.52)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  photoPlaceholderText: {
    color: '#3D1A0A',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 28,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 38,
    paddingTop: 20,
  },
  metricCard: {
    flex: 1,
    height: 116,
    backgroundColor: 'rgba(15,15,15,0.82)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,230,200,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    color: '#FFF8F0',
    fontSize: 42,
    fontWeight: '900',
    lineHeight: 48,
  },
  metricLabel: {
    color: 'rgba(255,248,240,0.62)',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 6,
    textTransform: 'uppercase',
  },
  columnsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: 38,
    paddingTop: 20,
  },
  column: {
    flex: 1,
    backgroundColor: 'rgba(245,230,200,0.92)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    backgroundColor: '#7B1A1A',
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  sectionHeaderText: {
    color: '#FFF8F0',
    fontSize: 28,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontStyle: 'italic',
  },
  sectionBody: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(61,26,10,0.12)',
  },
  macroLabel: {
    flex: 1.2,
    color: '#3D1A0A',
    fontSize: 22,
    fontWeight: '900',
  },
  macroCurrent: {
    flex: 0.8,
    color: '#1A1A1A',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'right',
  },
  macroPrevious: {
    flex: 0.95,
    color: 'rgba(61,26,10,0.58)',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'right',
  },
  macroDiff: {
    flex: 0.7,
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'right',
  },
  bodySummary: {
    marginTop: 18,
    padding: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(143,58,31,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.20)',
  },
  bodySummaryText: {
    color: '#3D1A0A',
    fontSize: 26,
    fontWeight: '900',
  },
  bodySummarySub: {
    color: 'rgba(61,26,10,0.66)',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 4,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 42,
    gap: 12,
  },
  scoreDate: {
    width: 72,
    color: '#3D1A0A',
    fontSize: 18,
    fontWeight: '900',
  },
  scoreTrack: {
    flex: 1,
    height: 18,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: 'rgba(61,26,10,0.16)',
  },
  scoreFill: {
    height: '100%',
    borderRadius: 9,
    backgroundColor: ORANGE,
  },
  scoreValue: {
    width: 48,
    color: '#3D1A0A',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'right',
  },
  emptyScore: {
    color: '#3D1A0A',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 30,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 38,
    paddingVertical: 16,
  },
  footerTag: {
    color: '#FFF8F0',
    fontSize: 22,
    fontWeight: '900',
  },
  footerUrl: {
    color: ORANGE,
    fontSize: 24,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
});
