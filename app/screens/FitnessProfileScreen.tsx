/**
 * FitnessProfileScreen.tsx — SpiceStrong
 * Collects user fitness data to calculate daily calorie/macro targets.
 * Step-by-step flow: Goal → Gender → Age → Height → Weight → Target Weight → Body Fat → Activity Level → Results
 */

import React, { useEffect, useState } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  calculateMacroTargets,
  saveFitnessProfile,
  getFitnessProfile,
  GOAL_LABELS,
  ACTIVITY_LABELS,
  lbsToKg,
  kgToLbs,
  ftInToCm,
  cmToFtIn,
  type FitnessGoal,
  type Gender,
  type ActivityLevel,
  type FitnessProfile,
  type MacroTargets,
} from '../../services/fitnessProfileService';
import { PremiumScreen } from '../../components/PremiumScreen';
import { HomeButton } from '../../components/HomeButton';

const ORANGE = '#8F3A1F';
const SURFACE = 'rgba(248,241,232,0.08)';
const BORDER = 'rgba(248,241,232,0.12)';
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'PlayfairDisplay_700Bold',
  default: 'serif',
});

type Step = 'goal' | 'gender' | 'age' | 'height' | 'weight' | 'target_weight' | 'body_fat' | 'activity' | 'results';
const STEPS: Step[] = ['goal', 'gender', 'age', 'height', 'weight', 'target_weight', 'body_fat', 'activity', 'results'];

