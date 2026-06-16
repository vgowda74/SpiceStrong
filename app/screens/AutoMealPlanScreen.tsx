/**
 * AutoMealPlanScreen.tsx — SpiceStrong
 * Wizard for auto-generating a 7-day meal plan.
 *
 * Step 1: Daily calorie & protein targets
 * Step 2: Select which meal slots to fill
 * Step 3: Generating (progress screen)
 * Step 4: Done → navigate to Meal Plan
 */

import React, { useEffect, useState } from 'react';
import {
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
import { getSavedMacroTargets } from '../../services/fitnessProfileService';
import { type MealSlot } from '../../services/mealPlanService';
import { checkLimit, recordUsage, type LimitCheck } from '../../services/subscriptionService';
import { trackEvent } from '../../services/analyticsService';
import PaywallModal from '../../components/PaywallModal';
import { PremiumScreen } from '../../components/PremiumScreen';
import { HomeButton } from '../../components/HomeButton';
import { ProcessingRing } from '../../components/ProcessingRing';

const ORANGE = '#8F3A1F';
const SURFACE = 'rgba(248,241,232,0.08)';
const BORDER = 'rgba(248,241,232,0.12)';
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'serif',
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

const CUISINE_OPTIONS = [
  'Any', 'Indian', 'South Indian', 'Thai', 'Chinese', 'Korean',
  'Japanese', 'Mediterranean', 'Italian', 'Greek', 'American', 'Mexican',
];

const COOK_TIME_OPTIONS: { key: AutoPlanPreferences['cookTimeOption'] | 'any'; label: string }[] = [
  { key: 'any', label: 'Any time' },
  { key: 'under15', label: 'Under 15 min' },
  { key: '15to30', label: '15-30 min' },
  { key: '30to60', label: '30-60 min' },
  { key: '60plus', label: '1 hour+' },
];

export default function AutoMealPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('targets');

  // Step 1: Targets (pre-filled from Fitness Profile if available)
  const [calories, setCalories] = useState('2000');
  const [protein, setProtein] = useState('150');
  const [carbs, setCarbs] = useState('200');
  const [fat, setFat] = useState('65');
  const [servingCount, setServingCount] = useState(2);

  // Load fitness profile targets on mount
  useEffect(() => {
    (async () => {
      const targets = await getSavedMacroTargets();
      if (targets) {
        setCalories(String(targets.calories));
        setProtein(String(targets.proteinG));
        setCarbs(String(targets.carbsG));
        setFat(String(targets.fatG));
      }
    })();
  }, []);

  // Step 2: Slots + options
  const [selectedSlots, setSelectedSlots] = useState<Set<number>>(new Set([0, 1, 2])); // breakfast, lunch, dinner default
  const [samePlanEveryDay, setSamePlanEveryDay] = useState(true);
  const [pantryOnly, setPantryOnly] = useState(false);
  const [cuisineStyle, setCuisineStyle] = useState('Any');
  const [cookTimeOption, setCookTimeOption] = useState<AutoPlanPreferences['cookTimeOption'] | 'any'>('any');

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

  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallCheck, setPaywallCheck] = useState<LimitCheck | null>(null);

  const startGeneration = async () => {
    Keyboard.dismiss();
    // Freemium limit check
    const limitResult = await checkLimit('meal_plan');
    if (!limitResult.allowed) { setPaywallCheck(limitResult); setPaywallVisible(true); return; }

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
    trackEvent('auto_meal_plan_generated', {
      screen: 'AutoMealPlanScreen',
      metadata: { slots: slots.length, servingCount, pantryOnly, cuisineStyle, cookTimeOption },
    });

    const today = new Date();
    const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const prefs: AutoPlanPreferences = {
      dailyCalories: cal,
      dailyProteinG: prot,
      dailyCarbsG: Math.max(0, Number(carbs) || 200),
      dailyFatG: Math.max(0, Number(fat) || 65),
      slots,
      startDate,
      samePlanEveryDay,
      pantryOnly,
      servingCount,
      cuisineStyle: cuisineStyle === 'Any' ? null : cuisineStyle,
      cookTimeOption: cookTimeOption === 'any' ? null : cookTimeOption,
    };

    const result = await generateAutoMealPlan(prefs, setGenProgress);

    if (result.errors.length > 0) {
      Alert.alert('Plan Generated with Issues', result.errors[0]);
    }

    setGenResult(result);
    setStep('done');
    recordUsage('meal_plan');
  };

  return (
    <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Auto Meal Plan</Text>
        <HomeButton />
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
            <Text style={styles.stepHint}>Per person — we'll adjust ingredients accordingly</Text>

            {/* Servings */}
            <View style={styles.servingsCard}>
              <Text style={styles.targetLabel}>How many people?</Text>
              <View style={styles.servingsRow}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.servingsPill, servingCount === n && styles.servingsPillActive]}
                    onPress={() => setServingCount(n)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.servingsPillText, servingCount === n && styles.servingsPillTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

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

            {/* Macro row: Protein, Carbs, Fat side by side */}
            <View style={styles.macroInputRow}>
              <View style={styles.macroInputCard}>
                <Text style={[styles.macroInputLabel, { color: ORANGE }]}>Protein</Text>
                <TextInput style={styles.macroInput} value={protein} onChangeText={setProtein} keyboardType="numeric" returnKeyType="done" placeholder="150" placeholderTextColor="rgba(255,255,255,0.20)" />
                <Text style={styles.macroInputUnit}>g</Text>
              </View>
              <View style={styles.macroInputCard}>
                <Text style={styles.macroInputLabel}>Carbs</Text>
                <TextInput style={styles.macroInput} value={carbs} onChangeText={setCarbs} keyboardType="numeric" returnKeyType="done" placeholder="200" placeholderTextColor="rgba(255,255,255,0.20)" />
                <Text style={styles.macroInputUnit}>g</Text>
              </View>
              <View style={styles.macroInputCard}>
                <Text style={styles.macroInputLabel}>Fat</Text>
                <TextInput style={styles.macroInput} value={fat} onChangeText={setFat} keyboardType="numeric" returnKeyType="done" placeholder="65" placeholderTextColor="rgba(255,255,255,0.20)" />
                <Text style={styles.macroInputUnit}>g</Text>
              </View>
            </View>

            {/* Quick presets */}
            <Text style={styles.presetLabel}>QUICK PRESETS</Text>
            <View style={styles.presetRow}>
              {[
                { label: 'Fat Loss', cal: '1600', prot: '140', carb: '120', f: '55' },
                { label: 'Maintenance', cal: '2000', prot: '150', carb: '200', f: '65' },
                { label: 'Muscle Gain', cal: '2500', prot: '180', carb: '280', f: '75' },
              ].map((p) => (
                <TouchableOpacity
                  key={p.label}
                  style={[styles.presetBtn, calories === p.cal && protein === p.prot && styles.presetBtnActive]}
                  onPress={() => { setCalories(p.cal); setProtein(p.prot); setCarbs(p.carb); setFat(p.f); }}
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
            <Text style={styles.stepHint}>Select your daily meal slots and planning preferences</Text>

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

            <View style={styles.preferenceCard}>
              <Text style={styles.preferenceTitle}>Cuisine Style</Text>
              <View style={styles.preferenceChipRow}>
                {CUISINE_OPTIONS.map((c) => {
                  const selected = cuisineStyle === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[styles.preferenceChip, selected && styles.preferenceChipActive]}
                      onPress={() => setCuisineStyle(c)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.preferenceChipText, selected && styles.preferenceChipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.preferenceCard}>
              <Text style={styles.preferenceTitle}>Cook Time</Text>
              <View style={styles.preferenceChipRow}>
                {COOK_TIME_OPTIONS.map((opt) => {
                  const selected = cookTimeOption === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.preferenceChip, selected && styles.preferenceChipActive]}
                      onPress={() => setCookTimeOption(opt.key)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.preferenceChipText, selected && styles.preferenceChipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Options */}
            <View style={styles.optionSection}>
              <TouchableOpacity
                style={[styles.optionRow, samePlanEveryDay && styles.optionRowActive]}
                onPress={() => setSamePlanEveryDay(!samePlanEveryDay)}
                activeOpacity={0.75}
              >
                <View style={styles.optionTextBlock}>
                  <Text style={styles.optionLabel}>Same plan every day</Text>
                  <Text style={styles.optionDesc}>Repeat the same meals Mon–Sun for easy meal prep</Text>
                </View>
                <View style={[styles.optionToggle, samePlanEveryDay && styles.optionToggleOn]}>
                  <View style={[styles.optionToggleDot, samePlanEveryDay && styles.optionToggleDotOn]} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.optionRow, pantryOnly && styles.optionRowActive]}
                onPress={() => setPantryOnly(!pantryOnly)}
                activeOpacity={0.75}
              >
                <View style={styles.optionTextBlock}>
                  <Text style={styles.optionLabel}>Pantry recipes only</Text>
                  <Text style={styles.optionDesc}>Only use recipes matching your pantry items</Text>
                </View>
                <View style={[styles.optionToggle, pantryOnly && styles.optionToggleOn]}>
                  <View style={[styles.optionToggleDot, pantryOnly && styles.optionToggleDotOn]} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Your Week</Text>
              <Text style={styles.summaryText}>
                {selectedSlots.size} meals/day × 7 days = {selectedSlots.size * 7} meals
              </Text>
              <Text style={styles.summaryText}>
                ~{calories} cal · ~{protein}g P · ~{carbs}g C · ~{fat}g F per day
              </Text>
              {samePlanEveryDay && <Text style={styles.summaryText}>Same meals every day</Text>}
              {pantryOnly && <Text style={[styles.summaryText, { color: ORANGE }]}>🛒 Pantry recipes only</Text>}
              {cuisineStyle !== 'Any' && <Text style={styles.summaryText}>{cuisineStyle} cuisine preferred</Text>}
              {cookTimeOption !== 'any' && (
                <Text style={styles.summaryText}>
                  {COOK_TIME_OPTIONS.find((opt) => opt.key === cookTimeOption)?.label} preferred
                </Text>
              )}
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.footerRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep('targets')} activeOpacity={0.75}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.generateBtn} onPress={startGeneration} activeOpacity={0.8}>
                <LinearGradient colors={['#A94724', '#742B17']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.generateBtnGradient}>
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
          <ProcessingRing label={genProgress || 'Building your week...'} sublabel="Creating your personalised meal plan" expectedMs={15000} size={108} />
          <Text style={styles.genEmoji}>📅</Text>
          <Text style={styles.genTitle}>Building Your Week</Text>
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
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} limitCheck={paywallCheck} onUpgrade={() => { setPaywallVisible(false); /* TODO: IAP */ }} />
    </PremiumScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerBackBtn: {
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

  // Servings selector
  profileBanner: {
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  profileBannerText: { fontSize: 12, fontWeight: '600', color: '#22C55E', textAlign: 'center' },

  servingsCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 14,
  },
  servingsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  servingsPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  servingsPillActive: { borderColor: ORANGE, backgroundColor: 'rgba(143,58,31,0.15)' },
  servingsPillText: { fontSize: 18, fontWeight: '800', color: 'rgba(255,255,255,0.40)' },
  servingsPillTextActive: { color: ORANGE },

  // Macro input row (Protein, Carbs, Fat)
  macroInputRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  macroInputCard: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  macroInputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
  },
  macroInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  macroInputUnit: { fontSize: 11, color: 'rgba(255,255,255,0.35)' },

  // Options (same plan, pantry only)
  optionSection: { marginTop: 16, gap: 8 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  optionRowActive: { borderColor: ORANGE, backgroundColor: 'rgba(143,58,31,0.08)' },
  optionTextBlock: { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  optionDesc: { fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 2 },
  optionToggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  optionToggleOn: { backgroundColor: ORANGE },
  optionToggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.50)',
  },
  optionToggleDotOn: {
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-end',
  },

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
  presetBtnActive: { borderColor: ORANGE, backgroundColor: 'rgba(143,58,31,0.12)' },
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
  slotCardSelected: { borderColor: ORANGE, backgroundColor: 'rgba(143,58,31,0.10)' },
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

  preferenceCard: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  preferenceTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  preferenceChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  preferenceChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  preferenceChipActive: {
    backgroundColor: 'rgba(143,58,31,0.18)',
    borderColor: ORANGE,
  },
  preferenceChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.54)',
  },
  preferenceChipTextActive: {
    color: '#FFFFFF',
  },

  summaryCard: {
    backgroundColor: 'rgba(143,58,31,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.25)',
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
    backgroundColor: 'rgba(13,11,9,0.92)',
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
