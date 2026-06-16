/**
 * ProgressReportScreen.tsx — SpiceStrong
 * Weekly/Monthly progress report with side-by-side comparison.
 * - Current vs Previous period macros
 * - Body stats trend (weight, body fat)
 * - Before/After photos
 * - AI weekly summary
 */

import React, { useCallback, useState } from 'react';
import { ProcessingRing } from '../../components/ProcessingRing';
import {
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
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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
  const [sharingPdf, setSharingPdf] = useState(false);

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

  const getBodySnapshot = () => {
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

    return {
      currentWeightKg: currentEntry?.weightKg ?? profile.weightKg,
      previousWeightKg: prevEntry?.weightKg ?? (currentEntry?.weightKg ?? profile.weightKg),
      currentBodyFat: currentEntry?.bodyFatPercent ?? profile.bodyFatPercent,
      previousBodyFat: prevEntry?.bodyFatPercent,
      targetWeightKg: profile.targetWeightKg,
    };
  };

  const getMotivationLine = () => {
    if (!currentStats || currentStats.daysTracked === 0) {
      return 'This is your reset point. Track one meal today and restart the momentum.';
    }
    const adherence = Math.round((currentStats.proteinGoalHits / currentStats.daysTracked) * 100);
    if (adherence >= 80) return 'You are stacking strong, repeatable wins. Keep protecting the habits that got you here.';
    if (currentStats.daysTracked >= Math.ceil(currentStats.totalDays * 0.6)) {
      return 'Your consistency is building. Tighten protein at one meal and this turns into a breakout week.';
    }
    return 'Progress does not need perfection. Win the next meal, then the next day.';
  };

  const wrapPdfText = (text: string, maxChars: number) => {
    const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines: string[] = [];
    let line = '';
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines;
  };

  const embedProgressPhoto = async (pdfDoc: PDFDocument, uri: string) => {
    const base64 = await new File(uri).base64();
    return uri.toLowerCase().endsWith('.png') ? pdfDoc.embedPng(base64) : pdfDoc.embedJpg(base64);
  };

  const shareProgressPdf = async () => {
    if (!currentStats || !previousStats) {
      Alert.alert('Report Not Ready', 'Your progress data is still loading.');
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Sharing Unavailable', 'Sharing is not available on this device.');
      return;
    }

    setSharingPdf(true);
    try {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]);
      const { width, height } = page.getSize();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const dark = rgb(0.06, 0.05, 0.04);
      const cream = rgb(0.97, 0.94, 0.89);
      const muted = rgb(0.68, 0.62, 0.56);
      const copper = rgb(0.91, 0.36, 0.15);
      const green = rgb(0.13, 0.77, 0.37);
      const red = rgb(0.94, 0.27, 0.27);

      page.drawRectangle({ x: 0, y: 0, width, height, color: dark });
      page.drawRectangle({ x: 0, y: height - 154, width, height: 154, color: rgb(0.14, 0.07, 0.04) });
      page.drawRectangle({ x: 38, y: height - 132, width: 6, height: 92, color: copper });
      page.drawText('SpiceStrong', { x: 56, y: height - 70, size: 30, font: bold, color: copper });
      page.drawText(`${period === 'weekly' ? 'Weekly' : 'Monthly'} Progress Report`, {
        x: 56,
        y: height - 100,
        size: 20,
        font: bold,
        color: cream,
      });
      page.drawText(formatDate(new Date()), { x: 470, y: height - 66, size: 11, font, color: muted });
      page.drawText(profile?.goal ? `Goal: ${profile.goal.replace(/_/g, ' ')}` : 'Goal: Keep building', {
        x: 470,
        y: height - 84,
        size: 11,
        font,
        color: muted,
      });

      [
        { label: 'Days Tracked', value: `${currentStats.daysTracked}/${currentStats.totalDays}`, color: cream },
        { label: 'Protein Hits', value: `${currentStats.proteinGoalHits}/${currentStats.daysTracked}`, color: green },
        { label: 'Weighted Rating', value: `${currentStats.avgRating}`, color: currentStats.avgRating >= 80 ? green : copper },
      ].forEach((card, index) => {
        const x = 38 + index * 178;
        page.drawRectangle({
          x,
          y: height - 228,
          width: 160,
          height: 72,
          borderColor: rgb(0.31, 0.25, 0.20),
          borderWidth: 1,
          color: rgb(0.10, 0.09, 0.08),
        });
        page.drawText(card.value, { x: x + 16, y: height - 190, size: 24, font: bold, color: card.color });
        page.drawText(card.label, { x: x + 16, y: height - 210, size: 10, font, color: muted });
      });

      let y = height - 270;
      page.drawText('Coach Note', { x: 38, y, size: 16, font: bold, color: cream });
      y -= 24;
      wrapPdfText(aiSummary || getMotivationLine(), 88).slice(0, 4).forEach((line) => {
        page.drawText(line, { x: 38, y, size: 11, font, color: muted });
        y -= 15;
      });
      y -= 4;
      wrapPdfText(getMotivationLine(), 78).slice(0, 2).forEach((line) => {
        page.drawText(line, { x: 38, y, size: 12, font: bold, color: copper });
        y -= 16;
      });

      y -= 18;
      page.drawText('Macro Momentum', { x: 38, y, size: 16, font: bold, color: cream });
      y -= 22;
      [
        { label: 'Avg Calories', current: currentStats.avgCalories, previous: previousStats.avgCalories, unit: '' },
        { label: 'Avg Protein', current: currentStats.avgProteinG, previous: previousStats.avgProteinG, unit: 'g' },
        { label: 'Avg Carbs', current: currentStats.avgCarbsG, previous: previousStats.avgCarbsG, unit: 'g' },
        { label: 'Avg Fat', current: currentStats.avgFatG, previous: previousStats.avgFatG, unit: 'g' },
      ].forEach((row) => {
        const diff = row.current - row.previous;
        const diffText = row.previous === 0 ? 'new baseline' : `${diff >= 0 ? '+' : ''}${diff}${row.unit}`;
        page.drawText(row.label, { x: 48, y, size: 11, font, color: muted });
        page.drawText(`${row.current}${row.unit}`, { x: 235, y, size: 12, font: bold, color: cream });
        page.drawText(`prev ${row.previous}${row.unit}`, { x: 325, y, size: 10, font, color: muted });
        page.drawText(diffText, { x: 430, y, size: 11, font: bold, color: diff >= 0 ? green : red });
        y -= 25;
      });

      y -= 18;
      page.drawText('Daily Macro Scorecard', { x: 38, y, size: 16, font: bold, color: cream });
      y -= 20;
      page.drawText('Date', { x: 48, y, size: 9, font: bold, color: muted });
      page.drawText('Cal Diff', { x: 140, y, size: 9, font: bold, color: muted });
      page.drawText('P Diff', { x: 220, y, size: 9, font: bold, color: muted });
      page.drawText('C Diff', { x: 295, y, size: 9, font: bold, color: muted });
      page.drawText('F Diff', { x: 370, y, size: 9, font: bold, color: muted });
      page.drawText('Rating', { x: 450, y, size: 9, font: bold, color: muted });
      y -= 16;
      const dailyRows = currentStats.dailyReports.slice(0, period === 'weekly' ? 7 : 8);
      dailyRows.forEach((day) => {
        page.drawText(day.date.slice(5), { x: 48, y, size: 9, font, color: day.tracked ? cream : muted });
        page.drawText(day.tracked ? formatDiff(day.diff.calories) : 'not tracked', { x: 140, y, size: 9, font, color: muted });
        page.drawText(day.tracked ? formatDiff(day.diff.proteinG, 'g') : '-', { x: 220, y, size: 9, font, color: day.diff.proteinG >= 0 ? green : red });
        page.drawText(day.tracked ? formatDiff(day.diff.carbsG, 'g') : '-', { x: 295, y, size: 9, font, color: muted });
        page.drawText(day.tracked ? formatDiff(day.diff.fatG, 'g') : '-', { x: 370, y, size: 9, font, color: muted });
        page.drawText(day.tracked ? `${day.rating} ${getRatingLabel(day.rating)}` : '0 Reset', {
          x: 450,
          y,
          size: 9,
          font: bold,
          color: day.rating >= 80 ? green : day.rating >= 60 ? copper : red,
        });
        y -= 14;
      });
      if (period === 'monthly' && currentStats.dailyReports.length > dailyRows.length) {
        page.drawText(`Plus ${currentStats.dailyReports.length - dailyRows.length} more days in the app.`, {
          x: 48,
          y,
          size: 9,
          font,
          color: muted,
        });
        y -= 16;
      }

      y -= 18;
      const body = getBodySnapshot();
      if (body && y > 120) {
        page.drawText('Body Snapshot', { x: 38, y, size: 16, font: bold, color: cream });
        y -= 24;
        page.drawText(`Weight: ${Math.round(body.currentWeightKg * 2.20462)} lbs`, { x: 48, y, size: 11, font: bold, color: cream });
        page.drawText(`Previous: ${Math.round(body.previousWeightKg * 2.20462)} lbs`, { x: 190, y, size: 11, font, color: muted });
        if (body.targetWeightKg) {
          page.drawText(`Target: ${Math.round(body.targetWeightKg * 2.20462)} lbs`, { x: 350, y, size: 11, font, color: muted });
        }
        y -= 22;
        if (body.currentBodyFat != null) {
          page.drawText(`Body Fat: ${body.currentBodyFat}%`, { x: 48, y, size: 11, font: bold, color: copper });
          if (body.previousBodyFat != null) {
            page.drawText(`Previous: ${body.previousBodyFat}%`, { x: 190, y, size: 11, font, color: muted });
          }
          y -= 18;
        }
      }

      if (photos.length > 0 && y > 170) {
        y -= 18;
        page.drawText('Progress Photos', { x: 38, y, size: 16, font: bold, color: cream });
        const selectedPhotos = photos.slice(-2);
        await Promise.all(selectedPhotos.map(async (photo, index) => {
          try {
            const embedded = await embedProgressPhoto(pdfDoc, photo.uri);
            const photoX = 48 + index * 172;
            const photoY = y - 142;
            page.drawImage(embedded, { x: photoX, y: photoY, width: 138, height: 112 });
            page.drawText(photo.date, { x: photoX, y: photoY - 16, size: 9, font, color: muted });
          } catch {}
        }));
      }

      page.drawRectangle({ x: 0, y: 0, width, height: 44, color: rgb(0.08, 0.07, 0.06) });
      page.drawText('Built by SpiceStrong - one strong meal at a time.', {
        x: 38,
        y: 17,
        size: 10,
        font: bold,
        color: muted,
      });

      const pdfBase64 = await pdfDoc.saveAsBase64();
      const file = new File(Paths.cache, `spicestrong-${period}-progress-report.pdf`);
      file.write(pdfBase64, { encoding: 'base64' });
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share your SpiceStrong progress report',
        UTI: 'com.adobe.pdf',
      });
    } catch (error) {
      console.error('[SpiceStrong] Progress PDF share failed:', error);
      Alert.alert('Could Not Share Report', 'Please try again in a moment.');
    } finally {
      setSharingPdf(false);
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

      <View style={styles.shareRow}>
        <TouchableOpacity
          style={[styles.shareBtn, (sharingPdf || loading) && styles.shareBtnDisabled]}
          onPress={shareProgressPdf}
          disabled={sharingPdf || loading}
          activeOpacity={0.82}
        >
          <Text style={styles.shareBtnText}>{sharingPdf ? 'Creating PDF...' : 'Share Fancy PDF'}</Text>
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
  shareRow: {
    paddingHorizontal: 20,
    paddingBottom: 10,
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
