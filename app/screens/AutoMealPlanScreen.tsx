/**
 * AutoMealPlanScreen.tsx — SpiceStrong
 * Wizard for auto-generating a 7-day meal plan.
 *
 * Step 1: Daily calorie & protein targets
 * Step 2: Select which meal slots to fill
 * Step 3: Generating (progress screen)
 * Step 4: Done → navigate to Meal Plan
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { generateAutoMealPlan, type AutoPlanPreferences } from '../../services/autoMealPlanService';
import { type MealSlot } from '../../services/mealPlanService';

const ORANGE = '#E85D26';
const BG = '#0F0F0F';
const SURFACE = '#1A1A1A';
const BORDER = 'rgba(255,255,255,0.10)';
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'PlayfairDisplay_700Bold',
  default: 'serif',
});

type Step = 'targets' | 'slots' | 'generating' | 'done';

interface SlotOption {
  slot: MealSlot;
  label: string;
  emoji: string;
  description: string;
}

const SLOT_OPTIONS: SlotOption[] = [
  { slot: 'breakfast', label: 'Breakfast', emoji: '🌅', description: '~25% of daily calories' },
  { slot: 'lunch_dinner', label: 'Lunch', emoji: '🍽', description: '~30% of daily calories' },
  { slot: 'lunch_dinner', label: 'Dinner', emoji: '🥘', description: '~30% of daily calories' },
  { slot: 'snack_dessert', label: 'Snack / Dessert', emoji: '🥜', description: '~15% of daily calories' },
];

export default function AutoMealPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('targets');

  // Step 1: Targets
  const [calories, setCalories] = useState('2000');
  const [protein, setProtein] = useState('150');

  // Step 2: Slots
  const [selectedSlots, setSelectedSlots] = useState<Set<number>>(new Set([0, 1, 2])); // breakfast, lunch, dinner default

  // Step 3: Generating
  const [genProgress, setGenProgress] = useState('');
  const [genResult, setGenResult] = useState<{ totalFilled: number; fromLibrary: number; aiGenerated: number } | null>(null);

  const toggleSlot = (idx: number) => {
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const startGeneration = async () => {
    Keyboard.dismiss();
    const cal = Math.max(1000, Math.min(5000, Number(calories) || 2000));
    const prot = Math.max(50, Math.min(400, Number(protein) || 150));

    // Build slot list (can have duplicates for lunch + dinner both mapping to lunch_dinner)
    const slots: MealSlot[] = [];
    selectedSlots.forEach((idx) => {
      slots.push(SLOT_OPTIONS[idx].slot);
    });

    if (slots.length === 0) {
      Alert.alert('No meals selected', 'Please select at least one meal slot.');
      return;
    }

    setStep('generating');
    setGenProgress('Getting ready...');

    const today = new Date();
    const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const prefs: AutoPlanPreferences = {
      dailyCalories: cal,
      dailyProteinG: prot,
      slots,
      startDate,
    };

    const result = await generateAutoMealPlan(prefs, setGenProgress);

    if (result.errors.length > 0) {
      Alert.alert('Plan Generated with Issues', result.errors[0]);
    }

    setGenResult(result);
    setStep('done');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Auto Meal Plan</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Step 1: Targets */}
      {step === 'targets' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
          >
            <Text style={styles.stepTitle}>Set your daily targets</Text>
            <Text style={styles.stepHint}>We'll auto-split across your meals</Text>

            <View style={styles.targetCard}>
              <Text style={styles.targetLabel}>Daily Calories</Text>
              <View style={styles.targetInputRow}>
                <TextInput
                  style={styles.targetInput}
                  value={calories}
                  onChangeText={setCalories}
                  keyboardType="numeric"
                  returnKeyType="done"
                  placeholder="2000"
                  placeholderTextColor="rgba(255,255,255,0.20)"
                />
                <Text style={styles.targetUnit}>kcal</Text>
              </View>
            </View>

            <View style={styles.targetCard}>
              <Text style={[styles.targetLabel, { color: ORANGE }]}>Daily Protein</Text>
              <View style={styles.targetInputRow}>
                <TextInput
                  style={styles.targetInput}
                  value={protein}
                  onChangeText={setProtein}
                  keyboardType="numeric"
                  returnKeyType="done"
                  placeholder="150"
                  placeholderTextColor="rgba(255,255,255,0.20)"
                />
                <Text style={styles.targetUnit}>grams</Text>
              </View>
            </View>

            {/* Quick presets */}
            <Text style={styles.presetLabel}>QUICK PRESETS</Text>
            <View style={styles.presetRow}>
              {[
                { label: 'Fat Loss', cal: '1600', prot: '140' },
                { label: 'Maintenance', cal: '2000', prot: '150' },
                { label: 'Muscle Gain', cal: '2500', prot: '180' },
              ].map((p) => (
                <TouchableOpacity
                  key={p.label}
                  style={[styles.presetBtn, calories === p.cal && protein === p.prot && styles.presetBtnActive]}
                  onPress={() => { setCalories(p.cal); setProtein(p.prot); }}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.presetBtnText, calories === p.cal && protein === p.prot && styles.presetBtnTextActive]}>{p.label}</Text>
                  <Text style={styles.presetBtnSub}>{p.cal} cal · {p.prot}g P</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity style={styles.nextBtn} onPress={() => { Keyboard.dismiss(); setStep('slots'); }} activeOpacity={0.8}>
              <Text style={styles.nextBtnText}>Next: Choose Meals</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Step 2: Slot selection */}
      {step === 'slots' && (
        <>
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.stepTitle}>What meals do you want?</Text>
            <Text style={styles.stepHint}>Same meals planned for all 7 days</Text>

            {SLOT_OPTIONS.map((opt, idx) => {
              const selected = selectedSlots.has(idx);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.slotCard, selected && styles.slotCardSelected]}
                  onPress={() => toggleSlot(idx)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.slotEmoji}>{opt.emoji}</Text>
                  <View style={styles.slotTextBlock}>
                    <Text style={[styles.slotLabel, selected && styles.slotLabelSelected]}>{opt.label}</Text>
                    <Text style={styles.slotDesc}>{opt.description}</Text>
                  </View>
                  <View style={[styles.slotCheck, selected && styles.slotCheckSelected]}>
                    {selected && <Text style={styles.slotCheckMark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Your Week</Text>
              <Text style={styles.summaryText}>
                {selectedSlots.size} meals/day × 7 days = {selectedSlots.size * 7} meals
              </Text>
              <Text style={styles.summaryText}>
                ~{calories} cal/day · ~{protein}g protein/day
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.footerRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep('targets')} activeOpacity={0.75}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.generateBtn} onPress={startGeneration} activeOpacity={0.8}>
                <LinearGradient colors={['#F07030', '#C84A10']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.generateBtnGradient}>
                  <Text style={styles.generateBtnText}>Generate Plan</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* Step 3: Generating */}
      {step === 'generating' && (
        <View style={styles.genWrap}>
          <ActivityIndicator color={ORANGE} size="large" />
          <Text style={styles.genEmoji}>📅</Text>
          <Text style={styles.genTitle}>Building Your Week</Text>
          <Text style={styles.genProgress}>{genProgress}</Text>
        </View>
      )}

      {/* Step 4: Done */}
      {step === 'done' && genResult && (
        <View style={styles.genWrap}>
          <Text style={styles.doneEmoji}>✅</Text>
          <Text style={styles.doneTitle}>Meal Plan Ready!</Text>
          <View style={styles.doneStats}>
            <Text style={styles.doneStat}>{genResult.totalFilled} meals planned</Text>
            <Text style={styles.doneStatSub}>
              {genResult.fromLibrary} from your recipes · {genResult.aiGenerated} new
            </Text>
          </View>
          <TouchableOpacity
            style={styles.viewPlanBtn}
            onPress={() => {
              router.replace('/screens/MealPlanScreen');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.viewPlanBtnText}>View Meal Plan</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
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

  scroll: { paddingHorizontal: 20, paddingTop: 24 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  stepHint: { fontSize: 13, color: 'rgba(255,255,255,0.50)', marginBottom: 24 },

  // Step 1: Targets
  targetCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 14,
  },
  targetLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  targetInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  targetInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  targetUnit: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.40)', width: 50 },

  presetLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 10,
  },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  presetBtnActive: { borderColor: ORANGE, backgroundColor: 'rgba(232,93,38,0.12)' },
  presetBtnText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.60)' },
  presetBtnTextActive: { color: ORANGE },
  presetBtnSub: { fontSize: 10, color: 'rgba(255,255,255,0.30)', marginTop: 2 },

  // Step 2: Slots
  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 14,
  },
  slotCardSelected: { borderColor: ORANGE, backgroundColor: 'rgba(232,93,38,0.10)' },
  slotEmoji: { fontSize: 28 },
  slotTextBlock: { flex: 1 },
  slotLabel: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.70)' },
  slotLabelSelected: { color: '#FFFFFF' },
  slotDesc: { fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  slotCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotCheckSelected: { backgroundColor: ORANGE, borderColor: ORANGE },
  slotCheckMark: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  summaryCard: {
    backgroundColor: 'rgba(232,93,38,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.25)',
    padding: 16,
    marginTop: 10,
    alignItems: 'center',
    gap: 4,
  },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: ORANGE },
  summaryText: { fontSize: 13, color: 'rgba(255,255,255,0.50)' },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  footerRow: { flexDirection: 'row', gap: 10 },
  nextBtn: {
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  nextBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  backBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  backBtnText: { color: 'rgba(255,255,255,0.60)', fontSize: 15, fontWeight: '700' },
  generateBtn: {
    flex: 2,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  generateBtnGradient: { paddingVertical: 16, alignItems: 'center', borderRadius: 16 },
  generateBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  // Generating & Done
  genWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  genEmoji: { fontSize: 64, marginBottom: 8 },
  genTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
  genProgress: { fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center' },

  doneEmoji: { fontSize: 64, marginBottom: 8 },
  doneTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
  doneStats: { alignItems: 'center', gap: 4, marginTop: 8 },
  doneStat: { fontSize: 18, fontWeight: '700', color: ORANGE },
  doneStatSub: { fontSize: 13, color: 'rgba(255,255,255,0.50)' },
  viewPlanBtn: {
    marginTop: 24,
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 40,
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  viewPlanBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});
