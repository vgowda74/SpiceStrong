/**
 * FitnessProfileScreen.tsx — SpiceStrong
 * Collects user fitness data to calculate daily calorie/macro targets.
 * Step-by-step flow: Goal → Gender → Age → Height → Weight → Target Weight → Body Fat → Activity Level → Results
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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

  // Body scan state
  const [scanFrontUri, setScanFrontUri] = useState<string | null>(null);
  const [scanSideUri, setScanSideUri] = useState<string | null>(null);
  const [scanFrontBase64, setScanFrontBase64] = useState<string>('');
  const [scanSideBase64, setScanSideBase64] = useState<string>('');
  const [scanFrontBad, setScanFrontBad] = useState(false);
  const [scanSideBad, setScanSideBad] = useState(false);
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
  // Upload-only flow: gender-matched reference sample + per-pose upload state
  const [sampleUri, setSampleUri] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [uploadingPose, setUploadingPose] = useState<'front' | 'side' | null>(null);
  const [waist, setWaist] = useState('');
  const [neck, setNeck] = useState('');
  const [hip, setHip] = useState('');
  const [bodyScanMode, setBodyScanMode] = useState<null | 'manual' | 'camera'>(null);
  const [scanInstructionPose, setScanInstructionPose] = useState<'front' | 'side' | null>(null);

  // Pose guidance state
  const [poseStatus, setPoseStatus] = useState<'not-ready' | 'almost' | 'perfect'>('not-ready');
  const [guidanceText, setGuidanceText] = useState('Position yourself in the outline');
  const [poseScore, setPoseScore] = useState(0);

  // Outline-guided capture state
  const [alignmentScore, setAlignmentScore] = useState(0);
  const [holdingStill, setHoldingStill] = useState(false);
  const [holdCountdown, setHoldCountdown] = useState(5);
  const [capturing, setCapturing] = useState(false);
  const [captureAttempts, setCaptureAttempts] = useState(0);
  const [photoReady, setPhotoReady] = useState(false);
  const cameraOpenTimeRef = useRef<number>(0);
  const alignmentIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visionCheckInFlightRef = useRef(false);
  const [visionCheckActive, setVisionCheckActive] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glowAnim = useRef(new Animated.Value(0)).current;
  const [instrSlide, setInstrSlide] = useState(0);
  const instrScrollRef = useRef<ScrollView>(null);
  const [instrImages, setInstrImages] = useState<ScanInstrImages>({
    clothingGood: null, clothingBad: null,
    lightingGood: null, lightingBad: null,
    backgroundGood: null, backgroundBad: null,
    distanceGood: null, distanceBad: null,
  });
  const instrImagesLoadingRef = useRef(false);

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

  // Load the gender-matched reference sample once the user reaches the scan step.
  useEffect(() => {
    if (step !== 'body_fat' || sampleUri || sampleLoading) return;
    const sampleGender = gender === 'female' ? 'female' : 'male';
    setSampleLoading(true);
    generateBodyScanSample(sampleGender)
      .then((uri) => setSampleUri(uri))
      .finally(() => setSampleLoading(false));
  }, [step, gender, sampleUri, sampleLoading]);

  // Pre-generate instruction comparison images as soon as user picks "Body Scan" mode.
  // Images resolve one-by-one via onProgress so cards update incrementally.
  useEffect(() => {
    if (bodyScanMode !== 'camera') return;
    if (instrImagesLoadingRef.current) return;
    instrImagesLoadingRef.current = true;
    generateScanInstrImages((update) => {
      setInstrImages((prev) => ({ ...prev, [update.key]: update.uri }));
    }).finally(() => { instrImagesLoadingRef.current = false; });
  }, [bodyScanMode]);

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
    setScanCountdown(3);
    setScanCameraReady(false);
    setScanCountdownActive(false);
    setScanPhotoAssessing(false);
    setScanPhotoFeedback('');
    // Outline guidance reset
    setPoseScore(0);
    setPoseStatus('not-ready');
    setGuidanceText('Position yourself in the outline');
    setAlignmentScore(0);
    setHoldingStill(false);
    setHoldCountdown(5);
    setCapturing(false);
    setPhotoReady(false);
    setCaptureAttempts(0);
    if (side === 'front') setScanFrontBad(false);
    else setScanSideBad(false);
    cameraOpenTimeRef.current = Date.now();
    glowAnim.setValue(0);
    setScanCameraOpen(true);
  };

  // Resize + compress a photo URI to a small JPEG base64 safe for API upload.
  // Caps longest side at 900px and uses 55% JPEG quality → ~100-250 KB typical.
  const compressForApi = async (uri: string): Promise<string> => {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 900 } }],
      { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return result.base64 || '';
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
          model: 'claude-sonnet-4-6',
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

  // ── Real vision-based alignment check ──
  // Takes a tiny silent preview frame, asks Claude Haiku whether the full body
  // (head to feet) is visible, and updates the outline colour accordingly.
  const checkAlignmentWithVision = useCallback(async () => {
    if (!scanCameraRef.current || !scanCameraReady) return;
    if (capturing || scanPhotoAssessing || photoReady || holdingStill) return;
    if (visionCheckInFlightRef.current) return;

    visionCheckInFlightRef.current = true;
    setVisionCheckActive(true);
    try {
      const preview = await scanCameraRef.current.takePictureAsync({
        quality: 0.25,
        skipProcessing: true,
      });
      if (!preview?.uri) return;

      const compressed = await ImageManipulator.manipulateAsync(
        preview.uri,
        [{ resize: { width: 320 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const b64 = compressed.base64 || '';
      if (!b64 || b64.length < 100) return;

      const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
      if (!apiKey) return;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 80,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
              {
                type: 'text',
                text: `Body scan alignment — ${scanPose === 'front' ? 'front-facing' : 'side-profile'} pose.\nIs the person's COMPLETE body (head AND feet) visible in frame and centered?\nReturn ONLY JSON: {"score":0-100,"tip":"short instruction"}\n0=only face/torso, 35=upper body only, 65=mostly visible, 85=full body well framed, 95=perfect`,
              },
            ],
          }],
        }),
      });

      if (!res.ok) return;
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end === -1) return;
      const parsed = JSON.parse(text.slice(start, end + 1));

      const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
      setAlignmentScore(score);
      if (parsed.tip) setGuidanceText(parsed.tip);

      if (score >= 80) {
        setPoseStatus('perfect');
        // Outline is green — stop polling, user will tap when ready
        if (alignmentIntervalRef.current) {
          clearInterval(alignmentIntervalRef.current);
          alignmentIntervalRef.current = null;
        }
      } else if (score >= 50) {
        setPoseStatus('almost');
      } else {
        setPoseStatus('not-ready');
      }
    } catch (err) {
      console.warn('[SpiceStrong] Vision alignment check failed:', err);
    } finally {
      visionCheckInFlightRef.current = false;
      setVisionCheckActive(false);
    }
  }, [scanCameraReady, capturing, scanPhotoAssessing, photoReady, holdingStill, scanPose]);

  const captureGuidedBodyPhoto = async () => {
    // Guard: camera must be mounted and ready
    if (!scanCameraRef.current || !scanCameraReady) {
      setCapturing(false);
      setHoldingStill(false);
      setAlignmentScore(0);
      cameraOpenTimeRef.current = Date.now();
      glowAnim.setValue(0);
      return;
    }
    try {
      setCapturing(true);
      setScanCountdownActive(false);
      const photo = await scanCameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: false });
      if (!photo?.uri) throw new Error('No photo captured');
      // Compress to ~900px wide before any API calls to keep payload under 300 KB
      const b64 = await compressForApi(photo.uri);

      setScanPhotoAssessing(true);
      setScanPhotoFeedback('Checking photo quality...');

      const quality = await assessBodyScanPhoto(b64, scanPose);
      setScanPhotoAssessing(false);

      if (!quality.ok) {
        const attempts = captureAttempts + 1;
        setCaptureAttempts(attempts);
        const feedback = quality.feedback || 'Adjust your position and try again.';
        setScanPhotoFeedback(feedback);

        if (attempts >= 3) {
          // Accept after 3 retries but flag it so user can retake from the card
          if (scanPose === 'front') setScanFrontBad(true);
          else setScanSideBad(true);
          setScanPhotoFeedback('');
        } else {
          // Auto-retake: reset alignment engine
          setCapturing(false);
          setHoldingStill(false);
          setAlignmentScore(0);
          cameraOpenTimeRef.current = Date.now();
          glowAnim.setValue(0);
          setTimeout(() => setScanPhotoFeedback(''), 1800);
          return;
        }
      }

      setCapturing(false);
      setPhotoReady(true);
      setScanPhotoFeedback('');

      if (scanPose === 'front') {
        setScanFrontUri(photo.uri);
        setScanFrontBase64(b64);
        // Announce transition to side view
        Speech.stop();
        Speech.speak('Front photo done! Now turn ninety degrees for your side view.', { rate: 0.92 });
        await new Promise(r => setTimeout(r, 1800));
        setScanCameraOpen(false);
        setTimeout(() => openGuidedBodyScan('side'), 350);
      } else {
        setScanSideUri(photo.uri);
        setScanSideBase64(b64);
        setScanCameraOpen(false);
      }
    } catch (err) {
      console.warn('[SpiceStrong] Guided body scan capture failed:', err);
      Alert.alert('Capture Failed', 'Could not take the photo. Please try again.');
      setScanCameraOpen(false);
      setCapturing(false);
      setScanPhotoAssessing(false);
    }
  };

  // ── Upload-only body scan: pick from gallery, validate, gate side behind front ──
  const uploadBodyPhoto = async (pose: 'front' | 'side') => {
    // Side photo is locked until a valid front photo exists.
    if (pose === 'side' && !scanFrontUri) {
      Alert.alert('Front photo first', 'Please add and pass your front photo before adding the side photo.');
      return;
    }
    if (uploadingPose) return;

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Photo library access is required to upload your body-scan photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.6,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      let b64 = asset.base64 || '';
      if (b64.includes(',')) b64 = b64.split(',')[1];

      setUploadingPose(pose);
      const quality = await assessBodyScanPhoto(b64, pose);
      setUploadingPose(null);

      if (!quality.ok) {
        trackEvent('body_scan_photo_rejected', {
          screen: 'FitnessProfileScreen',
          metadata: { pose, feedback: quality.feedback || '' },
        });
        Alert.alert(
          'Photo Not Usable',
          `${quality.feedback || 'This photo can’t be used for an accurate measurement.'}\n\nPlease upload another ${pose} photo.`,
        );
        return;
      }

      if (pose === 'front') {
        setScanFrontUri(asset.uri);
        setScanFrontBase64(b64);
      } else {
        setScanSideUri(asset.uri);
        setScanSideBase64(b64);
      }
    } catch (err) {
      console.warn('[SpiceStrong] Body scan upload failed:', err);
      setUploadingPose(null);
      Alert.alert('Upload Failed', 'Could not process that photo. Please try another.');
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

  // ── Real-vision alignment engine ──
  // Fires an actual Claude Haiku check ~3.5s after camera opens and every 3.5s
  // after that. Green = Claude confirmed full body is visible in frame.
  useEffect(() => {
    if (!scanCameraOpen || !scanCameraReady || holdingStill || capturing || scanPhotoAssessing) return;

    const initial = setTimeout(() => { checkAlignmentWithVision(); }, 1800);
    const interval = setInterval(() => { checkAlignmentWithVision(); }, 3500);

    alignmentIntervalRef.current = interval;
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [scanCameraOpen, scanCameraReady, holdingStill, capturing, scanPhotoAssessing, checkAlignmentWithVision]);

  // ── Audio guidance while not yet aligned ──
  useEffect(() => {
    if (!scanCameraOpen || !scanCameraReady || holdingStill || capturing || scanPhotoAssessing) return;

    const isSide = scanPose === 'side';

    // Low score (<50): user needs basic positioning help
    const MESSAGES_LOW = isSide ? [
      'Turn ninety degrees and show your side profile to the camera.',
      'Stand six to eight feet away and face your side toward the phone.',
    ] : [
      'Stand six to eight feet from the camera.',
      'Make sure your full body is visible, head to toe.',
      'Step back so your entire body fits inside the outline.',
      'Face the camera straight on and stand tall.',
    ];

    // Mid score (50–79): user is close, fine-tune
    const MESSAGES_MID = isSide ? [
      'Good — keep your side profile visible and hold still.',
      'Keep your arms at your sides and stand tall.',
    ] : [
      'Almost there. Adjust your position slightly.',
      'Face forward with your arms slightly away from your body.',
      'Keep your feet together and stand tall.',
    ];

    let msgIndex = 0;

    const speakNext = (score: number) => {
      Speech.stop();
      const pool = score < 50 ? MESSAGES_LOW : MESSAGES_MID;
      Speech.speak(pool[msgIndex % pool.length], { rate: 0.92, pitch: 1.0 });
      msgIndex += 1;
    };

    // Speak immediately when camera is ready
    speakNext(0);

    const interval = setInterval(() => {
      setAlignmentScore((current) => {
        if (current < 80) speakNext(current);
        return current;
      });
    }, 4000);

    return () => {
      clearInterval(interval);
      Speech.stop();
    };
  }, [scanCameraOpen, scanCameraReady, holdingStill, capturing, scanPhotoAssessing, scanPose]);

  // ── Announce alignment achieved ──
  useEffect(() => {
    if (!holdingStill) return;
    Speech.stop();
    Speech.speak('Perfect! Hold very still.', { rate: 0.92 });
  }, [holdingStill]);

  // ── Hold-still countdown + auto-capture ──
  useEffect(() => {
    if (!holdingStill || capturing || scanPhotoAssessing) return;

    // Start glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();

    setHoldCountdown(5);
    let count = 5;
    const tick = setInterval(() => {
      count -= 1;
      setHoldCountdown(count);
      if (count <= 0) {
        clearInterval(tick);
        glowAnim.stopAnimation();
        setCapturing(true);
        captureGuidedBodyPhoto();
      }
    }, 1000);

    return () => {
      clearInterval(tick);
      glowAnim.stopAnimation();
    };
  }, [holdingStill, capturing, scanPhotoAssessing]);

  // ── Old countdown fallback (kept for manual-tap path) ──
  useEffect(() => {
    if (!scanCameraOpen || !scanCountdownActive || scanPhotoAssessing) return;
    setScanCountdown(3);
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

  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 2): Promise<Response> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(url, options);
      if (res.ok || res.status < 500 || attempt === maxRetries) return res;
      await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
    }
    return fetch(url, options);
  };

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

      const res = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          messages: [{ role: 'user', content }],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`API ${res.status}: ${body.slice(0, 120)}`);
      }
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
      trackEvent('body_scan_completed', {
        screen: 'FitnessProfileScreen',
        metadata: {
          confidence: parsed.confidence ?? 'low',
          hasSide: !!scanSideBase64,
          gender,
        },
      });
    } catch (err: any) {
      console.error('[SpiceStrong] Body scan failed:', err);
      Alert.alert('Scan Failed', 'Could not analyze the photo. You can enter body fat manually or skip.');
    } finally {
      setScanning(false);
    }
  };

  const getPoseColor = (score: number) => {
    if (score >= 80) return '#34C759';
    if (score >= 50) return '#FFD60A';
    return '#FF3B30';
  };

  const getPoseStatusFromScore = (score: number): 'not-ready' | 'almost' | 'perfect' => {
    if (score >= 80) return 'perfect';
    if (score >= 50) return 'almost';
    return 'not-ready';
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
                  <TouchableOpacity style={styles.premScanAIImageCard} onPress={() => setBodyScanMode('camera')} activeOpacity={0.88}>
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

              {/* ── Camera / Body Scan ── */}
              {bodyScanMode === 'camera' && (
                <>
                  <TouchableOpacity onPress={() => setBodyScanMode(null)} style={styles.scanModeBack} activeOpacity={0.7}>
                    <Text style={styles.scanModeBackText}>← Back</Text>
                  </TouchableOpacity>

                  <Text style={styles.scanCameraHint}>Stand straight with your full body visible. Good lighting and a plain background give the best results.</Text>

                  {/* Front photo card */}
                  <View style={[styles.scanCameraCard, scanFrontBad && styles.scanCameraCardBad]}>
                    <View style={styles.scanCameraCardHeader}>
                      <Text style={styles.scanCameraCardLabel}>Front View</Text>
                      {scanFrontUri && !scanFrontBad && <Text style={styles.scanCameraCardDone}>✓ Done</Text>}
                      {scanFrontBad && <Text style={styles.scanCameraCardWarn}>⚠ Low quality</Text>}
                    </View>
                    {scanFrontUri ? (
                      <View style={styles.scanCameraPreviewWrap}>
                        <Image source={{ uri: scanFrontUri }} style={styles.scanCameraPreview} contentFit="contain" />
                        {scanFrontBad && (
                          <View style={styles.scanCameraBadBanner}>
                            <Text style={styles.scanCameraBadText}>Photo quality is low — please retake for best results</Text>
                          </View>
                        )}
                        <TouchableOpacity style={styles.scanCameraRetake} onPress={() => { setScanFrontUri(null); setScanFrontBase64(''); setScanFrontBad(false); }} activeOpacity={0.8}>
                          <Text style={styles.scanCameraRetakeText}>Retake</Text>
                        </TouchableOpacity>
                      </View>
                    ) : uploadingPose === 'front' ? (
                      <View style={styles.scanCameraPlaceholder}>
                        <ActivityIndicator color={ORANGE} size="large" />
                        <Text style={styles.scanCameraCheckingText}>Checking photo…</Text>
                      </View>
                    ) : (
                      <View style={styles.scanCameraPlaceholder}>
                        <TouchableOpacity style={styles.scanCameraBtn} onPress={() => { setScanInstructionPose('front'); setInstrSlide(0); }} activeOpacity={0.8}>
                          <Text style={styles.scanCameraBtnIcon}>📷</Text>
                          <Text style={styles.scanCameraBtnText}>Take Photo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => uploadBodyPhoto('front')} activeOpacity={0.7}>
                          <Text style={styles.scanCameraLibraryText}>or choose from library</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* Side photo card */}
                  <View style={[styles.scanCameraCard, !scanFrontUri && styles.scanCameraCardLocked, scanSideBad && styles.scanCameraCardBad]}>
                    <View style={styles.scanCameraCardHeader}>
                      <Text style={styles.scanCameraCardLabel}>Side View</Text>
                      {scanSideUri && !scanSideBad && <Text style={styles.scanCameraCardDone}>✓ Done</Text>}
                      {scanSideBad && <Text style={styles.scanCameraCardWarn}>⚠ Low quality</Text>}
                      {!scanSideUri && !scanFrontUri && <Text style={styles.scanCameraCardLockedLabel}>🔒 After front</Text>}
                    </View>
                    {scanSideUri ? (
                      <View style={styles.scanCameraPreviewWrap}>
                        <Image source={{ uri: scanSideUri }} style={styles.scanCameraPreview} contentFit="contain" />
                        {scanSideBad && (
                          <View style={styles.scanCameraBadBanner}>
                            <Text style={styles.scanCameraBadText}>Photo quality is low — please retake for best results</Text>
                          </View>
                        )}
                        <TouchableOpacity style={styles.scanCameraRetake} onPress={() => { setScanSideUri(null); setScanSideBase64(''); setScanSideBad(false); }} activeOpacity={0.8}>
                          <Text style={styles.scanCameraRetakeText}>Retake</Text>
                        </TouchableOpacity>
                      </View>
                    ) : uploadingPose === 'side' ? (
                      <View style={styles.scanCameraPlaceholder}>
                        <ActivityIndicator color={ORANGE} size="large" />
                        <Text style={styles.scanCameraCheckingText}>Checking photo…</Text>
                      </View>
                    ) : (
                      <View style={styles.scanCameraPlaceholder}>
                        <TouchableOpacity
                          style={[styles.scanCameraBtn, !scanFrontUri && { opacity: 0.4 }]}
                          onPress={() => { if (scanFrontUri) { setScanInstructionPose('side'); setInstrSlide(0); } }}
                          activeOpacity={0.8}
                          disabled={!scanFrontUri}
                        >
                          <Text style={styles.scanCameraBtnIcon}>📷</Text>
                          <Text style={styles.scanCameraBtnText}>Take Photo</Text>
                        </TouchableOpacity>
                        {!!scanFrontUri && (
                          <TouchableOpacity onPress={() => uploadBodyPhoto('side')} activeOpacity={0.7}>
                            <Text style={styles.scanCameraLibraryText}>or choose from library</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Tips */}
                  <View style={styles.scanTips}>
                    <Text style={styles.scanTipText}>💡 Wear tight-fitting clothes • Good lighting • Plain background • Full body head-to-toe</Text>
                  </View>

                  {/* Analyze button */}
                  {scanFrontUri && scanSideUri && !scanning && !scanResult && (
                    <TouchableOpacity style={styles.scanBtn} onPress={runBodyScan} activeOpacity={0.8}>
                      <Text style={styles.scanBtnText}>Analyze Body Scan</Text>
                    </TouchableOpacity>
                  )}

                  {/* Scanning */}
                  {scanning && (
                    <View style={styles.scanLoadingRow}>
                      <ActivityIndicator color={ORANGE} size="small" />
                      <Text style={styles.scanLoadingText}>Analyzing photos...</Text>
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

                  <TouchableOpacity onPress={goNext} activeOpacity={0.7}>
                    <Text style={styles.skipText}>Skip this step</Text>
                  </TouchableOpacity>
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

      <Modal visible={scanCameraOpen} animationType="slide" onRequestClose={() => { Speech.stop(); setScanCameraOpen(false); setHoldingStill(false); setCapturing(false); }}>
        <View style={styles.bodyCameraWrap}>
          <CameraView ref={scanCameraRef} style={styles.bodyCamera} facing="front" mute onCameraReady={() => setScanCameraReady(true)} />

          <View style={styles.bodyCameraOverlay}>

            {/* ── Title + pose label ── */}
            <View style={styles.outlineHeader}>
              <Text style={styles.outlinePoseLabel}>
                {scanPose === 'front' ? 'FRONT VIEW' : 'SIDE VIEW'}
              </Text>
              <Text style={styles.outlineSubLabel}>
                {alignmentScore < 50
                  ? scanPose === 'front'
                    ? 'Step back — full body head-to-toe must be visible'
                    : 'Turn sideways — show your full left or right profile'
                  : alignmentScore < 80
                    ? scanPose === 'front' ? 'Face forward, arms slightly away from body' : 'Keep your full side profile in view'
                    : 'Looking good — tap the button when ready'}
              </Text>
            </View>

            {/* ── Body outline silhouette ── */}
            {!photoReady && (
              <Animated.View style={[
                styles.outlineGlowWrap,
                holdingStill && !capturing && {
                  shadowColor: '#34C759',
                  shadowOpacity: glowAnim,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 0 },
                },
              ]}>
                <BodyOutline
                  pose={scanPose}
                  gender={gender}
                  color={
                    photoReady ? '#34C759'
                    : holdingStill ? '#34C759'
                    : alignmentScore >= 80 ? '#34C759'
                    : alignmentScore >= 50 ? '#FFD60A'
                    : '#FFFFFF'
                  }
                  opacity={
                    alignmentScore >= 80 ? 0.9
                    : alignmentScore >= 50 ? 0.75
                    : scanPose === 'side' ? 0.65
                    : 0.40
                  }
                  height={540}
                />
              </Animated.View>
            )}

            {/* ── Photo captured flash ── */}
            {photoReady && (
              <View style={styles.outlineCapturedBadge}>
                <Text style={styles.outlineCapturedIcon}>✓</Text>
                <Text style={styles.outlineCapturedText}>
                  {scanPose === 'front' ? 'Front captured!' : 'Side captured!'}
                </Text>
                {scanPose === 'front' && <Text style={styles.outlineCapturedSub}>Preparing side view…</Text>}
              </View>
            )}


            {/* ── Ready cue — shown when outline is green, waiting for tap ── */}
            {alignmentScore >= 80 && !capturing && !scanPhotoAssessing && !photoReady && !holdingStill && (
              <View style={styles.outlineHoldWrap}>
                <Text style={[styles.outlineHoldText, { color: '#34C759' }]}>Tap when ready</Text>
              </View>
            )}

            {/* ── Hold still countdown (user-triggered tap path) ── */}
            {holdingStill && !capturing && !scanPhotoAssessing && !photoReady && (
              <View style={styles.outlineHoldWrap}>
                <Text style={styles.outlineHoldText}>Hold still…</Text>
                <View style={styles.outlineCountdownRow}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <View key={n} style={[styles.outlineCountdownDot, holdCountdown < n && styles.outlineCountdownDotFilled]} />
                  ))}
                </View>
                <Text style={styles.outlineCountdownNum}>{holdCountdown}</Text>
              </View>
            )}

            {/* ── Capturing / quality check ── */}
            {(capturing || scanPhotoAssessing) && !photoReady && (
              <View style={styles.outlineHoldWrap}>
                <ActivityIndicator color="#34C759" size="large" />
                <Text style={styles.outlineHoldText}>
                  {scanPhotoAssessing ? 'Checking photo…' : 'Capturing…'}
                </Text>
                {!!scanPhotoFeedback && captureAttempts < 3 && (
                  <Text style={styles.outlineRetakeText}>Retaking… {scanPhotoFeedback}</Text>
                )}
              </View>
            )}

            {/* ── Vision scanning indicator ── */}
            {visionCheckActive && !capturing && !photoReady && (
              <View style={styles.visionScanIndicator}>
                <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
                <Text style={styles.visionScanText}>Checking frame…</Text>
              </View>
            )}
          </View>

          {/* ── Zing-style bottom instruction bar ── */}
          {!holdingStill && !capturing && !scanPhotoAssessing && !photoReady && (
            <View style={[
              styles.outlineInstrBar,
              scanPose === 'side' && alignmentScore < 25 ? styles.outlineInstrBarLime : styles.outlineInstrBarDark,
            ]}>
              <View style={[
                styles.outlineInstrIconCircle,
                scanPose === 'side' && alignmentScore < 25 ? styles.outlineInstrIconDark : styles.outlineInstrIconLight,
              ]}>
                <Text style={styles.outlineInstrIconText}>
                  {scanPose === 'side' && alignmentScore < 25 ? '↩' : '↕'}
                </Text>
              </View>
              <Text style={[
                styles.outlineInstrBarText,
                scanPose === 'side' && alignmentScore < 25 ? { color: '#1A1A1A' } : { color: '#FFFFFF' },
              ]}>
                {alignmentScore < 50
                  ? (scanPose === 'front'
                      ? 'Move back until your body fits the outline'
                      : 'Turn 90° — face one side toward the camera')
                  : (scanPose === 'front'
                      ? 'Face forward, arms slightly away from body'
                      : 'Good — keep your side profile in view')}
              </Text>
            </View>
          )}

          {/* ── Manual capture button ── */}
          {!capturing && !scanPhotoAssessing && !photoReady && !holdingStill && (
            <>
              <TouchableOpacity
                style={[
                  styles.bodyCaptureBtn,
                  alignmentScore >= 80 && { borderColor: '#34C759', borderWidth: 3 },
                ]}
                onPress={captureGuidedBodyPhoto}
                activeOpacity={0.8}
              >
                <View style={[
                  styles.bodyCaptureBtnInner,
                  alignmentScore >= 80 && { backgroundColor: '#34C759' },
                ]} />
              </TouchableOpacity>
              <Text style={[
                styles.bodyCaptureTapHint,
                alignmentScore >= 80 && { color: '#34C759', fontWeight: '700' },
              ]}>
                {alignmentScore >= 80 ? '✓ tap to capture' : 'tap to capture now'}
              </Text>
            </>
          )}

          <TouchableOpacity
            style={styles.bodyCameraClose}
            onPress={() => { Speech.stop(); setHoldingStill(false); setCapturing(false); setScanCameraOpen(false); }}
            activeOpacity={0.8}
          >
            <Text style={styles.bodyCameraCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Next button (not shown on results or body-fat selection) */}
      {step !== 'results' && !(step === 'body_fat' && bodyScanMode === null) && (
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
  premScanAIImage: { width: '100%', height: 180 },

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
});
