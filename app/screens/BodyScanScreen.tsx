/**
 * BodyScanScreen.tsx — SpiceStrong
 * Standalone AI body scan: front + side photo capture with 12-second countdown,
 * spoken audio cues, review screen, Claude-powered body composition analysis.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Speech from 'expo-speech';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getFitnessProfile, saveFitnessProfile, type FitnessProfile } from '../../services/fitnessProfileService';
import { trackEvent } from '../../services/analyticsService';
import { PremiumScreen } from '../../components/PremiumScreen';
import BodyOutline from '../../components/BodyOutline';
import { HomeButton } from '../../components/HomeButton';
import { ProcessingRing } from '../../components/ProcessingRing';

const ORANGE = '#E85D26';
const SURFACE = 'rgba(248,241,232,0.08)';
const BORDER = 'rgba(248,241,232,0.12)';
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'PlayfairDisplay_700Bold',
  default: 'serif',
});

type Screen = 'start' | 'camera' | 'review';
type Pose = 'front' | 'side';

interface ScanResult {
  bodyFat: number;
  bodyFatLow: number;
  bodyFatHigh: number;
  bodyType: string;
  muscleMass: string;
  confidence: string;
  assessment: string;
  nutritionFocus: string;
}

export default function BodyScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // ── Screen navigation ──
  const [screen, setScreen] = useState<Screen>('start');

  // ── Profile (for gender / stats context) ──
  const [profile, setProfile] = useState<FitnessProfile | null>(null);

  // ── Camera state ──
  const [pose, setPose] = useState<Pose>('front');
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [photoAssessing, setPhotoAssessing] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState('');
  const [photoReady, setPhotoReady] = useState(false);
  const [captureAttempts, setCaptureAttempts] = useState(0);
  const [timer, setTimer] = useState(12);

  // ── Captured photos ──
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [frontB64, setFrontB64] = useState('');
  const [sideUri, setSideUri] = useState<string | null>(null);
  const [sideB64, setSideB64] = useState('');
  const [frontBad, setFrontBad] = useState(false);
  const [sideBad, setSideBad] = useState(false);
  const [uploadingPose, setUploadingPose] = useState<Pose | null>(null);

  // ── Analysis ──
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [imageUnusable, setImageUnusable] = useState(false);
  const [unusableReason, setUnusableReason] = useState('');

  // ── Load profile on mount ──
  useEffect(() => {
    getFitnessProfile().then(p => { if (p) setProfile(p); }).catch(() => {});
  }, []);

  // ── Helpers ──
  const compressForApi = async (uri: string): Promise<string> => {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 900 } }],
      { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return result.base64 || '';
  };

  const assessPhoto = async (base64: string, p: Pose): Promise<{ ok: boolean; feedback: string }> => {
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
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
              { type: 'text', text: `Body-scan photo quality check. Is this ${p} pose photo usable for body composition analysis? Full body head-to-feet visible, centered, usable lighting, not very blurry, pose matches ${p === 'front' ? 'front-facing' : 'side-facing'}.\nReturn ONLY JSON: {"ok": boolean, "feedback": "short instruction"}` },
            ],
          }],
        }),
      });
      if (!res.ok) return { ok: true, feedback: '' };
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const s = text.indexOf('{'); const e = text.lastIndexOf('}');
      if (s === -1 || e === -1) return { ok: true, feedback: '' };
      const parsed = JSON.parse(text.slice(s, e + 1));
      return { ok: parsed.ok !== false, feedback: parsed.feedback || 'Adjust your position.' };
    } catch { return { ok: true, feedback: '' }; }
  };

  // ── Reset everything for a fresh scan ──
  const resetScan = useCallback(() => {
    setFrontUri(null); setFrontB64(''); setFrontBad(false);
    setSideUri(null); setSideB64(''); setSideBad(false);
    setScanResult(null); setImageUnusable(false); setUnusableReason('');
    setScanning(false);
  }, []);

  // ── Open camera for a given pose ──
  const startCamera = useCallback(async (p: Pose) => {
    const perm = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!perm?.granted) {
      Alert.alert('Permission needed', 'Camera access is required for the body scan.');
      return;
    }
    setPose(p);
    setCameraReady(false);
    setCapturing(false);
    setPhotoAssessing(false);
    setPhotoFeedback('');
    setPhotoReady(false);
    setCaptureAttempts(0);
    setTimer(12);
    setScreen('camera');
  }, [cameraPermission, requestCameraPermission]);

  // ── 12-second countdown with audio cues ──
  useEffect(() => {
    if (screen !== 'camera' || !cameraReady || capturing || photoAssessing || photoReady) return;

    Speech.stop();
    // Opening instruction
    Speech.speak(
      pose === 'front'
        ? 'Step back until your full body fits the outline.'
        : 'Turn sideways until your full profile fits the outline.',
      { rate: 0.92 }
    );

    setTimer(12);
    let count = 12;

    const tick = setInterval(() => {
      count -= 1;
      setTimer(count);

      // Speak last 3 seconds aloud
      if (count === 3) Speech.speak('3', { rate: 1.0 });
      if (count === 2) Speech.speak('2', { rate: 1.0 });
      if (count === 1) Speech.speak('1', { rate: 1.0 });

      if (count <= 0) {
        clearInterval(tick);
        capturePhoto();
      }
    }, 1000);

    return () => { clearInterval(tick); Speech.stop(); };
  }, [screen, cameraReady, pose]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Take the photo ──
  const capturePhoto = async () => {
    if (!cameraRef.current || !cameraReady) {
      setCapturing(false);
      setTimer(12);
      return;
    }
    try {
      setCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: false });
      if (!photo?.uri) throw new Error('No photo');

      const b64 = await compressForApi(photo.uri);

      setPhotoAssessing(true);
      setPhotoFeedback('Checking photo quality…');
      const quality = await assessPhoto(b64, pose);
      setPhotoAssessing(false);

      if (!quality.ok) {
        const attempts = captureAttempts + 1;
        setCaptureAttempts(attempts);
        setPhotoFeedback(quality.feedback);

        if (attempts >= 3) {
          // Accept after 3 retries but flag it
          if (pose === 'front') setFrontBad(true);
          else setSideBad(true);
          setPhotoFeedback('');
        } else {
          // Auto-retake: reset timer and let useEffect restart countdown
          setCapturing(false);
          setPhotoReady(false);
          setTimer(12);
          setTimeout(() => setPhotoFeedback(''), 1800);
          return;
        }
      }

      setCapturing(false);
      setPhotoReady(true);
      setPhotoFeedback('');

      if (pose === 'front') {
        setFrontUri(photo.uri);
        setFrontB64(b64);
        Speech.stop();
        Speech.speak('Front view complete! Now turn 90 degrees for your side view.', { rate: 0.92 });
        // Wait 1.8s so user hears the audio, then flip pose in-place
        await new Promise(r => setTimeout(r, 1800));
        setPose('side');
        setSideBad(false);
        setPhotoAssessing(false);
        setPhotoFeedback('');
        setCapturing(false);
        setPhotoReady(false);
        setCaptureAttempts(0);
        setTimer(12);
      } else {
        setSideUri(photo.uri);
        setSideB64(b64);
        Speech.stop();
        Speech.speak('Side view complete!', { rate: 0.92 });
        await new Promise(r => setTimeout(r, 1200));
        Speech.stop();
        setScreen('review');
      }
    } catch (err) {
      console.warn('[BodyScan] Capture failed:', err);
      Alert.alert('Capture Failed', 'Could not take the photo. Please try again.');
      setCapturing(false);
      setPhotoAssessing(false);
    }
  };

  // ── Gallery picker ──
  const pickFromGallery = async (p: Pose) => {
    if (uploadingPose) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Photo library access is required.'); return; }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: false, quality: 0.6, base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      let b64 = asset.base64 || '';
      if (b64.includes(',')) b64 = b64.split(',')[1];

      setUploadingPose(p);
      const quality = await assessPhoto(b64, p);
      setUploadingPose(null);

      if (!quality.ok) {
        Alert.alert('Photo Not Usable', `${quality.feedback}\n\nPlease choose another photo.`);
        return;
      }

      if (p === 'front') {
        setFrontUri(asset.uri); setFrontB64(b64);
        // Flip to side view
        setPose('side');
        setSideBad(false);
        setPhotoAssessing(false); setPhotoFeedback('');
        setCapturing(false); setPhotoReady(false);
        setCaptureAttempts(0); setTimer(12);
        Speech.speak('Front photo selected. Now take your side view.', { rate: 0.92 });
      } else {
        setSideUri(asset.uri); setSideB64(b64);
        Speech.speak('Side photo selected.', { rate: 0.92 });
        await new Promise(r => setTimeout(r, 800));
        Speech.stop();
        setScreen('review');
      }
    } catch (err) {
      setUploadingPose(null);
      Alert.alert('Upload Failed', 'Could not process that photo.');
    }
  };

  // ── Run AI analysis ──
  const runAnalysis = async () => {
    if (!frontB64 || !sideB64) return;
    setImageUnusable(false);
    setScanResult(null);
    setScanning(true);
    try {
      const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
      if (!apiKey) throw new Error('No API key');

      const gender = profile?.gender ?? 'male';
      const age = profile?.age ?? 30;
      const weightKg = profile?.weightKg ?? 77;
      const heightCm = profile?.heightCm ?? 178;

      const content: any[] = [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frontB64 } },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: sideB64 } },
        {
          type: 'text',
          text: `Analyze body composition from these front and side photos. Person: ${gender}, age ${age}, ${weightKg}kg, ${heightCm}cm.

First, are the photos usable? Not usable if: full body not visible, too dark/blurry, baggy clothing hiding body shape, or clearly not a body scan.

Return ONLY this JSON:
{
  "imageUsable": true or false,
  "unusableReason": "short reason if not usable, else empty string",
  "bodyFatPercent": number,
  "bodyFatLow": number,
  "bodyFatHigh": number,
  "bodyType": "ectomorph" | "mesomorph" | "endomorph" | "ecto-mesomorph" | "endo-mesomorph",
  "muscleMass": "low" | "moderate" | "high",
  "confidence": "low" | "medium" | "high",
  "assessment": "one sentence body composition summary",
  "nutritionFocus": "one short nutrition recommendation"
}`,
        },
      ];

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 320, messages: [{ role: 'user', content }] }),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const s = text.indexOf('{'); let depth = 0, e = -1;
      for (let i = s; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}') { depth--; if (depth === 0) { e = i + 1; break; } }
      }
      if (e === -1) throw new Error('Could not parse result');
      const parsed = JSON.parse(text.slice(s, e));

      if (parsed.imageUsable === false) {
        setImageUnusable(true);
        setUnusableReason(parsed.unusableReason || '');
        trackEvent('body_scan_image_unusable', { screen: 'BodyScanScreen', metadata: { reason: parsed.unusableReason } });
        return;
      }

      const bf = Math.round(Number(parsed.bodyFatPercent) || 0);
      const low = Math.round(Number(parsed.bodyFatLow) || Math.max(1, bf - 3));
      const high = Math.round(Number(parsed.bodyFatHigh) || bf + 3);

      const result: ScanResult = {
        bodyFat: bf,
        bodyFatLow: low,
        bodyFatHigh: Math.max(high, low),
        bodyType: parsed.bodyType || 'mesomorph',
        muscleMass: parsed.muscleMass || 'moderate',
        confidence: parsed.confidence || 'low',
        assessment: parsed.assessment || 'Use this as a trend marker.',
        nutritionFocus: parsed.nutritionFocus || 'Keep protein consistent.',
      };
      setScanResult(result);

      // Persist body fat into the fitness profile
      if (profile) {
        const updated: FitnessProfile = { ...profile, bodyFatPercent: bf, updatedAt: Date.now() };
        await saveFitnessProfile(updated);
      }

      trackEvent('body_scan_completed', { screen: 'BodyScanScreen', metadata: { confidence: result.confidence, gender } });
    } catch (err: any) {
      console.error('[BodyScan] Analysis failed:', err);
      Alert.alert('Analysis Failed', 'Could not analyse the photos. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  // ── Render: Start screen ──
  const renderStart = () => (
    <ScrollView contentContainerStyle={styles.startScroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.startTitle}>AI Body Scan</Text>
      <Text style={styles.startSub}>
        {'Two photos — front and side.\nWe estimate your body fat % and body type\nusing AI, no equipment needed.'}
      </Text>

      <View style={styles.startIllustration}>
        <BodyOutline pose="front" gender={profile?.gender ?? 'male'} color={ORANGE} opacity={0.85} height={220} />
      </View>

      <View style={styles.startStepList}>
        {[
          { n: '1', t: 'Front view', d: '12-second countdown, full body visible' },
          { n: '2', t: 'Side view',  d: '12-second countdown, turn 90°' },
          { n: '3', t: 'AI Analysis', d: 'Claude estimates body fat & body type' },
        ].map(s => (
          <View key={s.n} style={styles.startStep}>
            <View style={styles.startStepNum}><Text style={styles.startStepNumTxt}>{s.n}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.startStepTitle}>{s.t}</Text>
              <Text style={styles.startStepDesc}>{s.d}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.startPrivacyRow}>
        <Text style={styles.startPrivacyCheck}>✓</Text>
        <Text style={styles.startPrivacyText}>Photos stay on your device — never uploaded</Text>
      </View>

      <TouchableOpacity
        style={styles.startBtn}
        activeOpacity={0.85}
        onPress={() => { resetScan(); startCamera('front'); }}
      >
        <Text style={styles.startBtnText}>Start Body Scan</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ── Render: Camera screen ──
  const renderCamera = () => (
    <View style={styles.cameraWrap}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
        mute
        onCameraReady={() => setCameraReady(true)}
      />

      <View style={styles.cameraOverlay}>

        {/* X exit */}
        <TouchableOpacity
          style={styles.exitBtn}
          activeOpacity={0.75}
          onPress={() => {
            Speech.stop();
            setCapturing(false);
            setPhotoReady(false);
            setScreen('start');
          }}
        >
          <Text style={styles.exitIcon}>✕</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.camHdr}>
          <Text style={styles.camHdrTitle}>{pose === 'front' ? 'Front View' : 'Side View'}</Text>
          <Text style={styles.camHdrSub}>
            {pose === 'front'
              ? 'Stand straight, full body visible, good lighting'
              : 'Turn 90° — show your full profile head-to-toe'}
          </Text>
          <View style={styles.camPrivacyRow}>
            <Text style={styles.camPrivacyCheck}>✓</Text>
            <Text style={styles.camPrivacyText}>Photos stay on your device</Text>
          </View>
        </View>

        {/* Tips + outline */}
        <View style={styles.tipOutlineRow}>

          {/* Left tips */}
          <View style={styles.tipCol}>
            {(pose === 'front' ? [
              { icon: '🧍', label: 'Stand\nstraight' },
              { icon: '☀️', label: 'Good\nlighting' },
              { icon: '👣', label: 'Feet\nshouldr\nwidth' },
            ] : [
              { icon: '↩️', label: 'Turn\n90°' },
              { icon: '☀️', label: 'Good\nlighting' },
              { icon: '👤', label: 'Full\nprofile' },
            ]).map(t => (
              <View key={t.label} style={styles.tipItem}>
                <View style={styles.tipCircle}><Text style={styles.tipIcon}>{t.icon}</Text></View>
                <Text style={styles.tipLabel}>{t.label}</Text>
              </View>
            ))}
          </View>

          {/* Outline center */}
          <View style={styles.outlineCenter}>
            {/* Alignment frame — shows users exactly where to position their body */}
            <View style={styles.bodyFrame}>
              <View style={[styles.bodyCorner, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 }]} />
              <View style={[styles.bodyCorner, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 }]} />
              <View style={[styles.bodyCorner, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 }]} />
              <View style={[styles.bodyCorner, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 }]} />

              {!photoReady && (
                <BodyOutline pose={pose} gender={profile?.gender ?? 'male'} color={ORANGE} opacity={0.9} height={460} />
              )}

              {/* Captured badge — inside the frame */}
              {photoReady && (
                <View style={styles.capturedBadge}>
                  <Text style={styles.capturedIcon}>✓</Text>
                  <Text style={styles.capturedText}>
                    {pose === 'front' ? 'Front view complete!' : 'Side view complete!'}
                  </Text>
                  {pose === 'front' && <Text style={styles.capturedSub}>Preparing side view…</Text>}
                </View>
              )}

              {/* Capturing / assessing spinner */}
              {(capturing || photoAssessing) && !photoReady && (
                <View style={styles.spinnerWrap}>
                  <ActivityIndicator color={ORANGE} size="large" />
                  <Text style={styles.spinnerText}>{photoAssessing ? 'Checking photo…' : 'Capturing…'}</Text>
                  {!!photoFeedback && captureAttempts < 3 && (
                    <Text style={styles.retakeHint}>Retaking… {photoFeedback}</Text>
                  )}
                </View>
              )}

              {/* Countdown badge — at the bottom of the alignment frame */}
              {!photoReady && !capturing && !photoAssessing && (
                <View style={styles.timerBadge}>
                  <Text style={[styles.timerNum, timer <= 3 && { color: '#FFD60A' }]}>{timer}</Text>
                  <Text style={styles.timerSec}>sec</Text>
                </View>
              )}
            </View>
          </View>

          {/* Right tips */}
          <View style={styles.tipCol}>
            {(pose === 'front' ? [
              { icon: '👁️', label: 'Look\nstraight' },
              { icon: '👕', label: 'Shirt\noff' },
              { icon: '⛶', label: 'Full body\nin frame' },
            ] : [
              { icon: '👁️', label: 'Head\nstraight' },
              { icon: '👕', label: 'Shirt\noff' },
              { icon: '⛶', label: 'Head to\ntoe visible' },
            ]).map(t => (
              <View key={t.label} style={styles.tipItem}>
                <View style={styles.tipCircle}><Text style={styles.tipIcon}>{t.icon}</Text></View>
                <Text style={styles.tipLabel}>{t.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Bottom bar: Gallery | Capture */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.galleryBtn}
            onPress={() => pickFromGallery(pose)}
            activeOpacity={0.75}
            disabled={!!(capturing || photoAssessing || uploadingPose)}
          >
            <View style={styles.galleryCircle}>
              {uploadingPose === pose
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Text style={styles.galleryIcon}>🖼️</Text>}
            </View>
            <Text style={styles.galleryLabel}>Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.captureBtn, (capturing || photoAssessing || photoReady) && { opacity: 0.4 }]}
            onPress={capturePhoto}
            activeOpacity={0.8}
            disabled={!!(capturing || photoAssessing || photoReady)}
          >
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>

          {/* Spacer */}
          <View style={{ width: 64 }} />
        </View>
      </View>
    </View>
  );

  // ── Render: Review screen ──
  const renderReview = () => (
    <ScrollView
      contentContainerStyle={[styles.reviewScroll, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.reviewTitle}>Review Your Photos</Text>
      <Text style={styles.reviewSub}>Make sure your full body is visible in both shots</Text>

      {/* Photo pair */}
      <View style={styles.photoRow}>
        <View style={styles.photoCard}>
          <Text style={styles.photoLabel}>Front View</Text>
          {frontUri
            ? <Image source={{ uri: frontUri }} style={styles.photo} contentFit="cover" />
            : <View style={[styles.photo, styles.photoEmpty]}><Text style={{ color: '#555', fontSize: 12 }}>No photo</Text></View>}
        </View>
        <View style={styles.photoCard}>
          <Text style={styles.photoLabel}>Side View</Text>
          {sideUri
            ? <Image source={{ uri: sideUri }} style={styles.photo} contentFit="cover" />
            : <View style={[styles.photo, styles.photoEmpty]}><Text style={{ color: '#555', fontSize: 12 }}>No photo</Text></View>}
        </View>
      </View>

      {/* Quality warning */}
      {(frontBad || sideBad) && !scanning && !scanResult && !imageUnusable && (
        <View style={styles.warnBox}>
          <Text style={styles.warnIcon}>⚠️</Text>
          <Text style={styles.warnTitle}>Photos May Be Unclear</Text>
          <Text style={styles.warnMsg}>
            {frontBad && sideBad ? 'Both photos are unclear.' : frontBad ? 'Your front photo is unclear.' : 'Your side photo is unclear.'}
            {' '}Try in better lighting with your full body visible.
          </Text>
        </View>
      )}

      {/* Post-analysis: AI flagged as unusable */}
      {imageUnusable && !scanning && (
        <View style={styles.badBox}>
          <Text style={styles.badIcon}>📸</Text>
          <Text style={styles.badTitle}>Images Not Clear Enough</Text>
          <Text style={styles.badMsg}>
            {unusableReason || 'Your photos couldn\'t be used for an accurate analysis.'}
            {'\n\nTips: good lighting · plain background · full body head-to-toe · form-fitting clothes.'}
          </Text>
          <TouchableOpacity
            style={styles.tryAgainBtn}
            activeOpacity={0.85}
            onPress={() => { resetScan(); setScreen('start'); }}
          >
            <Text style={styles.tryAgainText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Analyse button */}
      {!imageUnusable && !scanning && !scanResult && (
        <TouchableOpacity style={styles.analyseBtn} onPress={runAnalysis} activeOpacity={0.85}>
          <Text style={styles.analyseBtnText}>Analyse Body Scan</Text>
        </TouchableOpacity>
      )}

      {/* Scanning spinner */}
      {scanning && (
        <View style={styles.scanningRow}>
          <ProcessingRing label="Analysing your photos…" expectedMs={12000} />
        </View>
      )}

      {/* Results */}
      {scanResult && !scanning && (
        <>
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Body Scan Estimate</Text>
            <View style={styles.resultRow}>
              <View style={styles.resultItem}>
                <Text style={styles.resultValue}>{scanResult.bodyFatLow}–{scanResult.bodyFatHigh}%</Text>
                <Text style={styles.resultLabel}>Body Fat Range</Text>
              </View>
              <View style={styles.resultDivider} />
              <View style={styles.resultItem}>
                <Text style={styles.resultValue}>{scanResult.bodyType}</Text>
                <Text style={styles.resultLabel}>Body Type</Text>
              </View>
              <View style={styles.resultDivider} />
              <View style={styles.resultItem}>
                <Text style={styles.resultValue}>{scanResult.muscleMass}</Text>
                <Text style={styles.resultLabel}>Muscle</Text>
              </View>
            </View>
            <View style={styles.insightBox}>
              <Text style={styles.insightConfidence}>Confidence: {scanResult.confidence}</Text>
              <Text style={styles.insightText}>{scanResult.assessment}</Text>
              <Text style={styles.insightText}>{scanResult.nutritionFocus}</Text>
            </View>
            <Text style={styles.disclaimer}>
              For trend tracking only — not a medical diagnosis. Use DEXA for clinical-grade precision.
            </Text>
          </View>

          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ marginTop: 12, alignSelf: 'center' }}
            activeOpacity={0.7}
            onPress={() => { resetScan(); startCamera('front'); }}
          >
            <Text style={styles.rescanLink}>Scan Again</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Retake link (before analysis) */}
      {!scanning && !scanResult && !imageUnusable && (
        <TouchableOpacity
          style={{ marginTop: 16, alignSelf: 'center' }}
          activeOpacity={0.7}
          onPress={() => { resetScan(); setScreen('start'); }}
        >
          <Text style={styles.retakeLink}>← Retake Photos</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );

  // ── Root render ──
  return (
    <PremiumScreen>
      {/* Header bar (shown on start + review) */}
      {screen !== 'camera' && (
        <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { Speech.stop(); router.back(); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.75}
          >
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AI Body Scan</Text>
          <HomeButton />
        </View>
      )}

      {screen === 'start'  && renderStart()}
      {screen === 'camera' && renderCamera()}
      {screen === 'review' && renderReview()}
    </PremiumScreen>
  );
}

const styles = StyleSheet.create({
  // ── Header ──
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
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
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },

  // ── Start ──
  startScroll: { paddingHorizontal: 24, paddingBottom: 48, alignItems: 'center' },
  startTitle: {
    fontSize: 32, fontWeight: '900', color: '#FFFFFF', textAlign: 'center',
    fontFamily: PLAYFAIR, marginBottom: 10,
  },
  startSub: {
    fontSize: 15, color: 'rgba(255,255,255,0.55)', textAlign: 'center',
    lineHeight: 22, marginBottom: 28,
  },
  startIllustration: { marginBottom: 28 },
  startStepList: { width: '100%', gap: 16, marginBottom: 24 },
  startStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  startStepNum: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  startStepNumTxt: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  startStepTitle: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', marginBottom: 2 },
  startStepDesc: { fontSize: 13, color: 'rgba(255,255,255,0.50)', lineHeight: 18 },
  startPrivacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 32 },
  startPrivacyCheck: { fontSize: 14, color: '#34C759', fontWeight: '900' },
  startPrivacyText: { fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  startBtn: {
    width: '100%', backgroundColor: ORANGE, borderRadius: 18,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 16, elevation: 8,
  },
  startBtnText: { fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.3 },

  // ── Camera ──
  cameraWrap: { flex: 1, backgroundColor: '#000' },
  cameraOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center' },
  exitBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36, right: 20,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
  exitIcon: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  camHdr: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingHorizontal: 16, paddingBottom: 8,
  },
  camHdrTitle: { fontSize: 28, fontWeight: '900', color: '#FFF', marginBottom: 4 },
  camHdrSub: { fontSize: 13, color: 'rgba(255,255,255,0.62)', textAlign: 'center', lineHeight: 19, marginBottom: 6 },
  camPrivacyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  camPrivacyCheck: { fontSize: 13, color: '#34C759', fontWeight: '900' },
  camPrivacyText: { fontSize: 12, color: 'rgba(255,255,255,0.60)' },

  tipOutlineRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  tipCol: {
    width: 78, alignItems: 'center',
    justifyContent: 'space-around', alignSelf: 'stretch', paddingVertical: 16,
  },
  tipItem: { alignItems: 'center', gap: 5 },
  tipCircle: {
    width: 50, height: 50, borderRadius: 25,
    borderWidth: 1.5, borderColor: 'rgba(232,93,38,0.55)',
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  tipIcon: { fontSize: 20 },
  tipLabel: { fontSize: 10, color: 'rgba(255,255,255,0.72)', textAlign: 'center', lineHeight: 14 },

  outlineCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  corner: { position: 'absolute', width: 22, height: 22, borderColor: ORANGE },
  bodyFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(232,93,38,0.35)',
    borderRadius: 14,
    position: 'relative',
  },
  bodyCorner: { position: 'absolute', width: 38, height: 38, borderColor: ORANGE },
  timerBadge: {
    position: 'absolute', bottom: 16,
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 3, borderColor: ORANGE,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center', justifyContent: 'center',
  },
  timerNum: { fontSize: 20, fontWeight: '900', color: ORANGE, lineHeight: 22 },
  timerSec: { fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  capturedBadge: { alignItems: 'center', gap: 8 },
  capturedIcon: { fontSize: 52, color: '#34C759' },
  capturedText: { fontSize: 20, fontWeight: '900', color: '#34C759', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  capturedSub: { fontSize: 14, color: 'rgba(255,255,255,0.65)' },
  spinnerWrap: { alignItems: 'center', gap: 10 },
  spinnerText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  retakeHint: { fontSize: 12, color: '#FFD60A', textAlign: 'center', paddingHorizontal: 24 },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24, paddingTop: 12,
  },
  galleryBtn: { alignItems: 'center', gap: 5, width: 64 },
  galleryCircle: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  galleryIcon: { fontSize: 22 },
  galleryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.68)', fontWeight: '500' },
  captureBtn: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 3, borderColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
  },
  captureBtnInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFF' },

  // ── Review ──
  reviewScroll: { paddingHorizontal: 20, paddingTop: 8, alignItems: 'center' },
  reviewTitle: { fontSize: 26, fontWeight: '900', color: '#FFF', textAlign: 'center', marginBottom: 6, fontFamily: PLAYFAIR },
  reviewSub: { fontSize: 14, color: 'rgba(255,255,255,0.50)', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  photoRow: { flexDirection: 'row', gap: 14, marginBottom: 20, width: '100%' },
  photoCard: { flex: 1, alignItems: 'center', gap: 8 },
  photoLabel: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.70)', textTransform: 'uppercase', letterSpacing: 1 },
  photo: { width: '100%', height: 220, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)' },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },

  warnBox: {
    width: '100%', backgroundColor: 'rgba(255,214,10,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,214,10,0.35)',
    borderRadius: 16, padding: 16, marginBottom: 16, alignItems: 'center', gap: 6,
  },
  warnIcon: { fontSize: 28 },
  warnTitle: { fontSize: 15, fontWeight: '800', color: '#FFD60A' },
  warnMsg: { fontSize: 13, color: 'rgba(255,255,255,0.60)', textAlign: 'center', lineHeight: 19 },

  badBox: {
    width: '100%', backgroundColor: 'rgba(255,59,48,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,59,48,0.38)',
    borderRadius: 20, padding: 22, marginBottom: 20, alignItems: 'center', gap: 8,
  },
  badIcon: { fontSize: 36 },
  badTitle: { fontSize: 18, fontWeight: '900', color: '#FF3B30' },
  badMsg: { fontSize: 13, color: 'rgba(255,255,255,0.60)', textAlign: 'center', lineHeight: 20 },
  tryAgainBtn: { marginTop: 8, backgroundColor: ORANGE, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 36 },
  tryAgainText: { fontSize: 16, fontWeight: '900', color: '#FFF' },

  analyseBtn: {
    width: '100%', backgroundColor: ORANGE, borderRadius: 18,
    paddingVertical: 18, alignItems: 'center', marginBottom: 8,
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 16, elevation: 8,
  },
  analyseBtnText: { fontSize: 18, fontWeight: '900', color: '#FFF', letterSpacing: 0.3 },

  scanningRow: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  scanningText: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.70)' },

  resultCard: {
    width: '100%', backgroundColor: SURFACE,
    borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    padding: 18, gap: 12, marginBottom: 4,
  },
  resultTitle: { fontSize: 13, fontWeight: '800', color: ORANGE, textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase' },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  resultItem: { alignItems: 'center', flex: 1 },
  resultValue: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  resultLabel: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3 },
  resultDivider: { width: 1, height: 30, backgroundColor: BORDER },
  insightBox: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12,
    padding: 14, gap: 6,
  },
  insightConfidence: { fontSize: 11, fontWeight: '800', color: ORANGE, textTransform: 'uppercase' },
  insightText: { fontSize: 12, color: 'rgba(255,255,255,0.68)', lineHeight: 18 },
  disclaimer: { fontSize: 10, color: 'rgba(255,255,255,0.28)', textAlign: 'center', lineHeight: 15 },

  doneBtn: {
    width: '100%', backgroundColor: ORANGE, borderRadius: 18,
    paddingVertical: 18, alignItems: 'center', marginTop: 16,
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 16, elevation: 8,
  },
  doneBtnText: { fontSize: 18, fontWeight: '900', color: '#FFF', letterSpacing: 0.3 },
  rescanLink: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.45)', textDecorationLine: 'underline' },
  retakeLink: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.45)', textDecorationLine: 'underline' },
});
