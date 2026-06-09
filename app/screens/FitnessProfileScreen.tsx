/**
 * FitnessProfileScreen.tsx — SpiceStrong
 * Collects user fitness data to calculate daily calorie/macro targets.
 * Step-by-step flow: Goal → Gender → Age → Height → Weight → Target Weight → Body Fat → Activity Level → Results
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { generateBodyScanSample, generateScanInstrImages, type ScanInstrImages } from '../../services/imageGenerationService';
import { trackEvent } from '../../services/analyticsService';
import BodyOutline from '../../components/BodyOutline';
import * as Speech from 'expo-speech';
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

const SCREEN_W = Dimensions.get('window').width;
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

  const getPoseColor = (score: number) => {
    if (score >= 80) return '#34C759';
    if (score >= 50) return '#FFD60A';
    return '#FF3B30';
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
        <View style={{ width: 30 }} />
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
              {bodyScanMode !== null && (
                <>
                  <Text style={styles.stepTitle}>Progress Scan</Text>
                  <Text style={styles.stepHint}>How would you like to set your body composition?</Text>
                </>
              )}

              {/* ── Premium option selection ── */}
              {bodyScanMode === null && (
                <>
                  {/* Hero */}
                  <View style={styles.premScanHero}>
                    <View style={styles.premScanHeroText}>
                      <Text style={styles.premScanHeroTitle}>
                        {'Track Your\n'}
                        <Text style={styles.premScanHeroAccent}>Transformation</Text>
                      </Text>
                      <Text style={styles.premScanHeroSub}>
                        Choose how you'd like SpiceStrong to estimate your body fat and track progress.
                      </Text>
                    </View>
                    <View style={styles.premScanBodyVis}>
                      <Text style={styles.premScanBodyVisEmoji}>🏋️</Text>
                    </View>
                  </View>

                  {/* AI Body Scan card — full image */}
                  <TouchableOpacity style={styles.premScanAIImageCard} onPress={() => { setBodyScanMode('camera'); openGuidedBodyScan('front'); }} activeOpacity={0.88}>
                    <Image
                      source={require('../../assets/images/body-scan-mockup.png')}
                      style={styles.premScanAIImage}
                      contentFit="cover"
                    />
                  </TouchableOpacity>

                  {/* Enter Manually card — secondary */}
                  <TouchableOpacity style={styles.premScanManualCard} onPress={() => setBodyScanMode('manual')} activeOpacity={0.8}>
                    <View style={styles.premScanManualIconBox}>
                      <Text style={styles.premScanManualIconEmoji}>📋</Text>
                    </View>
                    <View style={styles.premScanManualText}>
                      <Text style={styles.premScanManualTitle}>Enter Manually</Text>
                      <Text style={styles.premScanManualDesc}>{'Use DEXA, InBody, or tape measurements\nEnter your numbers manually.'}</Text>
                    </View>
                    <Text style={styles.premScanManualChevron}>›</Text>
                  </TouchableOpacity>

                  {/* Trust badges */}
                  <View style={styles.premScanTrustRow}>
                    {[
                      { icon: '🔐', title: 'Your Data', sub: 'Always private\n& secure' },
                      { icon: '🤖', title: 'AI-Powered', sub: 'Advanced computer\nvision technology' },
                      { icon: '📈', title: 'Track Progress', sub: 'See real changes\nover time' },
                    ].map(b => (
                      <View key={b.title} style={styles.premScanTrustBadge}>
                        <Text style={styles.premScanTrustIcon}>{b.icon}</Text>
                        <Text style={styles.premScanTrustTitle}>{b.title}</Text>
                        <Text style={styles.premScanTrustSub}>{b.sub}</Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity style={styles.premScanSkipBtn} onPress={goNext} activeOpacity={0.8}>
                    <Text style={styles.premScanSkipText}>Skip</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* ── Manual entry ── */}
              {bodyScanMode === 'manual' && (
                <>
                  <TouchableOpacity onPress={() => setBodyScanMode(null)} style={styles.scanModeBack} activeOpacity={0.7}>
                    <Text style={styles.scanModeBackText}>← Back</Text>
                  </TouchableOpacity>

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

              {/* ── Camera mode — camera modal is open, show minimal placeholder ── */}
              {bodyScanMode === 'camera' && (
                <View style={{ alignItems: 'center', paddingTop: 80, paddingBottom: 40 }}>
                  <ActivityIndicator color={ORANGE} size="large" />
                  <Text style={[styles.scanCameraHint, { marginTop: 18, textAlign: 'center' }]}>
                    {'Camera is open\nFollow the on-screen countdown'}
                  </Text>
                </View>
              )}

              {/* ── Review Screen — show both photos + analyse / results ── */}
              {bodyScanMode === 'review' && (
                <>
                  <Text style={styles.reviewTitle}>Review Your Photos</Text>
                  <Text style={styles.reviewSub}>Make sure your full body is visible in both shots</Text>

                  {/* Photo pair */}
                  <View style={styles.reviewPhotoRow}>
                    <View style={styles.reviewPhotoCard}>
                      <Text style={styles.reviewPhotoLabel}>Front View</Text>
                      {scanFrontUri ? (
                        <Image source={{ uri: scanFrontUri }} style={styles.reviewPhoto} contentFit="cover" />
                      ) : (
                        <View style={[styles.reviewPhoto, styles.reviewPhotoEmpty]}>
                          <Text style={{ color: '#666', fontSize: 12 }}>No photo</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.reviewPhotoCard}>
                      <Text style={styles.reviewPhotoLabel}>Side View</Text>
                      {scanSideUri ? (
                        <Image source={{ uri: scanSideUri }} style={styles.reviewPhoto} contentFit="cover" />
                      ) : (
                        <View style={[styles.reviewPhoto, styles.reviewPhotoEmpty]}>
                          <Text style={{ color: '#666', fontSize: 12 }}>No photo</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* ── Pre-analysis quality failure (from capture retry exhaustion) ── */}
                  {(scanFrontBad || scanSideBad) && !scanning && !scanResult && !scanImageUnusable && (
                    <View style={styles.reviewBadWrap}>
                      <Text style={styles.reviewBadIcon}>⚠️</Text>
                      <Text style={styles.reviewBadTitle}>Photos Need Improvement</Text>
                      <Text style={styles.reviewBadMsg}>
                        {scanFrontBad && scanSideBad
                          ? 'Both photos are unclear. Make sure your full body is visible with good lighting.'
                          : scanFrontBad
                          ? 'Your front photo is unclear. Ensure your full body is visible with good lighting.'
                          : 'Your side photo is unclear. Ensure your full profile is visible.'}
                      </Text>
                      <TouchableOpacity
                        style={styles.reviewTryAgainBtn}
                        activeOpacity={0.8}
                        onPress={() => {
                          setScanFrontUri(null); setScanFrontBase64(''); setScanFrontBad(false);
                          setScanSideUri(null); setScanSideBase64(''); setScanSideBad(false);
                          setScanResult(null); setScanImageUnusable(false);
                          setBodyScanMode(null);
                        }}
                      >
                        <Text style={styles.reviewTryAgainText}>Try Again</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* ── Post-analysis: AI says images not usable ── */}
                  {scanImageUnusable && !scanning && (
                    <View style={styles.reviewBadWrap}>
                      <Text style={styles.reviewBadIcon}>📸</Text>
                      <Text style={styles.reviewBadTitle}>Images Not Clear Enough</Text>
                      <Text style={styles.reviewBadMsg}>
                        {'Your photos couldn\'t be used for an accurate body fat analysis.\n\nTips: good lighting, plain background, full body head-to-toe, form-fitting clothes.'}
                      </Text>
                      <TouchableOpacity
                        style={styles.reviewTryAgainBtn}
                        activeOpacity={0.8}
                        onPress={() => {
                          setScanFrontUri(null); setScanFrontBase64(''); setScanFrontBad(false);
                          setScanSideUri(null); setScanSideBase64(''); setScanSideBad(false);
                          setScanResult(null); setScanImageUnusable(false);
                          setBodyScanMode(null);
                        }}
                      >
                        <Text style={styles.reviewTryAgainText}>Try Again</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* ── Analyse button — shown when no errors, not yet analysed ── */}
                  {!scanFrontBad && !scanSideBad && !scanImageUnusable && !scanning && !scanResult && (
                    <TouchableOpacity style={styles.reviewAnalyseBtn} onPress={runBodyScan} activeOpacity={0.85}>
                      <Text style={styles.reviewAnalyseBtnText}>Analyse Body Scan</Text>
                    </TouchableOpacity>
                  )}

                  {/* ── Scanning spinner ── */}
                  {scanning && (
                    <View style={styles.reviewScanningRow}>
                      <ActivityIndicator color={ORANGE} size="large" />
                      <Text style={styles.reviewScanningText}>Analysing your photos…</Text>
                    </View>
                  )}

                  {/* ── Results ── */}
                  {scanResult && !scanning && (
                    <>
                      <View style={styles.scanResultCard}>
                        <Text style={styles.scanResultTitle}>Progress Scan Estimate</Text>
                        <View style={styles.scanResultRow}>
                          <View style={styles.scanResultItem}>
                            <Text style={styles.scanResultValue}>{scanResult.bodyFatLow}–{scanResult.bodyFatHigh}%</Text>
                            <Text style={styles.scanResultLabel}>Body Fat Range</Text>
                          </View>
                          <View style={styles.scanResultDivider} />
                          <View style={styles.scanResultItem}>
                            <Text style={styles.scanResultValue}>{scanResult.bodyType}</Text>
                            <Text style={styles.scanResultLabel}>Body Type</Text>
                          </View>
                          <View style={styles.scanResultDivider} />
                          <View style={styles.scanResultItem}>
                            <Text style={styles.scanResultValue}>{scanResult.muscleMass}</Text>
                            <Text style={styles.scanResultLabel}>Muscle</Text>
                          </View>
                        </View>
                        <View style={styles.scanInsightCard}>
                          <Text style={styles.scanInsightLabel}>Confidence: {scanResult.confidence}</Text>
                          <Text style={styles.scanInsightText}>{scanResult.assessment}</Text>
                          <Text style={styles.scanInsightText}>{scanResult.nutritionFocus}</Text>
                        </View>
                        <Text style={styles.scanDisclaimer}>Use this for trend tracking, not diagnosis. For precise body composition, use DEXA or a clinical assessment.</Text>
                      </View>

                      {/* Continue to next step */}
                      <TouchableOpacity style={styles.reviewContinueBtn} onPress={goNext} activeOpacity={0.85}>
                        <Text style={styles.reviewContinueBtnText}>Continue</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Retake link — only shown before analysis */}
                  {!scanning && !scanResult && !scanImageUnusable && (
                    <TouchableOpacity
                      style={{ marginTop: 16, alignSelf: 'center' }}
                      activeOpacity={0.7}
                      onPress={() => {
                        setScanFrontUri(null); setScanFrontBase64(''); setScanFrontBad(false);
                        setScanSideUri(null); setScanSideBase64(''); setScanSideBad(false);
                        setScanResult(null); setScanImageUnusable(false);
                        setBodyScanMode(null);
                      }}
                    >
                      <Text style={styles.reviewRetakeLink}>← Retake Photos</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
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

      {/* ── Pre-camera instruction carousel (Zing-style) ── */}
      <Modal
        visible={scanInstructionPose !== null}
        animationType="slide"
        onRequestClose={() => { setScanInstructionPose(null); setInstrSlide(0); }}
      >
        <View style={styles.instrCarouselWrap}>
          {/* Fixed header */}
          <View style={styles.instrCarouselHeader}>
            <Text style={styles.instrCarouselTitle}>How It Works</Text>
            <TouchableOpacity
              style={styles.instrCarouselClose}
              onPress={() => { setScanInstructionPose(null); setInstrSlide(0); }}
              activeOpacity={0.8}
            >
              <Text style={styles.instrCarouselCloseIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Paginated slides */}
          <ScrollView
            ref={instrScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => {
              setInstrSlide(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W));
            }}
            style={{ flex: 1 }}
          >
            {/* Slide 0: How to Stand / Turn */}
            <View style={[styles.instrSlide, { width: SCREEN_W }]}>
              <View style={styles.instrPosePreview}>
                <BodyOutline
                  pose={scanInstructionPose ?? 'front'}
                  gender={gender}
                  color="#FFFFFF"
                  opacity={0.85}
                  height={240}
                />
              </View>
              <View style={styles.instrAnnotations}>
                {(scanInstructionPose === 'front' ? [
                  'Look straight ahead',
                  'Spread arms slightly (A-pose)',
                  'Keep feet shoulder-width apart',
                ] : [
                  'Turn 90° so your full side faces the camera',
                  'Arms relaxed at your sides',
                  'Stand tall — head to toe must be visible',
                ]).map((tip, i) => (
                  <View key={i} style={styles.instrAnnotationRow}>
                    <View style={styles.instrAnnotationDot} />
                    <Text style={styles.instrAnnotationText}>{tip}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.instrSlideTitle}>
                {scanInstructionPose === 'front' ? 'How to Stand' : 'How to Turn'}
              </Text>
              <Text style={styles.instrSlideSubtitle}>
                {scanInstructionPose === 'front'
                  ? 'Keep hands and feet within the frame'
                  : 'Show your full body profile from head to toe'}
              </Text>
            </View>

            {/* Slide 1: Clothing */}
            <View style={[styles.instrSlide, { width: SCREEN_W }]}>
              <View style={styles.instrCompareRow}>
                <View style={styles.instrCompareCol}>
                  <View style={[styles.instrCompareCard, styles.instrCompareCardGood]}>
                    {instrImages.clothingGood
                      ? <Image source={{ uri: instrImages.clothingGood }} style={styles.instrCompareImg} contentFit="cover" />
                      : <View style={styles.instrCompareImgLoading}><ActivityIndicator color="rgba(255,255,255,0.35)" /></View>}
                    <View style={styles.instrBadgeGood}><Text style={styles.instrBadgeText}>✓</Text></View>
                  </View>
                  <Text style={styles.instrCompareLabelText}>Minimal clothing</Text>
                </View>
                <View style={styles.instrCompareCol}>
                  <View style={[styles.instrCompareCard, styles.instrCompareCardBad]}>
                    {instrImages.clothingBad
                      ? <Image source={{ uri: instrImages.clothingBad }} style={styles.instrCompareImg} contentFit="cover" />
                      : <View style={styles.instrCompareImgLoading}><ActivityIndicator color="rgba(255,255,255,0.35)" /></View>}
                    <View style={styles.instrBadgeBad}><Text style={styles.instrBadgeText}>✕</Text></View>
                  </View>
                  <Text style={styles.instrCompareLabelText}>Baggy clothing</Text>
                </View>
              </View>
              <Text style={styles.instrSlideTitle}>Clothing</Text>
              <Text style={styles.instrSlideSubtitle}>Remove your shirt or wear form-fitting attire that provides a clear outline of your body shape. Avoid loose or baggy clothing.</Text>
            </View>

            {/* Slide 2: Lighting */}
            <View style={[styles.instrSlide, { width: SCREEN_W }]}>
              <View style={styles.instrCompareRow}>
                <View style={styles.instrCompareCol}>
                  <View style={[styles.instrCompareCard, styles.instrCompareCardGood]}>
                    {instrImages.lightingGood
                      ? <Image source={{ uri: instrImages.lightingGood }} style={styles.instrCompareImg} contentFit="cover" />
                      : <View style={styles.instrCompareImgLoading}><ActivityIndicator color="rgba(255,255,255,0.35)" /></View>}
                    <View style={styles.instrBadgeGood}><Text style={styles.instrBadgeText}>✓</Text></View>
                  </View>
                  <Text style={styles.instrCompareLabelText}>Well-lit</Text>
                </View>
                <View style={styles.instrCompareCol}>
                  <View style={[styles.instrCompareCard, styles.instrCompareCardBad]}>
                    {instrImages.lightingBad
                      ? <Image source={{ uri: instrImages.lightingBad }} style={styles.instrCompareImg} contentFit="cover" />
                      : <View style={styles.instrCompareImgLoading}><ActivityIndicator color="rgba(255,255,255,0.35)" /></View>}
                    <View style={styles.instrBadgeBad}><Text style={styles.instrBadgeText}>✕</Text></View>
                  </View>
                  <Text style={styles.instrCompareLabelText}>Dark / shadows</Text>
                </View>
              </View>
              <Text style={styles.instrSlideTitle}>Lighting</Text>
              <Text style={styles.instrSlideSubtitle}>Ensure your photo is well-lit. Natural, bright light is ideal. Avoid obscuring details with dark shadows or uneven lighting.</Text>
            </View>

            {/* Slide 3: Background */}
            <View style={[styles.instrSlide, { width: SCREEN_W }]}>
              <View style={styles.instrCompareRow}>
                <View style={styles.instrCompareCol}>
                  <View style={[styles.instrCompareCard, styles.instrCompareCardGood]}>
                    {instrImages.backgroundGood
                      ? <Image source={{ uri: instrImages.backgroundGood }} style={styles.instrCompareImg} contentFit="cover" />
                      : <View style={styles.instrCompareImgLoading}><ActivityIndicator color="rgba(255,255,255,0.35)" /></View>}
                    <View style={styles.instrBadgeGood}><Text style={styles.instrBadgeText}>✓</Text></View>
                  </View>
                  <Text style={styles.instrCompareLabelText}>Plain wall</Text>
                </View>
                <View style={styles.instrCompareCol}>
                  <View style={[styles.instrCompareCard, styles.instrCompareCardBad]}>
                    {instrImages.backgroundBad
                      ? <Image source={{ uri: instrImages.backgroundBad }} style={styles.instrCompareImg} contentFit="cover" />
                      : <View style={styles.instrCompareImgLoading}><ActivityIndicator color="rgba(255,255,255,0.35)" /></View>}
                    <View style={styles.instrBadgeBad}><Text style={styles.instrBadgeText}>✕</Text></View>
                  </View>
                  <Text style={styles.instrCompareLabelText}>Cluttered room</Text>
                </View>
              </View>
              <Text style={styles.instrSlideTitle}>Background</Text>
              <Text style={styles.instrSlideSubtitle}>Choose a plain, uncluttered background like a neutral-colored wall. Avoid busy patterns or objects that might interfere with the analysis.</Text>
            </View>

            {/* Slide 4: Distance & Framing */}
            <View style={[styles.instrSlide, { width: SCREEN_W }]}>
              <View style={styles.instrCompareRow}>
                <View style={styles.instrCompareCol}>
                  <View style={[styles.instrCompareCard, styles.instrCompareCardGood]}>
                    {instrImages.distanceGood
                      ? <Image source={{ uri: instrImages.distanceGood }} style={styles.instrCompareImg} contentFit="cover" />
                      : <View style={styles.instrCompareImgLoading}><ActivityIndicator color="rgba(255,255,255,0.35)" /></View>}
                    <View style={styles.instrBadgeGood}><Text style={styles.instrBadgeText}>✓</Text></View>
                  </View>
                  <Text style={styles.instrCompareLabelText}>Full body in frame</Text>
                </View>
                <View style={styles.instrCompareCol}>
                  <View style={[styles.instrCompareCard, styles.instrCompareCardBad]}>
                    {instrImages.distanceBad
                      ? <Image source={{ uri: instrImages.distanceBad }} style={styles.instrCompareImg} contentFit="cover" />
                      : <View style={styles.instrCompareImgLoading}><ActivityIndicator color="rgba(255,255,255,0.35)" /></View>}
                    <View style={styles.instrBadgeBad}><Text style={styles.instrBadgeText}>✕</Text></View>
                  </View>
                  <Text style={styles.instrCompareLabelText}>Too close — cropped</Text>
                </View>
              </View>
              <Text style={styles.instrSlideTitle}>Distance & Framing</Text>
              <Text style={styles.instrSlideSubtitle}>Stand 6–8 feet away from the camera. Ensure your full body from head to toe is in frame for accurate analysis.</Text>
            </View>

            {/* Slide 5: Volume */}
            <View style={[styles.instrSlide, { width: SCREEN_W }]}>
              <View style={styles.instrVolumeBox}>
                <Text style={styles.instrVolumeIcon}>🔊</Text>
              </View>
              <Text style={styles.instrSlideTitle}>Turn Up Your Volume</Text>
              <Text style={styles.instrSlideSubtitle}>Ensure your phone volume is high enough for you to hear the audio guidance during the scan.</Text>
            </View>
          </ScrollView>

          {/* Pagination dots */}
          <View style={styles.instrDotsRow}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={[styles.instrDot, instrSlide === i && styles.instrDotActive]} />
            ))}
          </View>

          {/* Next / Start button */}
          <View style={styles.instrFooter}>
            <TouchableOpacity
              style={styles.instrNextBtn}
              activeOpacity={0.85}
              onPress={() => {
                if (instrSlide < 5) {
                  const next = instrSlide + 1;
                  instrScrollRef.current?.scrollTo({ x: SCREEN_W * next, animated: true });
                  setInstrSlide(next);
                } else {
                  const pose = scanInstructionPose!;
                  setScanInstructionPose(null);
                  setInstrSlide(0);
                  setTimeout(() => openGuidedBodyScan(pose), 300);
                }
              }}
            >
              <Text style={styles.instrNextBtnText}>
                {instrSlide < 5 ? 'Next' : (scanInstructionPose === 'front' ? 'Start Front Scan' : 'Start Side Scan')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={scanCameraOpen} animationType="slide" statusBarTranslucent onRequestClose={() => { Speech.stop(); setScanCameraOpen(false); setHoldingStill(false); setCapturing(false); }}>
        <View style={styles.bodyCameraWrap}>
          <CameraView ref={scanCameraRef} style={styles.bodyCamera} facing="front" mute onCameraReady={() => setScanCameraReady(true)} />

          <View style={styles.bodyCameraOverlay}>

            {/* ── X close button ── */}
            <TouchableOpacity
              style={styles.scanExitBtn}
              activeOpacity={0.75}
              onPress={() => {
                Speech.stop();
                setScanCameraOpen(false);
                setHoldingStill(false);
                setCapturing(false);
                setPhotoReady(false);
                setBodyScanMode(null);
              }}
            >
              <Text style={styles.scanExitIcon}>✕</Text>
            </TouchableOpacity>

            {/* ── Header ── */}
            <View style={styles.scanHdrWrap}>
              <Text style={styles.scanHdrTitle}>{scanPose === 'front' ? 'Front View' : 'Side View'}</Text>
              <Text style={styles.scanHdrSub}>
                {scanPose === 'front'
                  ? 'Stand straight, full body visible, good lighting.'
                  : 'Turn 90° and show your full profile head-to-toe.'}
              </Text>
              <View style={styles.scanHdrPrivacyRow}>
                <Text style={styles.scanHdrPrivacyCheck}>✓</Text>
                <Text style={styles.scanHdrPrivacyText}>Photos stay on your device</Text>
              </View>
            </View>

            {/* ── Tips columns + outline ── */}
            <View style={styles.scanTipOutlineRow}>

              {/* Left tips */}
              <View style={styles.scanTipCol}>
                {(scanPose === 'front' ? [
                  { icon: '🧍', label: 'Stand\nstraight' },
                  { icon: '☀️', label: 'Good\nlighting' },
                  { icon: '👣', label: 'Feet\nshouldr\nwidth' },
                ] : [
                  { icon: '↩️', label: 'Turn\n90°' },
                  { icon: '☀️', label: 'Good\nlighting' },
                  { icon: '👤', label: 'Full\nprofile' },
                ]).map(t => (
                  <View key={t.label} style={styles.scanTipItem}>
                    <View style={styles.scanTipCircle}><Text style={styles.scanTipIconTxt}>{t.icon}</Text></View>
                    <Text style={styles.scanTipLabel}>{t.label}</Text>
                  </View>
                ))}
              </View>

              {/* Outline center */}
              <View style={styles.scanOutlineCenter}>
                {/* Orange corner brackets */}
                <View style={[styles.scanCornerBracket, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 }]} />
                <View style={[styles.scanCornerBracket, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 }]} />
                <View style={[styles.scanCornerBracket, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 }]} />
                <View style={[styles.scanCornerBracket, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 }]} />

                {!photoReady && (
                  <View style={styles.outlineGlowWrap}>
                    <BodyOutline pose={scanPose} gender={gender} color="#E85D26" opacity={0.9} height={460} />
                  </View>
                )}

                {/* Countdown badge */}
                {!photoReady && !capturing && !scanPhotoAssessing && (
                  <View style={styles.scanTimerBadge}>
                    <Text style={styles.scanTimerNum}>{scanTimer}</Text>
                    <Text style={styles.scanTimerSec}>sec</Text>
                  </View>
                )}

                {/* Captured badge */}
                {photoReady && (
                  <View style={styles.outlineCapturedBadge}>
                    <Text style={styles.outlineCapturedIcon}>✓</Text>
                    <Text style={styles.outlineCapturedText}>{scanPose === 'front' ? 'Front captured!' : 'Side captured!'}</Text>
                    {scanPose === 'front' && <Text style={styles.outlineCapturedSub}>Preparing side view…</Text>}
                  </View>
                )}

                {/* Capturing / checking spinner */}
                {(capturing || scanPhotoAssessing) && !photoReady && (
                  <View style={styles.outlineHoldWrap}>
                    <ActivityIndicator color="#E85D26" size="large" />
                    <Text style={styles.outlineHoldText}>{scanPhotoAssessing ? 'Checking photo…' : 'Capturing…'}</Text>
                    {!!scanPhotoFeedback && captureAttempts < 3 && (
                      <Text style={styles.outlineRetakeText}>Retaking… {scanPhotoFeedback}</Text>
                    )}
                  </View>
                )}
              </View>

              {/* Right tips */}
              <View style={styles.scanTipCol}>
                {(scanPose === 'front' ? [
                  { icon: '👁️', label: 'Look\nstraight' },
                  { icon: '👕', label: 'Shirt\noff' },
                  { icon: '⛶', label: 'Full body\nin frame' },
                ] : [
                  { icon: '👁️', label: 'Head\nstraight' },
                  { icon: '👕', label: 'Shirt\noff' },
                  { icon: '⛶', label: 'Head to\ntoe visible' },
                ]).map(t => (
                  <View key={t.label} style={styles.scanTipItem}>
                    <View style={styles.scanTipCircle}><Text style={styles.scanTipIconTxt}>{t.icon}</Text></View>
                    <Text style={styles.scanTipLabel}>{t.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Bottom bar: Gallery | Capture ── */}
            <View style={styles.scanBottomBar}>
              <TouchableOpacity
                style={styles.scanBottomSide}
                onPress={() => uploadBodyPhoto(scanPose)}
                activeOpacity={0.75}
                disabled={!!(capturing || scanPhotoAssessing || uploadingPose !== null)}
              >
                <View style={styles.scanBottomCircle}>
                  {uploadingPose === scanPose
                    ? <ActivityIndicator color="#FFFFFF" size="small" />
                    : <Text style={styles.scanBottomSideIcon}>🖼️</Text>}
                </View>
                <Text style={styles.scanBottomSideLabel}>Gallery</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.scanNewCaptureBtn, (capturing || scanPhotoAssessing || photoReady) && { opacity: 0.4 }]}
                onPress={captureGuidedBodyPhoto}
                activeOpacity={0.8}
                disabled={!!(capturing || scanPhotoAssessing || photoReady)}
              >
                <View style={styles.scanNewCaptureBtnInner} />
              </TouchableOpacity>

              {/* Spacer to keep capture button centred */}
              <View style={{ width: 64 }} />
            </View>

          </View>
        </View>
      </Modal>

      {/* Next button (not shown on results or body-fat selection) */}
      {step !== 'results' && !(step === 'body_fat' && (bodyScanMode === null || bodyScanMode === 'camera' || bodyScanMode === 'review')) && (
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

  // Body scan styles
  scanSection: { marginTop: 24 },
  scanDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  scanDividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.10)' },
  scanDividerText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.40)' },
  scanHint: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  sampleCard: { backgroundColor: SURFACE, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 12, marginBottom: 14, alignItems: 'center' },
  sampleTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', marginBottom: 10 },
  sampleImg: { width: 140, height: 200, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)' },
  samplePlaceholder: { width: 140, height: 200, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 14 },
  sampleIcon: { fontSize: 44 },
  samplePlaceholderText: { fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 16 },
  scanPhotoCardLocked: { opacity: 0.5 },
  scanPhotoRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  scanPhotoCard: {
    flex: 1,
    height: 140,
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    gap: 4,
  },
  scanPhotoImg: { width: '100%', height: '100%', borderRadius: 14 },
  scanPhotoIcon: { fontSize: 28 },
  scanPhotoLabel: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  scanPhotoRequired: { fontSize: 10, fontWeight: '700', color: ORANGE },
  scanPhotoOptional: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.35)' },
  scanTips: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  scanTipText: { fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  scanBtn: {
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 4 },
    }),
  },
  scanBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  scanLoadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  scanLoadingText: { fontSize: 14, color: 'rgba(255,255,255,0.55)' },
  scanResultCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 8,
    gap: 12,
  },
  scanResultTitle: { fontSize: 14, fontWeight: '800', color: ORANGE, textAlign: 'center', letterSpacing: 1 },
  scanResultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  scanResultItem: { alignItems: 'center', flex: 1 },
  scanResultValue: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  scanResultLabel: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3 },
  scanResultDivider: { width: 1, height: 30, backgroundColor: BORDER },
  scanInsightCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  scanInsightLabel: { fontSize: 12, fontWeight: '800', color: ORANGE, textTransform: 'uppercase' },
  scanInsightText: { fontSize: 12, color: 'rgba(255,255,255,0.68)', lineHeight: 18 },
  scanDisclaimer: { fontSize: 10, color: 'rgba(255,255,255,0.30)', textAlign: 'center', lineHeight: 16 },
  scanRetakeText: { fontSize: 12, fontWeight: '600', color: ORANGE, textAlign: 'center', textDecorationLine: 'underline' },
  bodyCameraWrap: { flex: 1, backgroundColor: '#000' },
  bodyCamera: { flex: 1 },
  bodyCameraOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  bodyCameraTitle: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 64 : 42,
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bodyGuide: { width: '58%', height: '66%', alignItems: 'center', justifyContent: 'center' },
  bodyGuideHead: { width: 54, height: 64, borderRadius: 28, borderWidth: 3, borderColor: 'rgba(255,255,255,0.86)', marginBottom: 10 },
  bodyGuideShoulders: { width: '86%', height: 58, borderTopWidth: 3, borderLeftWidth: 3, borderRightWidth: 3, borderColor: 'rgba(255,255,255,0.86)', borderTopLeftRadius: 48, borderTopRightRadius: 48 },
  bodyGuideTorso: { width: '58%', height: '34%', borderLeftWidth: 3, borderRightWidth: 3, borderColor: 'rgba(255,255,255,0.86)' },
  bodyGuideLegs: { width: '48%', height: '28%', borderLeftWidth: 3, borderRightWidth: 3, borderBottomWidth: 3, borderColor: 'rgba(255,255,255,0.86)', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  bodyCountdownBadge: {
    position: 'absolute',
    bottom: 156,
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(143,58,31,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  bodyCountdownText: { color: '#FFFFFF', fontSize: 34, fontWeight: '900' },
  bodyQualityBadge: {
    position: 'absolute',
    bottom: 156,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(13,11,9,0.82)',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  bodyQualityText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  bodyLooksGoodBtn: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 92,
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  bodyLooksGoodText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  bodyCameraHint: {
    position: 'absolute',
    bottom: 142,
    left: 24,
    right: 24,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bodyCameraClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 36,
    right: 18,
    backgroundColor: 'rgba(0,0,0,0.58)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  bodyCameraCloseText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

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

  // Two-option body scan selection
  scanModeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 14,
    gap: 14,
  },
  scanModeCardHighlight: {
    borderColor: ORANGE,
    backgroundColor: 'rgba(143,58,31,0.12)',
  },
  scanModeIcon: { fontSize: 32 },
  scanModeText: { flex: 1 },
  scanModeTitle: { fontSize: 17, fontWeight: '800', color: 'rgba(255,255,255,0.75)', marginBottom: 4 },
  scanModeDesc: { fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 18 },
  scanModeArrow: { fontSize: 26, color: 'rgba(255,255,255,0.30)', fontWeight: '300' },
  scanModeBack: { marginBottom: 20 },
  scanModeBackText: { fontSize: 14, color: 'rgba(255,255,255,0.50)', fontWeight: '600' },

  // Premium body-scan mode selection
  premScanHero: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 22, marginTop: -4 },
  premScanHeroText: { flex: 1, paddingRight: 10 },
  premScanHeroTitle: { fontSize: 26, fontWeight: '900', color: '#FFFFFF', lineHeight: 32, marginBottom: 10 },
  premScanHeroAccent: { color: '#E85D26' },
  premScanHeroSub: { fontSize: 13, color: 'rgba(255,255,255,0.52)', lineHeight: 18 },
  premScanBodyVis: {
    width: 70, height: 70,
    backgroundColor: 'rgba(232,93,38,0.12)',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.28)',
  },
  premScanBodyVisEmoji: { fontSize: 36 },

  premScanAIImageCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#E85D26',
    ...Platform.select({
      ios: { shadowColor: '#E85D26', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 14 },
      android: { elevation: 10 },
    }),
  },
  premScanAIImage: { width: '100%', height: 280 },

  premScanManualCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E85D26',
    padding: 15,
    marginBottom: 18,
    gap: 12,
  },
  premScanManualIconBox: {
    width: 40, height: 40,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premScanManualIconEmoji: { fontSize: 20 },
  premScanManualText: { flex: 1 },
  premScanManualTitle: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.82)', marginBottom: 3 },
  premScanManualDesc: { fontSize: 12, color: 'rgba(255,255,255,0.38)', lineHeight: 17 },
  premScanManualChevron: { fontSize: 22, color: 'rgba(255,255,255,0.22)', fontWeight: '300' },

  premScanTrustRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  premScanTrustBadge: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 10,
    alignItems: 'center',
  },
  premScanTrustIcon: { fontSize: 18, marginBottom: 4 },
  premScanTrustTitle: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.72)', textAlign: 'center', marginBottom: 3 },
  premScanTrustSub: { fontSize: 9, color: 'rgba(255,255,255,0.38)', textAlign: 'center', lineHeight: 13 },

  premScanCTA: {
    backgroundColor: '#E85D26',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#E85D26', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  premScanCTAText: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.4 },
  premScanSkipBtn: {
    backgroundColor: '#E85D26',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  premScanSkipText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },

  // Camera capture cards
  scanCameraHint: { fontSize: 14, color: 'rgba(255,255,255,0.50)', lineHeight: 20, marginBottom: 20, textAlign: 'center' },
  scanCameraCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 14,
  },
  scanCameraCardLocked: { opacity: 0.45 },
  scanCameraCardBad: { borderWidth: 1.5, borderColor: '#FF9500' },
  scanCameraCardWarn: { fontSize: 13, fontWeight: '700', color: '#FF9500' },
  scanCameraBadBanner: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,90,0,0.82)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  scanCameraBadText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  scanCameraCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  scanCameraCardLabel: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  scanCameraCardDone: { fontSize: 13, fontWeight: '700', color: '#34C759' },
  scanCameraCardLockedLabel: { fontSize: 12, color: 'rgba(255,255,255,0.40)' },
  scanCameraPlaceholder: { alignItems: 'center', paddingVertical: 20, gap: 14 },
  scanCameraCheckingText: { fontSize: 13, color: 'rgba(255,255,255,0.50)', marginTop: 6 },
  scanCameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 4 },
    }),
  },
  scanCameraBtnIcon: { fontSize: 20 },
  scanCameraBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  scanCameraLibraryText: { fontSize: 13, color: 'rgba(255,255,255,0.38)', fontWeight: '600', textDecorationLine: 'underline' },
  scanCameraPreviewWrap: { position: 'relative', backgroundColor: '#000', borderRadius: 12 },
  scanCameraPreview: { width: '100%', height: 380, borderRadius: 12 },
  scanCameraRetake: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  scanCameraRetakeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // ── Instruction carousel ──
  instrCarouselWrap: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  instrCarouselHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 58 : 36,
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  instrCarouselTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  instrCarouselClose: {
    position: 'absolute',
    right: 20,
    top: Platform.OS === 'ios' ? 54 : 32,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  instrCarouselCloseIcon: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  instrSlide: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    alignItems: 'center',
  },
  instrPosePreview: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 18,
    alignItems: 'center',
    width: '100%',
  },
  instrAnnotations: { width: '100%', gap: 12, marginBottom: 20 },
  instrAnnotationRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  instrAnnotationDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#C6F135',
    flexShrink: 0,
  },
  instrAnnotationText: {
    fontSize: 15, fontWeight: '600',
    color: 'rgba(255,255,255,0.80)',
    flex: 1,
  },

  instrCompareRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 20,
    width: '100%',
  },
  instrCompareCol: {
    flex: 1,
    gap: 8,
    alignItems: 'center',
  },
  instrCompareCard: {
    width: '100%',
    height: 220,
    borderRadius: 20,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  instrCompareCardGood: { borderColor: '#34C759' },
  instrCompareCardBad: { borderColor: '#FF3B30' },
  instrCompareImg: { width: '100%', height: '100%' },
  instrCompareImgLoading: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  instrCompareLabelText: {
    fontSize: 12, fontWeight: '700',
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },
  instrBadgeGood: {
    position: 'absolute', bottom: 10, right: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#34C759',
    alignItems: 'center', justifyContent: 'center',
  },
  instrBadgeBad: {
    position: 'absolute', bottom: 10, right: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FF3B30',
    alignItems: 'center', justifyContent: 'center',
  },
  instrBadgeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },

  instrVolumeBox: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  instrVolumeIcon: { fontSize: 72 },

  instrSlideTitle: {
    fontSize: 22, fontWeight: '900', color: '#FFFFFF',
    textAlign: 'center',
    fontFamily: PLAYFAIR,
    marginBottom: 10,
  },
  instrSlideSubtitle: {
    fontSize: 15, color: 'rgba(255,255,255,0.50)',
    textAlign: 'center', lineHeight: 22,
  },

  instrDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  instrDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  instrDotActive: {
    width: 22, height: 6, borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },

  instrFooter: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
  },
  instrNextBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
  },
  instrNextBtnText: { color: '#0F0F0F', fontSize: 17, fontWeight: '900' },

  // ── Camera bottom instruction bar (Zing-style) ──
  outlineInstrBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 36 : 22,
    paddingTop: 18,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  outlineInstrBarLime: { backgroundColor: '#C6F135' },
  outlineInstrBarDark: { backgroundColor: 'rgba(0,0,0,0.76)' },
  outlineInstrIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  outlineInstrIconDark: { backgroundColor: '#1A1A1A' },
  outlineInstrIconLight: { backgroundColor: 'rgba(255,255,255,0.18)' },
  outlineInstrIconText: { fontSize: 20, fontWeight: '900', color: '#FFFFFF' },
  outlineInstrBarText: {
    flex: 1, fontSize: 16, fontWeight: '800', lineHeight: 22,
  },

  // Outline-guided capture overlay
  outlineHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 64 : 42,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  outlinePoseLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  outlineSubLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 3,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  outlineGlowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  outlineScoreWrap: {
    position: 'absolute',
    bottom: 144,
    left: 28,
    right: 28,
    alignItems: 'center',
    gap: 8,
  },
  outlineScoreTrack: {
    width: '100%',
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  outlineScoreFill: { height: '100%', borderRadius: 3 },
  outlineScoreText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  outlineHoldWrap: {
    position: 'absolute',
    bottom: 144,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  outlineHoldText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#34C759',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  outlineMovedText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FF3B30',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  outlineCountdownRow: { flexDirection: 'row', gap: 10 },
  outlineCountdownDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  outlineCountdownDotFilled: { backgroundColor: '#34C759' },
  outlineCountdownNum: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  outlineCapturedBadge: {
    alignItems: 'center',
    gap: 8,
  },
  outlineCapturedIcon: {
    fontSize: 56,
    color: '#34C759',
  },
  outlineCapturedText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#34C759',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  outlineCapturedSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  outlineRetakeText: {
    fontSize: 13,
    color: '#FFD60A',
    textAlign: 'center',
    paddingHorizontal: 24,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  visionScanIndicator: {
    position: 'absolute',
    bottom: 130,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.50)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  visionScanText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.70)',
    fontWeight: '500',
  },

  // New camera screen layout
  scanHdrWrap: { alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingHorizontal: 16, paddingBottom: 8 },
  scanHdrTitle: { fontSize: 30, fontWeight: '900', color: '#FFFFFF', marginBottom: 6, letterSpacing: -0.5 },
  scanHdrSub: { fontSize: 13, color: 'rgba(255,255,255,0.62)', textAlign: 'center', lineHeight: 19, marginBottom: 8 },
  scanHdrPrivacyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  scanHdrPrivacyCheck: { fontSize: 14, color: '#34C759', fontWeight: '900' },
  scanHdrPrivacyText: { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },

  scanTipOutlineRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  scanTipCol: { width: 78, alignItems: 'center', justifyContent: 'space-around', alignSelf: 'stretch', paddingVertical: 16 },
  scanTipItem: { alignItems: 'center', gap: 5 },
  scanTipCircle: {
    width: 50, height: 50, borderRadius: 25,
    borderWidth: 1.5, borderColor: 'rgba(232,93,38,0.55)',
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  scanTipIconTxt: { fontSize: 20 },
  scanTipLabel: { fontSize: 10, color: 'rgba(255,255,255,0.72)', textAlign: 'center', lineHeight: 14 },

  // X exit button — top right corner of camera screen
  scanExitBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    right: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  scanExitIcon: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  // Full-width outline area (no tip columns)
  scanOutlineFull: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', position: 'relative' },

  scanOutlineCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanCornerBracket: { position: 'absolute', width: 22, height: 22, borderColor: '#E85D26' },
  scanTimerBadge: {
    position: 'absolute',
    bottom: 16,
    width: 56, height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: '#E85D26',
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTimerNum: { fontSize: 20, fontWeight: '900', color: '#E85D26', lineHeight: 22 },
  scanTimerSec: { fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

  scanBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 12,
  },
  scanBottomSide: { alignItems: 'center', gap: 5, width: 64 },
  scanBottomCircle: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  scanBottomSideIcon: { fontSize: 22 },
  scanBottomSideLabel: { fontSize: 12, color: 'rgba(255,255,255,0.68)', fontWeight: '500' },
  scanNewCaptureBtn: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 3, borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  scanNewCaptureBtnGreen: { borderColor: '#34C759' },
  scanNewCaptureBtnInner: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#FFFFFF',
  },

  bodyCaptureBtn: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 136 : 120,
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyCaptureBtnInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
  },
  bodyCaptureTapHint: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 106 : 92,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ── Review screen ──
  reviewTitle: {
    fontSize: 26, fontWeight: '900', color: '#FFFFFF',
    textAlign: 'center', marginBottom: 6,
    fontFamily: PLAYFAIR,
  },
  reviewSub: {
    fontSize: 14, color: 'rgba(255,255,255,0.50)',
    textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },
  reviewPhotoRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 24,
    width: '100%',
  },
  reviewPhotoCard: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  reviewPhotoLabel: {
    fontSize: 13, fontWeight: '800',
    color: 'rgba(255,255,255,0.70)',
    textTransform: 'uppercase', letterSpacing: 1,
  },
  reviewPhoto: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  reviewPhotoEmpty: {
    alignItems: 'center', justifyContent: 'center',
  },
  reviewBadWrap: {
    width: '100%',
    backgroundColor: 'rgba(255,59,48,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.40)',
    borderRadius: 20,
    alignItems: 'center',
    padding: 22,
    marginBottom: 20,
    gap: 8,
  },
  reviewBadIcon: { fontSize: 36 },
  reviewBadTitle: {
    fontSize: 18, fontWeight: '900', color: '#FF3B30',
  },
  reviewBadMsg: {
    fontSize: 14, color: 'rgba(255,255,255,0.62)',
    textAlign: 'center', lineHeight: 20,
  },
  reviewTryAgainBtn: {
    marginTop: 8,
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 36,
  },
  reviewTryAgainText: {
    fontSize: 16, fontWeight: '900', color: '#FFFFFF',
  },
  reviewAnalyseBtn: {
    width: '100%',
    backgroundColor: ORANGE,
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  reviewAnalyseBtnText: {
    fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.3,
  },
  reviewScanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 20,
  },
  reviewScanningText: {
    fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.70)',
  },
  reviewContinueBtn: {
    width: '100%',
    backgroundColor: ORANGE,
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  reviewContinueBtnText: {
    fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.3,
  },
  reviewRetakeLink: {
    fontSize: 14, fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    textDecorationLine: 'underline',
  },
});