export default function FitnessProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('goal');

  // Form state
  const [goal, setGoal] = useState<FitnessGoal>('maintenance');
  const [gender, setGender] = useState<Gender>('male');
  const [age, setAge] = useState('30');
  const [useImperial, setUseImperial] = useState(true);
  const [heightFt, setHeightFt] = useState('5');
  const [heightIn, setHeightIn] = useState('10');
  const [heightCm, setHeightCm] = useState('178');
  const [weightLbs, setWeightLbs] = useState('170');
  const [weightKg, setWeightKg] = useState('77');
  const [targetWeightLbs, setTargetWeightLbs] = useState('');
  const [targetWeightKg, setTargetWeightKg] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderately_active');

  const [waist, setWaist] = useState('');
  const [neck, setNeck] = useState('');
  const [hip, setHip] = useState('');

  // Results
  const [macros, setMacros] = useState<MacroTargets | null>(null);

  // Load existing profile
  useEffect(() => {
    (async () => {
      const existing = await getFitnessProfile();
      if (existing) {
        setGoal(existing.goal);
        setGender(existing.gender);
        setAge(String(existing.age));
        setHeightCm(String(existing.heightCm));
        const { ft, inches } = cmToFtIn(existing.heightCm);
        setHeightFt(String(ft));
        setHeightIn(String(inches));
        setWeightKg(String(existing.weightKg));
        setWeightLbs(String(kgToLbs(existing.weightKg)));
        if (existing.targetWeightKg) {
          setTargetWeightKg(String(existing.targetWeightKg));
          setTargetWeightLbs(String(kgToLbs(existing.targetWeightKg)));
        }
        if (existing.bodyFatPercent) setBodyFat(String(existing.bodyFatPercent));
        if (existing.waistCm) setWaist(String(useImperial ? Math.round((existing.waistCm / 2.54) * 10) / 10 : existing.waistCm));
        if (existing.neckCm) setNeck(String(useImperial ? Math.round((existing.neckCm / 2.54) * 10) / 10 : existing.neckCm));
        if (existing.hipCm) setHip(String(useImperial ? Math.round((existing.hipCm / 2.54) * 10) / 10 : existing.hipCm));
        setActivityLevel(existing.activityLevel);
      }
    })();
  }, []);


  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      Keyboard.dismiss();
      const nextStep = STEPS[idx + 1];
      // If going to results, calculate
      if (nextStep === 'results') calculateAndSave();
      setStep(nextStep);
    }
  };

  const goBack = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) {
      Keyboard.dismiss();
      setStep(STEPS[idx - 1]);
    } else {
      router.back();
    }
  };

  const calculateAndSave = async (bodyFatOverride?: string) => {
    const wKg = useImperial ? lbsToKg(parseFloat(weightLbs) || 77) : parseFloat(weightKg) || 77;
    const hCm = useImperial ? ftInToCm(parseInt(heightFt) || 5, parseInt(heightIn) || 10) : parseFloat(heightCm) || 178;
    const twKg = useImperial
      ? (targetWeightLbs ? lbsToKg(parseFloat(targetWeightLbs)) : undefined)
      : (targetWeightKg ? parseFloat(targetWeightKg) : undefined);
    const measurementToCm = (value: string) => {
      const parsed = parseFloat(value);
      if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
      return useImperial ? Math.round(parsed * 2.54 * 10) / 10 : parsed;
    };
    const bfValue = bodyFatOverride ?? bodyFat;

    const profile: FitnessProfile = {
      goal,
      gender,
      age: parseInt(age) || 30,
      heightCm: hCm,
      weightKg: wKg,
      targetWeightKg: twKg,
      bodyFatPercent: bfValue ? parseFloat(bfValue) : undefined,
      waistCm: measurementToCm(waist),
      neckCm: measurementToCm(neck),
      hipCm: measurementToCm(hip),
      activityLevel,
      updatedAt: Date.now(),
    };

    const targets = calculateMacroTargets(profile);
    setMacros(targets);
    await saveFitnessProfile(profile);
  };

  const stepIndex = STEPS.indexOf(step);
  const progress = (stepIndex + 1) / STEPS.length;

  // ── Option card component ──
  const OptionCard = ({ label, desc, selected, onPress }: { label: string; desc?: string; selected: boolean; onPress: () => void }) => (
    <TouchableOpacity style={[styles.optionCard, selected && styles.optionCardActive]} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.optionTextBlock}>
        <Text style={[styles.optionLabel, selected && styles.optionLabelActive]}>{label}</Text>
        {desc && <Text style={styles.optionDesc}>{desc}</Text>}
      </View>
      <View style={[styles.optionRadio, selected && styles.optionRadioActive]}>
        {selected && <View style={styles.optionRadioDot} />}
      </View>
    </TouchableOpacity>
  );

  return (
    <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fitness Profile</Text>
        <HomeButton />
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
        >

          {/* STEP 1: Goal */}
          {step === 'goal' && (
            <>
              <Text style={styles.stepTitle}>What's your fitness goal?</Text>
              <Text style={styles.stepHint}>This determines how we split your calories and macros</Text>
              {(Object.keys(GOAL_LABELS) as FitnessGoal[]).map((g) => (
                <OptionCard key={g} label={GOAL_LABELS[g].label} desc={GOAL_LABELS[g].desc} selected={goal === g} onPress={() => setGoal(g)} />
              ))}
            </>
          )}

          {/* STEP 2: Gender */}
          {step === 'gender' && (
            <>
              <Text style={styles.stepTitle}>What's your biological sex?</Text>
              <Text style={styles.stepHint}>Used to calculate your basal metabolic rate accurately</Text>
              {([
                { key: 'male' as Gender, label: 'Male', emoji: '♂️' },
                { key: 'female' as Gender, label: 'Female', emoji: '♀️' },
                { key: 'other' as Gender, label: 'Prefer not to say', emoji: '' },
              ]).map((g) => (
                <OptionCard key={g.key} label={`${g.emoji} ${g.label}`.trim()} selected={gender === g.key} onPress={() => setGender(g.key)} />
              ))}
            </>
          )}

          {/* STEP 3: Age */}
          {step === 'age' && (
            <>
              <Text style={styles.stepTitle}>How old are you?</Text>
              <Text style={styles.stepHint}>Your metabolism changes with age — this helps us be precise</Text>
              <TextInput
                style={styles.bigInput}
                value={age}
                onChangeText={setAge}
                keyboardType="numeric"
                returnKeyType="done"
                placeholder="30"
                placeholderTextColor="rgba(255,255,255,0.20)"
                maxLength={3}
              />
              <Text style={styles.inputUnit}>years old</Text>
            </>
          )}

          {/* STEP 4: Height */}
          {step === 'height' && (
            <>
              <Text style={styles.stepTitle}>What's your height?</Text>
              <Text style={styles.stepHint}>Used with your weight to calculate BMR</Text>
              <View style={styles.unitToggle}>
                <TouchableOpacity style={[styles.unitBtn, useImperial && styles.unitBtnActive]} onPress={() => setUseImperial(true)}>
                  <Text style={[styles.unitBtnText, useImperial && styles.unitBtnTextActive]}>ft / in</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.unitBtn, !useImperial && styles.unitBtnActive]} onPress={() => setUseImperial(false)}>
                  <Text style={[styles.unitBtnText, !useImperial && styles.unitBtnTextActive]}>cm</Text>
                </TouchableOpacity>
              </View>
              {useImperial ? (
                <View style={styles.dualInput}>
                  <View style={styles.dualInputField}>
                    <TextInput style={styles.bigInput} value={heightFt} onChangeText={setHeightFt} keyboardType="numeric" returnKeyType="done" placeholder="5" placeholderTextColor="rgba(255,255,255,0.20)" maxLength={1} />
                    <Text style={styles.inputUnit}>feet</Text>
                  </View>
                  <View style={styles.dualInputField}>
                    <TextInput style={styles.bigInput} value={heightIn} onChangeText={setHeightIn} keyboardType="numeric" returnKeyType="done" placeholder="10" placeholderTextColor="rgba(255,255,255,0.20)" maxLength={2} />
                    <Text style={styles.inputUnit}>inches</Text>
                  </View>
                </View>
              ) : (
                <>
                  <TextInput style={styles.bigInput} value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" returnKeyType="done" placeholder="178" placeholderTextColor="rgba(255,255,255,0.20)" maxLength={3} />
                  <Text style={styles.inputUnit}>centimeters</Text>
                </>
              )}
            </>
          )}

          {/* STEP 5: Weight */}
          {step === 'weight' && (
            <>
              <Text style={styles.stepTitle}>What's your current weight?</Text>
              <Text style={styles.stepHint}>This is the most important factor in calculating your calorie needs</Text>
              <View style={styles.unitToggle}>
                <TouchableOpacity style={[styles.unitBtn, useImperial && styles.unitBtnActive]} onPress={() => setUseImperial(true)}>
                  <Text style={[styles.unitBtnText, useImperial && styles.unitBtnTextActive]}>lbs</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.unitBtn, !useImperial && styles.unitBtnActive]} onPress={() => setUseImperial(false)}>
                  <Text style={[styles.unitBtnText, !useImperial && styles.unitBtnTextActive]}>kg</Text>
                </TouchableOpacity>
              </View>
              {useImperial ? (
                <>
                  <TextInput style={styles.bigInput} value={weightLbs} onChangeText={setWeightLbs} keyboardType="numeric" returnKeyType="done" placeholder="170" placeholderTextColor="rgba(255,255,255,0.20)" maxLength={3} />
                  <Text style={styles.inputUnit}>pounds</Text>
                </>
              ) : (
                <>
                  <TextInput style={styles.bigInput} value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" returnKeyType="done" placeholder="77" placeholderTextColor="rgba(255,255,255,0.20)" maxLength={3} />
                  <Text style={styles.inputUnit}>kilograms</Text>
                </>
              )}
            </>
          )}

          {/* STEP 6: Target Weight */}
          {step === 'target_weight' && (
            <>
              <Text style={styles.stepTitle}>What's your target weight?</Text>
              <Text style={styles.stepHint}>Optional — helps us understand your journey</Text>
              {useImperial ? (
                <>
                  <TextInput style={styles.bigInput} value={targetWeightLbs} onChangeText={setTargetWeightLbs} keyboardType="numeric" returnKeyType="done" placeholder="160" placeholderTextColor="rgba(255,255,255,0.20)" maxLength={3} />
                  <Text style={styles.inputUnit}>pounds</Text>
                </>
              ) : (
                <>
                  <TextInput style={styles.bigInput} value={targetWeightKg} onChangeText={setTargetWeightKg} keyboardType="numeric" returnKeyType="done" placeholder="73" placeholderTextColor="rgba(255,255,255,0.20)" maxLength={3} />
                  <Text style={styles.inputUnit}>kilograms</Text>
                </>
              )}
              <TouchableOpacity onPress={goNext} activeOpacity={0.7}>
                <Text style={styles.skipText}>Skip for now</Text>
              </TouchableOpacity>
            </>
          )}

          {/* STEP 7: Body Fat */}
          {step === 'body_fat' && (
            <>
              <Text style={styles.stepTitle}>What's your body fat %?</Text>
              <Text style={styles.stepHint}>Optional — improves macro accuracy. Use AI Body Scan from the menu for a photo-based estimate.</Text>
              <TextInput style={styles.bigInput} value={bodyFat} onChangeText={setBodyFat} keyboardType="numeric" returnKeyType="done" placeholder="20" placeholderTextColor="rgba(255,255,255,0.20)" maxLength={4} />
              <Text style={styles.inputUnit}>% body fat</Text>
              <View style={styles.measureCard}>
                <Text style={styles.measureTitle}>Optional measurements</Text>
                <Text style={styles.measureHint}>Waist and neck improve the estimate; hip helps for female profiles.</Text>
                <View style={styles.measureGrid}>
                  <View style={styles.measureField}>
                    <Text style={styles.measureLabel}>Waist</Text>
                    <TextInput style={styles.measureInput} value={waist} onChangeText={setWaist} keyboardType="decimal-pad" returnKeyType="done" placeholder={useImperial ? '34' : '86'} placeholderTextColor="rgba(255,255,255,0.20)" maxLength={5} />
                    <Text style={styles.measureUnit}>{useImperial ? 'in' : 'cm'}</Text>
                  </View>
                  <View style={styles.measureField}>
                    <Text style={styles.measureLabel}>Neck</Text>
                    <TextInput style={styles.measureInput} value={neck} onChangeText={setNeck} keyboardType="decimal-pad" returnKeyType="done" placeholder={useImperial ? '15' : '38'} placeholderTextColor="rgba(255,255,255,0.20)" maxLength={5} />
                    <Text style={styles.measureUnit}>{useImperial ? 'in' : 'cm'}</Text>
                  </View>
                  <View style={styles.measureField}>
                    <Text style={styles.measureLabel}>Hip</Text>
                    <TextInput style={styles.measureInput} value={hip} onChangeText={setHip} keyboardType="decimal-pad" returnKeyType="done" placeholder={useImperial ? '40' : '102'} placeholderTextColor="rgba(255,255,255,0.20)" maxLength={5} />
                    <Text style={styles.measureUnit}>{useImperial ? 'in' : 'cm'}</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={goNext} activeOpacity={0.7}>
                <Text style={styles.skipText}>Skip this step</Text>
              </TouchableOpacity>
            </>
          )}

          {/* STEP 8: Activity Level */}
          {step === 'activity' && (
            <>
              <Text style={styles.stepTitle}>How active are you?</Text>
              <Text style={styles.stepHint}>Be honest — this significantly affects your calorie needs</Text>
              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
                <OptionCard key={a} label={ACTIVITY_LABELS[a].label} desc={ACTIVITY_LABELS[a].desc} selected={activityLevel === a} onPress={() => setActivityLevel(a)} />
              ))}
            </>
          )}

          {/* STEP 9: Results */}
          {step === 'results' && macros && (
            <>
              <Text style={styles.stepTitle}>Your Daily Targets</Text>
              <Text style={styles.stepHint}>Based on your profile — {GOAL_LABELS[goal].label}</Text>

              <View style={styles.resultsCard}>
                <View style={styles.resultsBig}>
                  <Text style={styles.resultsBigValue}>{macros.calories}</Text>
                  <Text style={styles.resultsBigLabel}>calories / day</Text>
                </View>

                <View style={styles.resultsRow}>
                  <View style={styles.resultsItem}>
                    <Text style={[styles.resultsValue, { color: ORANGE }]}>{macros.proteinG}g</Text>
                    <Text style={styles.resultsLabel}>Protein</Text>
                  </View>
                  <View style={styles.resultsDivider} />
                  <View style={styles.resultsItem}>
                    <Text style={styles.resultsValue}>{macros.carbsG}g</Text>
                    <Text style={styles.resultsLabel}>Carbs</Text>
                  </View>
                  <View style={styles.resultsDivider} />
                  <View style={styles.resultsItem}>
                    <Text style={styles.resultsValue}>{macros.fatG}g</Text>
                    <Text style={styles.resultsLabel}>Fat</Text>
                  </View>
                </View>

                <View style={styles.resultsDetail}>
                  <Text style={styles.resultsDetailText}>BMR: {macros.bmr} cal · TDEE: {macros.tdee} cal</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => router.back()}
                activeOpacity={0.8}
              >
                <Text style={styles.doneBtnText}>Save & Done</Text>
              </TouchableOpacity>

              <Text style={styles.resultsNote}>
                These targets will auto-fill when you create an Auto Meal Plan. You can always adjust them there.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Next button */}
      {step !== 'results' && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.8}>
            <Text style={styles.nextBtnText}>
              {step === 'activity' ? 'Calculate My Targets' : 'Continue'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', fontFamily: PLAYFAIR },

  progressBar: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressFill: {
    height: 3,
    backgroundColor: ORANGE,
    borderRadius: 2,
  },

  scroll: { paddingHorizontal: 20, paddingTop: 28 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 8, fontFamily: PLAYFAIR },
  stepHint: { fontSize: 14, color: 'rgba(255,255,255,0.50)', lineHeight: 21, marginBottom: 24 },

  // Option cards
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 10,
    gap: 14,
  },
  optionCardActive: { borderColor: ORANGE, backgroundColor: 'rgba(143,58,31,0.10)' },
  optionTextBlock: { flex: 1 },
  optionLabel: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.70)' },
  optionLabelActive: { color: '#FFFFFF' },
  optionDesc: { fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 3 },
  optionRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionRadioActive: { borderColor: ORANGE },
  optionRadioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: ORANGE },

  // Number inputs
  bigInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 20,
    paddingVertical: 18,
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
  },
  inputUnit: { fontSize: 14, color: 'rgba(255,255,255,0.40)', textAlign: 'center', marginTop: 8 },
  dualInput: { flexDirection: 'row', gap: 14 },
  dualInputField: { flex: 1 },
  measureCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginTop: 18,
  },
  measureTitle: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  measureHint: { fontSize: 12, color: 'rgba(255,255,255,0.42)', lineHeight: 17, marginBottom: 12 },
  measureGrid: { flexDirection: 'row', gap: 10 },
  measureField: { flex: 1 },
  measureLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.48)', marginBottom: 6 },
  measureInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  measureUnit: { fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 4 },

  // Unit toggle
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 3,
    marginBottom: 20,
    alignSelf: 'center',
  },
  unitBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  unitBtnActive: { backgroundColor: ORANGE },
  unitBtnText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.40)' },
  unitBtnTextActive: { color: '#FFFFFF' },

  skipText: { color: 'rgba(255,255,255,0.40)', fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 20, textDecorationLine: 'underline' },

  // Results
  resultsCard: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 24,
    marginBottom: 20,
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  resultsBig: { alignItems: 'center', marginBottom: 20 },
  resultsBigValue: { fontSize: 48, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
  resultsBigLabel: { fontSize: 14, color: 'rgba(255,255,255,0.50)', marginTop: 4 },
  resultsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  resultsItem: { alignItems: 'center', flex: 1 },
  resultsValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  resultsLabel: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
  resultsDivider: { width: 1, height: 36, backgroundColor: BORDER },
  resultsDetail: { marginTop: 16, alignItems: 'center' },
  resultsDetailText: { fontSize: 12, color: 'rgba(255,255,255,0.30)' },
  resultsNote: { fontSize: 13, color: 'rgba(255,255,255,0.40)', textAlign: 'center', lineHeight: 20, marginTop: 12 },

  doneBtn: {
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  doneBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },

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
  nextBtn: {
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

});
