/**
 * ScanLabelScreen.tsx — SpiceStrong
 * Nutrition label scanner — scan any packaged food to check health quality.
 * - Reads nutrition facts from photo
 * - Health score (0-100) with color badges
 * - Protein density check (6.4g/100cal)
 * - Dietary restriction flags from user profile
 * - % of daily fitness targets
 * - Additive/processing level warnings
 * - AI health summary personalized to fitness goals
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
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
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getDietaryRestrictions } from '../../services/dietaryService';
import { getSavedMacroTargets } from '../../services/fitnessProfileService';

const ORANGE = '#E85D26';
const BG = '#0F0F0F';
const SURFACE = '#1A1A1A';
const BORDER = 'rgba(255,255,255,0.08)';
const GREEN = '#22C55E';
const YELLOW = '#F59E0B';
const RED = '#EF4444';
const PLAYFAIR = Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'PlayfairDisplay_700Bold', default: 'serif' });

interface LabelData {
  productName: string;
  servingSize: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  saturatedFatG: number;
  transFatG: number;
  fiberG: number;
  sugarG: number;
  addedSugarG: number;
  sodiumMg: number;
  cholesterolMg: number;
  ingredients: string[];
  additives: string[];
  allergens: string[];
}

interface HealthScore {
  total: number;
  proteinScore: number;
  sugarSodiumScore: number;
  processingScore: number;
  dietaryScore: number;
  color: string;
  label: string;
  emoji: string;
}

interface DailyTargetPct {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export default function ScanLabelScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [labelData, setLabelData] = useState<LabelData | null>(null);
  const [healthScore, setHealthScore] = useState<HealthScore | null>(null);
  const [dietaryViolations, setDietaryViolations] = useState<string[]>([]);
  const [dailyPct, setDailyPct] = useState<DailyTargetPct | null>(null);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const pickImage = async (useCamera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      base64: false,
    };
    let result: ImagePicker.ImagePickerResult;
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      result = await ImagePicker.launchCameraAsync(opts);
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      result = await ImagePicker.launchImageLibraryAsync(opts);
    }
    if (!result.canceled && result.assets?.[0]) {
      setImageUri(result.assets[0].uri);
      setLabelData(null);
      setHealthScore(null);
      setError(null);
      setAiSummary('');
      analyzeLabelImage(result.assets[0].uri);
    }
  };

  const analyzeLabelImage = async (uri: string) => {
    setScanning(true);
    setError(null);
    try {
      // Compress image
      const manipulated = await manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.5, format: SaveFormat.JPEG, base64: true },
      );
      const b64 = manipulated.base64 || '';

      const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
      if (!apiKey) throw new Error('No API key');

      // Step 1: Extract label data
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
          max_tokens: 1500,
          system: `You are a nutrition label reader. Extract ALL information from this nutrition facts label photo.

Return ONLY this JSON:
{
  "identified": true,
  "productName": "Product name if visible, or 'Unknown Product'",
  "servingSize": "e.g. 1 cup (240ml)",
  "calories": number,
  "proteinG": number,
  "carbsG": number,
  "fatG": number,
  "saturatedFatG": number,
  "transFatG": number,
  "fiberG": number,
  "sugarG": number,
  "addedSugarG": number,
  "sodiumMg": number,
  "cholesterolMg": number,
  "ingredients": ["ingredient1", "ingredient2"],
  "additives": ["Red 40", "Sodium Benzoate"],
  "allergens": ["milk", "soy", "wheat"]
}

If the image is NOT a nutrition label, return: {"identified": false}

Rules:
- Read EXACT values from the label — do not estimate
- Use per-serving values
- List ALL ingredients if the ingredient list is visible
- Flag any food additives, artificial colors, preservatives separately in "additives"
- List allergen warnings in "allergens"`,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
              { type: 'text', text: 'Read this nutrition label. Extract all values, ingredients, additives, and allergens.' },
            ],
          }],
        }),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const start = text.indexOf('{');
      let depth = 0, end = -1;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end === -1) throw new Error('Could not parse label');
      const parsed = JSON.parse(text.slice(start, end));

      if (!parsed.identified) {
        setError('This doesn\'t look like a nutrition label. Try a clearer photo of the Nutrition Facts panel.');
        setScanning(false);
        return;
      }

      const label: LabelData = {
        productName: parsed.productName || 'Unknown Product',
        servingSize: parsed.servingSize || '',
        calories: Number(parsed.calories) || 0,
        proteinG: Number(parsed.proteinG) || 0,
        carbsG: Number(parsed.carbsG) || 0,
        fatG: Number(parsed.fatG) || 0,
        saturatedFatG: Number(parsed.saturatedFatG) || 0,
        transFatG: Number(parsed.transFatG) || 0,
        fiberG: Number(parsed.fiberG) || 0,
        sugarG: Number(parsed.sugarG) || 0,
        addedSugarG: Number(parsed.addedSugarG) || 0,
        sodiumMg: Number(parsed.sodiumMg) || 0,
        cholesterolMg: Number(parsed.cholesterolMg) || 0,
        ingredients: parsed.ingredients || [],
        additives: parsed.additives || [],
        allergens: parsed.allergens || [],
      };
      setLabelData(label);

      // Step 2: Calculate health score
      const score = calculateHealthScore(label);
      setHealthScore(score);

      // Step 3: Check dietary restrictions
      const dietary = await getDietaryRestrictions();
      const violations = checkDietaryViolations(label, dietary);
      setDietaryViolations(violations);

      // Step 4: Calculate % of daily targets
      const targets = await getSavedMacroTargets();
      if (targets) {
        setDailyPct({
          calories: Math.round((label.calories / targets.calories) * 100),
          proteinG: Math.round((label.proteinG / targets.proteinG) * 100),
          carbsG: Math.round((label.carbsG / targets.carbsG) * 100),
          fatG: Math.round((label.fatG / targets.fatG) * 100),
        });
      }

      // Step 5: Generate AI health summary
      const summaryRes = await fetch('https://api.anthropic.com/v1/messages', {
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
          messages: [{ role: 'user', content: `You are a fitness nutrition expert. Give a 2-3 sentence health assessment of this product for someone focused on high-protein fitness nutrition.

Product: ${label.productName}
Per serving (${label.servingSize}): ${label.calories} cal, ${label.proteinG}g protein, ${label.carbsG}g carbs, ${label.fatG}g fat, ${label.sugarG}g sugar, ${label.sodiumMg}mg sodium
Protein density: ${label.calories > 0 ? ((label.proteinG / label.calories) * 100).toFixed(1) : 0}g per 100 cal (SpiceStrong standard: 6.4)
Additives: ${label.additives.length > 0 ? label.additives.join(', ') : 'None detected'}
${violations.length > 0 ? `Dietary violations: ${violations.join(', ')}` : ''}

Be direct. Start with ✅ if good choice or ⚠️ if concerning. Mention specific numbers.` }],
        }),
      });
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setAiSummary(summaryData.content?.[0]?.text || '');
      }
    } catch (err: any) {
      console.error('[SpiceStrong] Label scan failed:', err);
      setError(err?.message || 'Could not read the label. Try a clearer photo.');
    } finally {
      setScanning(false);
    }
  };

  // ── Health Score Calculation ──
  // ── Barcode lookup via Edamam Food Database ──
  const handleBarcodeScan = async (barcode: string) => {
    if (barcodeScanned) return;
    setBarcodeScanned(true);
    setBarcodeOpen(false);
    setScanning(true);
    setError(null);

    try {
      const appId = process.env.EXPO_PUBLIC_EDAMAM_FOOD_APP_ID;
      const appKey = process.env.EXPO_PUBLIC_EDAMAM_FOOD_APP_KEY;
      if (!appId || !appKey) throw new Error('Edamam Food DB keys not configured');

      // Look up barcode in Edamam Food Database
      const url = `https://api.edamam.com/api/food-database/v2/parser?app_id=${appId}&app_key=${appKey}&upc=${barcode}`;
      console.log(`[SpiceStrong] Barcode lookup: ${barcode}`);

      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) throw new Error('not_food');
        throw new Error(`Edamam ${res.status}`);
      }
      const data = await res.json();

      if (!data.hints || data.hints.length === 0) {
        throw new Error('not_food');
      }

      const food = data.hints[0].food;
      const nutrients = food.nutrients || {};

      const label: LabelData = {
        productName: food.label || food.knownAs || 'Unknown Product',
        servingSize: food.servingSizes?.[0]?.label || '1 serving',
        calories: Math.round(nutrients.ENERC_KCAL || 0),
        proteinG: Math.round((nutrients.PROCNT || 0) * 10) / 10,
        carbsG: Math.round((nutrients.CHOCDF || 0) * 10) / 10,
        fatG: Math.round((nutrients.FAT || 0) * 10) / 10,
        saturatedFatG: Math.round((nutrients.FASAT || 0) * 10) / 10,
        transFatG: Math.round((nutrients.FATRN || 0) * 10) / 10,
        fiberG: Math.round((nutrients.FIBTG || 0) * 10) / 10,
        sugarG: Math.round((nutrients.SUGAR || 0) * 10) / 10,
        addedSugarG: 0,
        sodiumMg: Math.round(nutrients.NA || 0),
        cholesterolMg: Math.round(nutrients.CHOLE || 0),
        ingredients: [],
        additives: [],
        allergens: food.foodContentsLabel ? food.foodContentsLabel.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : [],
      };

      setLabelData(label);
      const score = calculateHealthScore(label);
      setHealthScore(score);

      const dietary = await getDietaryRestrictions();
      setDietaryViolations(checkDietaryViolations(label, dietary));

      const targets = await getSavedMacroTargets();
      if (targets) {
        setDailyPct({
          calories: Math.round((label.calories / targets.calories) * 100),
          proteinG: Math.round((label.proteinG / targets.proteinG) * 100),
          carbsG: Math.round((label.carbsG / targets.carbsG) * 100),
          fatG: Math.round((label.fatG / targets.fatG) * 100),
        });
      }

      // AI summary
      const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
      if (apiKey) {
        const summaryRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 300,
            messages: [{ role: 'user', content: `Fitness nutrition expert — 2-3 sentence assessment for high-protein fitness nutrition. Product: ${label.productName}. Per serving: ${label.calories} cal, ${label.proteinG}g protein, ${label.carbsG}g carbs, ${label.fatG}g fat, ${label.sugarG}g sugar, ${label.sodiumMg}mg sodium. Protein density: ${label.calories > 0 ? ((label.proteinG / label.calories) * 100).toFixed(1) : 0}g per 100 cal. Start with ✅ if good or ⚠️ if concerning.` }],
          }),
        });
        if (summaryRes.ok) {
          const sd = await summaryRes.json();
          setAiSummary(sd.content?.[0]?.text || '');
        }
      }
    } catch (err: any) {
      if (err?.message === 'not_food') {
        setError('This product wasn\'t found in our food database. It may not be a food item, or try scanning the nutrition label instead.');
      } else {
        setError(err?.message || 'Could not look up this barcode.');
      }
    } finally {
      setScanning(false);
    }
  };

  function calculateHealthScore(label: LabelData): HealthScore {
    // Protein density score (40%)
    const density = label.calories > 0 ? (label.proteinG / label.calories) * 100 : 0;
    const proteinScore = Math.min(100, Math.round((density / 6.4) * 100));

    // Sugar & sodium score (25%)
    // WHO: <25g added sugar/day, <2000mg sodium/day
    const sugarPenalty = Math.min(100, Math.round((label.sugarG / 12) * 100)); // 12g per serving = bad
    const sodiumPenalty = Math.min(100, Math.round((label.sodiumMg / 800) * 100)); // 800mg per serving = bad
    const sugarSodiumScore = Math.max(0, 100 - Math.round((sugarPenalty + sodiumPenalty) / 2));

    // Processing score (20%)
    const additiveCount = label.additives.length;
    const processingScore = additiveCount === 0 ? 100 : additiveCount <= 2 ? 70 : additiveCount <= 5 ? 40 : 10;

    // Dietary compliance score (15%)
    // Will be adjusted after checking restrictions
    const dietaryScore = 100; // Default — updated after dietary check

    const total = Math.round(
      proteinScore * 0.40 +
      sugarSodiumScore * 0.25 +
      processingScore * 0.20 +
      dietaryScore * 0.15
    );

    let color = GREEN, label2 = 'Excellent', emoji = '🟢';
    if (total < 75) { color = YELLOW; label2 = 'Good'; emoji = '🟡'; }
    if (total < 50) { color = ORANGE; label2 = 'Poor'; emoji = '🟠'; }
    if (total < 20) { color = RED; label2 = 'Bad'; emoji = '🔴'; }

    return { total, proteinScore, sugarSodiumScore, processingScore, dietaryScore, color, label: label2, emoji };
  }

  // ── Dietary Restriction Check ──
  function checkDietaryViolations(label: LabelData, dietary: { dietaryTags: string[]; allergenTags: string[] }): string[] {
    const violations: string[] = [];
    const allText = [...label.ingredients, ...label.allergens].join(' ').toLowerCase();

    for (const tag of dietary.allergenTags) {
      const t = tag.toLowerCase();
      if (t.includes('gluten') && /wheat|barley|rye|gluten/i.test(allText)) violations.push(`Contains gluten (you selected Gluten free)`);
      if (t.includes('dairy') && /milk|cream|cheese|butter|whey|casein|lactose/i.test(allText)) violations.push(`Contains dairy (you selected Dairy free)`);
      if (t.includes('nut') && /almond|cashew|walnut|peanut|pistachio|hazelnut|pecan/i.test(allText)) violations.push(`Contains nuts (you selected Nut free)`);
      if (t.includes('soy') && /soy|soybean|tofu|edamame/i.test(allText)) violations.push(`Contains soy (you selected Soy free)`);
      if (t.includes('egg') && /egg/i.test(allText)) violations.push(`Contains egg (you selected Egg free)`);
      if (t.includes('shellfish') && /shrimp|prawn|crab|lobster/i.test(allText)) violations.push(`Contains shellfish (you selected Shellfish free)`);
      if (t.includes('vegetarian') && /meat|chicken|beef|pork|fish|gelatin/i.test(allText)) violations.push(`Contains animal products (you selected Vegetarian)`);
      if (t.includes('vegan') && /milk|cream|cheese|egg|honey|whey|casein|gelatin/i.test(allText)) violations.push(`Contains animal-derived ingredients (you selected Vegan)`);
    }

    return violations;
  }

  // ── Processing Level Badge ──
  function getProcessingLevel(additives: string[]): { label: string; color: string; emoji: string } {
    if (additives.length === 0) return { label: 'Clean', color: GREEN, emoji: '🌿' };
    if (additives.length <= 2) return { label: 'Moderate', color: YELLOW, emoji: '⚡' };
    return { label: 'Ultra-Processed', color: RED, emoji: '🏭' };
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Label</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>

        {/* Camera/Barcode buttons */}
        {!imageUri && !scanning && !labelData && (
          <View style={styles.uploadSection}>
            <Text style={styles.uploadEmoji}>🔍</Text>
            <Text style={styles.uploadTitle}>Check Any Product</Text>
            <Text style={styles.uploadSub}>Photograph the nutrition label & ingredients list, or scan the barcode</Text>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.cameraBtn} onPress={() => pickImage(true)} activeOpacity={0.8}>
                <Text style={styles.cameraBtnText}>📷 Photo Label</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.galleryBtn} onPress={async () => {
                if (!cameraPermission?.granted) {
                  const perm = await requestCameraPermission();
                  if (!perm.granted) { Alert.alert('Permission needed', 'Camera access required for barcode scanning.'); return; }
                }
                setBarcodeScanned(false);
                setBarcodeOpen(true);
              }} activeOpacity={0.8}>
                <Text style={styles.galleryBtnText}>📊 Scan Barcode</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hintText}>💡 For best results, capture both the Nutrition Facts panel and ingredients list in one photo</Text>
          </View>
        )}

        {/* Barcode Scanner Modal */}
        <Modal visible={barcodeOpen} animationType="slide" onRequestClose={() => setBarcodeOpen(false)}>
          <View style={styles.barcodeContainer}>
            <CameraView
              style={styles.barcodeCamera}
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
              onBarcodeScanned={barcodeScanned ? undefined : (result) => {
                if (result.data) handleBarcodeScan(result.data);
              }}
            />
            <View style={styles.barcodeOverlay}>
              <View style={styles.barcodeCrosshair} />
              <Text style={styles.barcodeHint}>Point at the barcode on the product</Text>
            </View>
            <TouchableOpacity style={styles.barcodeCloseBtn} onPress={() => setBarcodeOpen(false)}>
              <Text style={styles.barcodeCloseBtnText}>✕ Close</Text>
            </TouchableOpacity>
          </View>
        </Modal>

        {/* Scanning */}
        {scanning && (
          <View style={styles.scanningWrap}>
            <ActivityIndicator color={ORANGE} size="large" />
            <Text style={styles.scanningTitle}>Reading nutrition label...</Text>
            <Text style={styles.scanningSub}>Analyzing ingredients, additives, and nutrition facts</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => { setImageUri(null); setError(null); }}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Results */}
        {labelData && healthScore && (
          <>
            {/* Image preview */}
            {imageUri && (
              <Image source={{ uri: imageUri }} style={styles.imagePreview} contentFit="cover" />
            )}

            {/* Health Score Card */}
            <View style={[styles.scoreCard, { borderColor: healthScore.color + '50' }]}>
              <View style={styles.scoreHeader}>
                <Text style={styles.scoreEmoji}>{healthScore.emoji}</Text>
                <View>
                  <Text style={[styles.scoreNumber, { color: healthScore.color }]}>{healthScore.total}</Text>
                  <Text style={styles.scoreOutOf}>/100</Text>
                </View>
                <View style={styles.scoreRight}>
                  <Text style={[styles.scoreLabel, { color: healthScore.color }]}>{healthScore.label}</Text>
                  <Text style={styles.productName}>{labelData.productName}</Text>
                </View>
              </View>

              {/* Score breakdown */}
              <View style={styles.scoreBreakdown}>
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreRowLabel}>💪 Protein Density</Text>
                  <View style={styles.scoreBarBg}><View style={[styles.scoreBarFill, { width: `${healthScore.proteinScore}%`, backgroundColor: healthScore.proteinScore >= 64 ? GREEN : healthScore.proteinScore >= 40 ? YELLOW : RED }]} /></View>
                  <Text style={styles.scoreRowVal}>{healthScore.proteinScore}%</Text>
                </View>
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreRowLabel}>🍬 Sugar & Sodium</Text>
                  <View style={styles.scoreBarBg}><View style={[styles.scoreBarFill, { width: `${healthScore.sugarSodiumScore}%`, backgroundColor: healthScore.sugarSodiumScore >= 60 ? GREEN : healthScore.sugarSodiumScore >= 30 ? YELLOW : RED }]} /></View>
                  <Text style={styles.scoreRowVal}>{healthScore.sugarSodiumScore}%</Text>
                </View>
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreRowLabel}>🏭 Processing</Text>
                  <View style={styles.scoreBarBg}><View style={[styles.scoreBarFill, { width: `${healthScore.processingScore}%`, backgroundColor: healthScore.processingScore >= 70 ? GREEN : healthScore.processingScore >= 40 ? YELLOW : RED }]} /></View>
                  <Text style={styles.scoreRowVal}>{healthScore.processingScore}%</Text>
                </View>
              </View>
            </View>

            {/* SpiceStrong Protein Check */}
            {(() => {
              const density = labelData.calories > 0 ? (labelData.proteinG / labelData.calories) * 100 : 0;
              const passes = density >= 6.4;
              return (
                <View style={[styles.proteinCard, { borderColor: passes ? GREEN + '50' : RED + '50' }]}>
                  <Text style={styles.proteinCardTitle}>{passes ? '✅' : '❌'} SpiceStrong Standard</Text>
                  <Text style={styles.proteinCardValue}>{density.toFixed(1)}g protein per 100 cal</Text>
                  <Text style={styles.proteinCardReq}>{passes ? 'Meets the 6.4g/100cal requirement' : `Below 6.4g/100cal requirement — needs ${((6.4 - density) * labelData.calories / 100).toFixed(0)}g more protein`}</Text>
                </View>
              );
            })()}

            {/* Nutrition Facts */}
            <View style={styles.nutritionCard}>
              <Text style={styles.cardTitle}>Nutrition Facts</Text>
              <Text style={styles.servingSize}>Serving: {labelData.servingSize}</Text>
              {[
                { label: 'Calories', value: `${labelData.calories}`, unit: 'kcal', pct: dailyPct?.calories },
                { label: 'Protein', value: `${labelData.proteinG}g`, unit: '', pct: dailyPct?.proteinG, highlight: true },
                { label: 'Total Carbs', value: `${labelData.carbsG}g`, unit: '', pct: dailyPct?.carbsG },
                { label: 'Total Fat', value: `${labelData.fatG}g`, unit: '', pct: dailyPct?.fatG },
                { label: 'Saturated Fat', value: `${labelData.saturatedFatG}g`, unit: '', indent: true },
                { label: 'Trans Fat', value: `${labelData.transFatG}g`, unit: '', indent: true },
                { label: 'Fiber', value: `${labelData.fiberG}g`, unit: '' },
                { label: 'Sugar', value: `${labelData.sugarG}g`, unit: '' },
                { label: 'Added Sugar', value: `${labelData.addedSugarG}g`, unit: '', indent: true },
                { label: 'Sodium', value: `${labelData.sodiumMg}mg`, unit: '' },
                { label: 'Cholesterol', value: `${labelData.cholesterolMg}mg`, unit: '' },
              ].map((row, i) => (
                <View key={i} style={[styles.nutritionRow, row.indent && { paddingLeft: 24 }]}>
                  <Text style={[styles.nutritionLabel, row.highlight && { color: ORANGE, fontWeight: '800' }]}>{row.label}</Text>
                  <View style={styles.nutritionRight}>
                    <Text style={[styles.nutritionValue, row.highlight && { color: ORANGE }]}>{row.value}</Text>
                    {row.pct != null && <Text style={styles.nutritionPct}>{row.pct}% daily</Text>}
                  </View>
                </View>
              ))}
            </View>

            {/* Processing Level */}
            {(() => {
              const proc = getProcessingLevel(labelData.additives);
              return (
                <View style={styles.processingCard}>
                  <Text style={styles.cardTitle}>{proc.emoji} Processing Level</Text>
                  <Text style={[styles.processingBadge, { color: proc.color }]}>{proc.label}</Text>
                  {labelData.additives.length > 0 && (
                    <View style={styles.additiveList}>
                      <Text style={styles.additiveTitle}>Additives Found:</Text>
                      {labelData.additives.map((a, i) => (
                        <Text key={i} style={styles.additiveItem}>⚠️ {a}</Text>
                      ))}
                    </View>
                  )}
                  {labelData.additives.length === 0 && (
                    <Text style={styles.cleanText}>🌿 No artificial additives detected</Text>
                  )}
                </View>
              );
            })()}

            {/* Dietary Violations */}
            {dietaryViolations.length > 0 && (
              <View style={styles.violationCard}>
                <Text style={styles.cardTitle}>🚫 Dietary Alerts</Text>
                {dietaryViolations.map((v, i) => (
                  <Text key={i} style={styles.violationItem}>{v}</Text>
                ))}
              </View>
            )}

            {/* AI Health Summary */}
            {aiSummary ? (
              <View style={styles.summaryCard}>
                <Text style={styles.cardTitle}>🤖 AI Health Assessment</Text>
                <Text style={styles.summaryText}>{aiSummary}</Text>
              </View>
            ) : null}

            {/* Scan another */}
            <TouchableOpacity style={styles.scanAnotherBtn} onPress={() => { setImageUri(null); setLabelData(null); setHealthScore(null); setError(null); setAiSummary(''); setDietaryViolations([]); setDailyPct(null); }} activeOpacity={0.8}>
              <Text style={styles.scanAnotherText}>Scan Another Label</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  back: { fontSize: 24, color: '#FFFFFF', fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  // Upload
  uploadSection: { alignItems: 'center', paddingTop: 40, gap: 10 },
  uploadEmoji: { fontSize: 64 },
  uploadTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
  uploadSub: { fontSize: 14, color: 'rgba(255,255,255,0.50)', textAlign: 'center', lineHeight: 22 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cameraBtn: { flex: 1, backgroundColor: ORANGE, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cameraBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  galleryBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  galleryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  hintText: { fontSize: 12, color: 'rgba(255,255,255,0.40)', textAlign: 'center', marginTop: 16, lineHeight: 18, paddingHorizontal: 10 },

  // Barcode scanner
  barcodeContainer: { flex: 1, backgroundColor: '#000' },
  barcodeCamera: { flex: 1 },
  barcodeOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  barcodeCrosshair: {
    width: 250,
    height: 150,
    borderWidth: 2,
    borderColor: ORANGE,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  barcodeHint: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', marginTop: 20, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  barcodeCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  barcodeCloseBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  // Scanning
  scanningWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  scanningTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  scanningSub: { fontSize: 13, color: 'rgba(255,255,255,0.50)' },

  // Error
  errorWrap: { alignItems: 'center', paddingTop: 40, gap: 12 },
  errorText: { fontSize: 14, color: RED, textAlign: 'center' },
  retryBtn: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  retryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  // Image preview
  imagePreview: { width: '100%', height: 160, borderRadius: 14, marginBottom: 16 },

  // Health Score Card
  scoreCard: { backgroundColor: SURFACE, borderRadius: 18, borderWidth: 1.5, padding: 18, marginBottom: 14 },
  scoreHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  scoreEmoji: { fontSize: 36 },
  scoreNumber: { fontSize: 42, fontWeight: '900', fontFamily: PLAYFAIR },
  scoreOutOf: { fontSize: 14, color: 'rgba(255,255,255,0.35)', marginTop: -4 },
  scoreRight: { flex: 1, marginLeft: 4 },
  scoreLabel: { fontSize: 18, fontWeight: '800' },
  productName: { fontSize: 13, color: 'rgba(255,255,255,0.50)', marginTop: 2 },
  scoreBreakdown: { gap: 8 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreRowLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.55)', width: 120 },
  scoreBarBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  scoreBarFill: { height: 6, borderRadius: 3 },
  scoreRowVal: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.60)', width: 35, textAlign: 'right' },

  // Protein check
  proteinCard: { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 14, gap: 4 },
  proteinCardTitle: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  proteinCardValue: { fontSize: 20, fontWeight: '800', color: ORANGE },
  proteinCardReq: { fontSize: 12, color: 'rgba(255,255,255,0.50)' },

  // Nutrition facts
  nutritionCard: { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', marginBottom: 10 },
  servingSize: { fontSize: 12, color: 'rgba(255,255,255,0.40)', marginBottom: 10 },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  nutritionLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.70)' },
  nutritionRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nutritionValue: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  nutritionPct: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },

  // Processing
  processingCard: { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 14 },
  processingBadge: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  additiveList: { gap: 4 },
  additiveTitle: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.45)', marginBottom: 4 },
  additiveItem: { fontSize: 13, color: 'rgba(255,255,255,0.65)' },
  cleanText: { fontSize: 14, color: GREEN, fontWeight: '600' },

  // Dietary violations
  violationCard: { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.20)', padding: 16, marginBottom: 14 },
  violationItem: { fontSize: 13, color: RED, fontWeight: '600', marginTop: 4 },

  // AI Summary
  summaryCard: { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 14 },
  summaryText: { fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 22 },

  // Scan another
  scanAnotherBtn: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', marginTop: 8 },
  scanAnotherText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
