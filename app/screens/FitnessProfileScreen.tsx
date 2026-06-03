/**
 * FitnessProfileScreen.tsx — SpiceStrong
 * Collects user fitness data to calculate daily calorie/macro targets.
 * Step-by-step flow: Goal → Gender → Age → Height → Weight → Target Weight → Body Fat → Activity Level → Results
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { CameraView, useCameraPermissions } from 'expo-camera';
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

  // Body scan state
  const [scanFrontUri, setScanFrontUri] = useState<string | null>(null);
  const [scanSideUri, setScanSideUri] = useState<string | null>(null);
  const [scanFrontBase64, setScanFrontBase64] = useState<string>('');
  const [scanSideBase64, setScanSideBase64] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    bodyFat: number;
    bodyFatLow: number;
    bodyFatHigh: number;
    bodyType: string;
    muscleMass: string;
    confidence: 'low' | 'medium' | 'high';
    assessment: string;
    nutritionFocus: string;
  } | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scanCameraRef = useRef<any>(null);
  const [scanCameraOpen, setScanCameraOpen] = useState(false);
  const [scanCameraReady, setScanCameraReady] = useState(false);
  const [scanPose, setScanPose] = useState<'front' | 'side'>('front');
  const [scanCountdown, setScanCountdown] = useState(5);
  const [scanCountdownActive, setScanCountdownActive] = useState(false);
  const [scanPhotoAssessing, setScanPhotoAssessing] = useState(false);
  const [scanPhotoFeedback, setScanPhotoFeedback] = useState('');
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

  const calculateAndSave = async () => {
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

    const profile: FitnessProfile = {
      goal,
      gender,
      age: parseInt(age) || 30,
      heightCm: hCm,
      weightKg: wKg,
      targetWeightKg: twKg,
      bodyFatPercent: bodyFat ? parseFloat(bodyFat) : undefined,
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

  // ── Body scan handlers ──
  const openGuidedBodyScan = async (side: 'front' | 'side' = 'front') => {
    const perm = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!perm?.granted) {
      Alert.alert('Permission needed', 'Camera access is required for the guided body scan.');
      return;
    }
    setScanPose(side);
    setScanCountdown(5);
    setScanCameraReady(false);
    setScanCountdownActive(false);
    setScanPhotoAssessing(false);
    setScanPhotoFeedback('');
    setScanCameraOpen(true);
  };

  const assessBodyScanPhoto = async (base64: string, pose: 'front' | 'side'): Promise<{ ok: boolean; feedback: string }> => {
    const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
    if (!apiKey) return { ok: true, feedback: '' };

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 180,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
              },
              {
                type: 'text',
                text: `You are a body-scan photo quality checker for a fitness progress app. Check whether this ${pose} pose photo is usable for body composition trend analysis.

Return ONLY JSON:
{
  "ok": boolean,
  "feedback": "one short actionable instruction for the user"
}

Accept only if the full body from head to feet is visible, the person is centered, lighting is usable, the photo is not very blurry, and the pose roughly matches ${pose === 'front' ? 'a straight front-facing pose' : 'a side-facing pose'}. Do not comment on appearance or body shape.`,
              },
            ],
          }],
        }),
      });

      if (!res.ok) return { ok: true, feedback: '' };
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) return { ok: true, feedback: '' };
      const parsed = JSON.parse(text.slice(start, end + 1));
      return {
        ok: parsed.ok !== false,
        feedback: parsed.feedback || 'Adjust your position and try again.',
      };
    } catch (err) {
      console.warn('[SpiceStrong] Body scan photo quality check failed:', err);
      return { ok: true, feedback: '' };
    }
  };

  const captureGuidedBodyPhoto = async () => {
    try {
      const photo = await scanCameraRef.current?.takePictureAsync({ quality: 0.55, base64: true, skipProcessing: true });
      if (!photo?.uri) throw new Error('No photo captured');
      let b64 = photo.base64 || '';
      if (b64.includes(',')) b64 = b64.split(',')[1];
      setScanCountdownActive(false);
      setScanPhotoAssessing(true);
      setScanPhotoFeedback('Checking photo quality...');

      const quality = await assessBodyScanPhoto(b64, scanPose);
      setScanPhotoAssessing(false);
      if (!quality.ok) {
        const feedback = quality.feedback || 'Adjust your position and try again.';
        setScanPhotoFeedback(feedback);
        Alert.alert('Adjust Position', feedback);
        setScanCountdown(5);
        setTimeout(() => {
          setScanPhotoFeedback('');
          setScanCountdownActive(true);
        }, 1200);
        return;
      }

      if (scanPose === 'front') {
        setScanFrontUri(photo.uri);
        setScanFrontBase64(b64);
        setScanCameraOpen(false);
        setTimeout(() => openGuidedBodyScan('side'), 350);
      } else {
        setScanSideUri(photo.uri);
        setScanSideBase64(b64);
        setScanCameraOpen(false);
      }
      setScanPhotoFeedback('');
    } catch (err) {
      console.warn('[SpiceStrong] Guided body scan capture failed:', err);
      Alert.alert('Capture Failed', 'Could not take the photo. Please try again.');
      setScanCameraOpen(false);
      setScanCountdownActive(false);
      setScanPhotoAssessing(false);
    }
  };

  const getMeasurementSummary = () => {
    const unit = useImperial ? 'in' : 'cm';
    const values = [
      waist ? `waist ${waist}${unit}` : '',
      neck ? `neck ${neck}${unit}` : '',
      hip ? `hip ${hip}${unit}` : '',
    ].filter(Boolean);
    return values.length > 0 ? values.join(', ') : 'no tape measurements provided';
  };

  const calculateNavyBodyFatEstimate = () => {
    const waistValue = parseFloat(waist);
    const neckValue = parseFloat(neck);
    const hipValue = parseFloat(hip);
    const heightInches = useImperial
      ? (parseInt(heightFt) || 5) * 12 + (parseInt(heightIn) || 10)
      : (parseFloat(heightCm) || 178) / 2.54;
    const waistInches = useImperial ? waistValue : waistValue / 2.54;
    const neckInches = useImperial ? neckValue : neckValue / 2.54;
    const hipInches = useImperial ? hipValue : hipValue / 2.54;

    if (!Number.isFinite(waistInches) || !Number.isFinite(neckInches) || waistInches <= neckInches || heightInches <= 0) return null;
    if (gender === 'female') {
      if (!Number.isFinite(hipInches) || hipInches <= 0) return null;
      return Math.round(163.205 * Math.log10(waistInches + hipInches - neckInches) - 97.684 * Math.log10(heightInches) - 78.387);
    }
    return Math.round(86.01 * Math.log10(waistInches - neckInches) - 70.041 * Math.log10(heightInches) + 36.76);
  };

  useEffect(() => {
    if (!scanCameraOpen || !scanCountdownActive || scanPhotoAssessing) return;
    setScanCountdown(5);
    const interval = setInterval(() => {
      setScanCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          captureGuidedBodyPhoto();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [scanCameraOpen, scanCountdownActive, scanPose, scanPhotoAssessing]);

  useEffect(() => {
    if (!scanCameraOpen || !scanCameraReady || scanCountdownActive || scanPhotoAssessing) return;
    const timer = setTimeout(() => setScanCountdownActive(true), 1800);
    return () => clearTimeout(timer);
  }, [scanCameraOpen, scanCameraReady, scanCountdownActive, scanPhotoAssessing]);

  const runBodyScan = async () => {
    if (!scanFrontBase64) {
      Alert.alert('Photo needed', 'Please take the guided front photo first.');
      return;
    }
    if (!scanSideBase64) {
      Alert.alert('Side photo needed', 'Please take the guided side photo before analyzing.');
      return;
    }
    setScanning(true);
    try {
      const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
      if (!apiKey) throw new Error('No API key');

      // Build content with 1 or 2 images
      const content: any[] = [];
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: scanFrontBase64 },
      });
      if (scanSideBase64) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: scanSideBase64 },
        });
      }
      content.push({
        type: 'text',
        text: `Analyze this person's body composition from the photo(s). The person is ${gender}, age ${age}, ${useImperial ? weightLbs + ' lbs' : weightKg + ' kg'}, ${useImperial ? heightFt + "'" + heightIn + '"' : heightCm + ' cm'}.
Tape measurements: ${getMeasurementSummary()}.
Navy body-fat estimate from measurements, if available: ${calculateNavyBodyFatEstimate() ?? 'not available'}%.

Return ONLY this JSON:
{
  "bodyFatPercent": number (midpoint of your best estimate range),
  "bodyFatLow": number,
  "bodyFatHigh": number,
  "bodyType": "ectomorph" | "mesomorph" | "endomorph" | "ecto-mesomorph" | "endo-mesomorph",
  "muscleMass": "low" | "moderate" | "high",
  "confidence": "low" | "medium" | "high",
  "assessment": "one sentence summary of visible progress/body composition",
  "nutritionFocus": "one short SpiceStrong nutrition recommendation, such as protein consistency, calorie deficit, maintenance, or muscle gain"
}

Use the photos, user stats, and measurements together. Prefer a range over false precision. If photos are unclear, lower confidence. This is an approximate estimate, not a medical diagnosis.`,
      });

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          messages: [{ role: 'user', content }],
        }),
      });

      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      const text = data.content?.[0]?.text || '';

      // Parse JSON
      const start = text.indexOf('{');
      let depth = 0, end = -1;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end === -1) throw new Error('Could not parse scan result');
      const parsed = JSON.parse(text.slice(start, end));

      const navyEstimate = calculateNavyBodyFatEstimate();
      const bf = Math.round(Number(parsed.bodyFatPercent) || navyEstimate || 0);
      const low = Math.round(Number(parsed.bodyFatLow) || Math.max(1, bf - 3));
      const high = Math.round(Number(parsed.bodyFatHigh) || bf + 3);
      setScanResult({
        bodyFat: bf,
        bodyFatLow: low,
        bodyFatHigh: Math.max(high, low),
        bodyType: parsed.bodyType || 'mesomorph',
        muscleMass: parsed.muscleMass || 'moderate',
        confidence: parsed.confidence || (navyEstimate ? 'medium' : 'low'),
        assessment: parsed.assessment || 'Use this as a trend marker and compare again under the same conditions.',
        nutritionFocus: parsed.nutritionFocus || 'Keep protein consistent and use weekly progress to adjust calories.',
      });
      setBodyFat(String(bf));
    } catch (err: any) {
      console.error('[SpiceStrong] Body scan failed:', err);
      Alert.alert('Scan Failed', 'Could not analyze the photo. You can enter body fat manually or skip.');
    } finally {
      setScanning(false);
    }
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
              <Text style={styles.stepTitle}>Progress Scan</Text>
              <Text style={styles.stepHint}>Combine photos and simple tape measurements for a more useful trend estimate.</Text>

              {/* Manual input */}
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

              {/* AI Body Scan section */}
              <View style={styles.scanSection}>
                <View style={styles.scanDivider}>
                  <View style={styles.scanDividerLine} />
                  <Text style={styles.scanDividerText}>guided photo scan</Text>
                  <View style={styles.scanDividerLine} />
                </View>

                <Text style={styles.scanHint}>Fit your full body inside the guide. The app captures front first, then side, using the same two-pose flow as leading scan apps.</Text>

                {/* Photo row */}
                <View style={styles.scanPhotoRow}>
                  <TouchableOpacity style={styles.scanPhotoCard} onPress={() => openGuidedBodyScan('front')} activeOpacity={0.75}>
                    {scanFrontUri ? (
                      <Image source={{ uri: scanFrontUri }} style={styles.scanPhotoImg} contentFit="cover" />
                    ) : (
                      <>
                        <Text style={styles.scanPhotoIcon}>📷</Text>
                        <Text style={styles.scanPhotoLabel}>Front</Text>
                        <Text style={styles.scanPhotoRequired}>Required</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.scanPhotoCard} onPress={() => openGuidedBodyScan('side')} activeOpacity={0.75}>
                    {scanSideUri ? (
                      <Image source={{ uri: scanSideUri }} style={styles.scanPhotoImg} contentFit="cover" />
                    ) : (
                      <>
                        <Text style={styles.scanPhotoIcon}>📷</Text>
                        <Text style={styles.scanPhotoLabel}>Side</Text>
                        <Text style={styles.scanPhotoOptional}>Required</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Scan tips */}
                <View style={styles.scanTips}>
                  <Text style={styles.scanTipText}>💡 Wear tight-fitting clothes • Good lighting • Plain background</Text>
                </View>

                {/* Scan button */}
                {scanFrontUri && scanSideUri && !scanning && !scanResult && (
                  <TouchableOpacity style={styles.scanBtn} onPress={runBodyScan} activeOpacity={0.8}>
                    <Text style={styles.scanBtnText}>Analyze Progress Scan</Text>
                  </TouchableOpacity>
                )}

                {/* Scanning */}
                {scanning && (
                  <View style={styles.scanLoadingRow}>
                    <ActivityIndicator color={ORANGE} size="small" />
                    <Text style={styles.scanLoadingText}>Analyzing photos, measurements, and nutrition context...</Text>
                  </View>
                )}

                {/* Scan results */}
                {scanResult && (
                  <View style={styles.scanResultCard}>
                    <Text style={styles.scanResultTitle}>Progress Scan Estimate</Text>
                    <View style={styles.scanResultRow}>
                      <View style={styles.scanResultItem}>
                        <Text style={styles.scanResultValue}>{scanResult.bodyFatLow}-{scanResult.bodyFatHigh}%</Text>
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
                    <TouchableOpacity onPress={() => { setScanResult(null); setScanFrontUri(null); setScanSideUri(null); setScanFrontBase64(''); setScanSideBase64(''); }} activeOpacity={0.7}>
                      <Text style={styles.scanRetakeText}>Retake photos</Text>
                    </TouchableOpacity>
                  </View>
                )}
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

      <Modal visible={scanCameraOpen} animationType="slide" onRequestClose={() => setScanCameraOpen(false)}>
        <View style={styles.bodyCameraWrap}>
          <CameraView ref={scanCameraRef} style={styles.bodyCamera} facing="front" onCameraReady={() => setScanCameraReady(true)} />
          <View style={styles.bodyCameraOverlay}>
            <Text style={styles.bodyCameraTitle}>{scanPose === 'front' ? 'Front Pose' : 'Side Pose'}</Text>
            <View style={styles.bodyGuide}>
              <View style={styles.bodyGuideHead} />
              <View style={styles.bodyGuideShoulders} />
              <View style={styles.bodyGuideTorso} />
              <View style={styles.bodyGuideLegs} />
            </View>
            {scanCountdownActive && (
              <View style={styles.bodyCountdownBadge}>
                <Text style={styles.bodyCountdownText}>{scanCountdown}</Text>
              </View>
            )}
            {scanPhotoAssessing && (
              <View style={styles.bodyQualityBadge}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.bodyQualityText}>Checking pose</Text>
              </View>
            )}
            <Text style={styles.bodyCameraHint}>
              {scanPhotoAssessing
                ? 'Reviewing full-body visibility, lighting, and position'
                : scanPhotoFeedback
                  ? scanPhotoFeedback
                  : scanCountdownActive
                    ? 'Hold still until the photo is taken'
                    : 'Fit your full body inside the outline'}
            </Text>
          </View>
          <TouchableOpacity style={styles.bodyCameraClose} onPress={() => { setScanCountdownActive(false); setScanCameraOpen(false); }} activeOpacity={0.8}>
            <Text style={styles.bodyCameraCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Next button (not shown on results) */}
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

  // Body scan styles
  scanSection: { marginTop: 24 },
  scanDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  scanDividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.10)' },
  scanDividerText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.40)' },
  scanHint: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
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
    bottom: 104,
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
    bottom: 104,
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
    bottom: 64,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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
});
