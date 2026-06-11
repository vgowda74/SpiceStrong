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
import { normalizeDietType, type DietType } from '../../src/utils/dietPreference';
import { getSavedMacroTargets } from '../../services/fitnessProfileService';
import { checkLimit, recordUsage, type LimitCheck } from '../../services/subscriptionService';
import { trackEvent } from '../../services/analyticsService';
import PaywallModal from '../../components/PaywallModal';
import { getProductTier, type TierInfo } from '../../src/data/proteinTiers';
import { PremiumScreen } from '../../components/PremiumScreen';
import { HomeButton } from '../../components/HomeButton';

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok || res.status < 500 || attempt === maxRetries) return res;
    await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
  }
  return fetch(url, options);
}

const ORANGE = '#8F3A1F';
const SURFACE = 'rgba(248,241,232,0.08)';
const BORDER = 'rgba(248,241,232,0.12)';
const GREEN = '#22C55E';
const YELLOW = '#F59E0B';
const RED = '#EF4444';
const PLAYFAIR = Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'PlayfairDisplay_700Bold', default: 'serif' });

// Presentation for the veg/vegan diet badge shown on scan results.
const DIET_BADGE: Record<DietType, { emoji: string; label: string; color: string }> = {
  vegan: { emoji: '🌱', label: 'Vegan', color: '#16A34A' },
  vegetarian: { emoji: '🟢', label: 'Vegetarian', color: GREEN },
  'non-vegetarian': { emoji: '🔴', label: 'Non-Vegetarian', color: RED },
  unknown: { emoji: '⚪', label: "Can't confirm — check ingredients", color: '#9CA3AF' },
};

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
  dietType: DietType;
  dietReason: string;
}

interface HealthScore {
  total: number;
  proteinScore: number;
  sugarSodiumScore: number;
  processingScore: number;
  cleanScore: number;
  cleanFlags: string[];
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
  const [barcodeReady, setBarcodeReady] = useState(false);
  const [barcodeLookupError, setBarcodeLookupError] = useState<string | null>(null);
  const scanLockRef = useRef(false);
  const barcodeOpenRef = useRef(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallCheck, setPaywallCheck] = useState<LimitCheck | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [labelData, setLabelData] = useState<LabelData | null>(null);
  const [healthScore, setHealthScore] = useState<HealthScore | null>(null);
  const [dietaryViolations, setDietaryViolations] = useState<string[]>([]);
  const [dailyPct, setDailyPct] = useState<DailyTargetPct | null>(null);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    barcodeOpenRef.current = barcodeOpen;
  }, [barcodeOpen]);

  useEffect(() => {
    if (!barcodeOpen) return;
    const timer = setTimeout(() => setBarcodeReady(true), 6000);
    return () => clearTimeout(timer);
  }, [barcodeOpen, barcodeScanned]);

  const pickImage = async (useCamera: boolean) => {
    // Freemium limit check
    const limitResult = await checkLimit('scan');
    if (!limitResult.allowed) { setPaywallCheck(limitResult); setPaywallVisible(true); return; }

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
    setBarcodeLookupError(null);
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
      const res = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
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
  "allergens": ["milk", "soy", "wheat"],
  "dietType": "vegan" | "vegetarian" | "non-vegetarian" | "unknown",
  "dietReason": "Short reason, e.g. 'Contains gelatin' or 'All plant-based ingredients'"
}

If the image is NOT a nutrition label, return: {"identified": false}

Rules:
- Read EXACT values from the label — do not estimate
- Use per-serving values
- CRITICAL: Read the ENTIRE ingredients list — this is just as important as the nutrition numbers. Look for the fine print text that starts with "Ingredients:" and list EVERY single ingredient.
- Separate out additives from the ingredients: artificial colors (Red 40, Yellow 5, Blue 1), preservatives (sodium benzoate, potassium sorbate, BHA, BHT), artificial sweeteners (sucralose, aspartame, acesulfame potassium), emulsifiers, and chemical-sounding additives go in "additives"
- List allergen warnings in "allergens" (look for "Contains:" or bold allergens in ingredients)
- If ingredients text is visible but hard to read, try your best — partial extraction is better than empty
- DIET CLASSIFICATION (dietType) — be careful and honest:
  - "non-vegetarian": contains any meat, poultry, fish, seafood, or animal-derived ingredient like gelatin, rennet (non-microbial), carmine/cochineal (E120), lard, tallow, isinglass, anchovy, fish sauce, animal fat, L-cysteine from feathers/hair.
  - "vegetarian": no meat/fish, but contains dairy, eggs, honey, or other animal-byproducts that are acceptable to vegetarians (milk, cheese, whey, casein, butter, ghee, egg, honey).
  - "vegan": contains NO animal-derived ingredients at all — fully plant-based.
  - "unknown": ONLY use when an ingredient is genuinely ambiguous and you cannot tell its source (e.g. "natural flavors", "mono- and diglycerides", unspecified "lecithin", "vitamin D3", "enzymes"). When unsure, prefer "unknown" over guessing "vegan". NEVER label something "vegan" unless you are confident.
  - dietReason: one short phrase naming the deciding ingredient(s) or "All plant-based ingredients".`,
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
        dietType: normalizeDietType(parsed.dietType),
        dietReason: typeof parsed.dietReason === 'string' ? parsed.dietReason : '',
      };
      setLabelData(label);
      recordUsage('scan');
      trackEvent('scan_label', {
        screen: 'ScanLabelScreen',
        metadata: { method: 'photo', dietType: label.dietType },
      });

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
      const summaryRes = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
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
      const msg = err?.message || '';
      setError(
        msg.includes('502') || msg.includes('503') || msg.includes('529')
          ? 'Server is busy — please try again in a moment.'
          : 'Could not read the label. Try a clearer photo.'
      );
    } finally {
      setScanning(false);
    }
  };

  // Map Open Food Facts ingredients-analysis tags → our DietType.
  const dietTypeFromOFFTags = (tags?: string[]): DietType => {
    if (!Array.isArray(tags)) return 'unknown';
    if (tags.includes('en:non-vegetarian')) return 'non-vegetarian';
    if (tags.includes('en:vegan')) return 'vegan';
    if (tags.includes('en:vegetarian')) return 'vegetarian';
    return 'unknown';
  };

  // ── Health Score Calculation ──
  // ── Barcode lookup via Edamam Food Database ──
  const handleBarcodeScan = async (barcode: string) => {
    if (scanLockRef.current) return;
    // Freemium limit check
    const limitResult = await checkLimit('scan');
    if (!limitResult.allowed) { setPaywallCheck(limitResult); setPaywallVisible(true); setBarcodeOpen(false); return; }

    scanLockRef.current = true;
    setBarcodeScanned(true);
    // Keep camera visible during lookup — only close on success
    setScanning(true);
    setError(null);

    try {
      const appId = process.env.EXPO_PUBLIC_EDAMAM_FOOD_APP_ID;
      const appKey = process.env.EXPO_PUBLIC_EDAMAM_FOOD_APP_KEY;
      if (!appId || !appKey) throw new Error('Edamam Food DB keys not configured');

      console.log(`[SpiceStrong] Barcode lookup: ${barcode}`);

      let label: LabelData | null = null;

      // ── Check Supabase cache first (instant, free) ──
      try {
        const { supabase } = require('../../services/supabase');
        const { data: cached } = await supabase.from('barcode_cache').select('*').eq('barcode', barcode).maybeSingle();
        if (cached && cached.product_name) {
          console.log(`[SpiceStrong] Barcode cache HIT: ${cached.product_name}`);
          label = {
            productName: cached.product_name,
            servingSize: cached.serving_size || '1 serving',
            calories: cached.calories || 0,
            proteinG: cached.protein_g || 0,
            carbsG: cached.carbs_g || 0,
            fatG: cached.fat_g || 0,
            saturatedFatG: cached.saturated_fat_g || 0,
            transFatG: cached.trans_fat_g || 0,
            fiberG: cached.fiber_g || 0,
            sugarG: cached.sugar_g || 0,
            addedSugarG: 0,
            sodiumMg: cached.sodium_mg || 0,
            cholesterolMg: cached.cholesterol_mg || 0,
            ingredients: cached.ingredients || [],
            additives: cached.additives || [],
            allergens: cached.allergens || [],
            dietType: normalizeDietType(cached.diet_type),
            dietReason: cached.diet_reason || '',
          };
        }
      } catch (e) {
        console.log('[SpiceStrong] Barcode cache lookup failed (non-blocking):', e);
      }

      // Helper: scale per-100g values to per-serving
      const scale100gToServing = (per100g: number, servingGrams: number) =>
        Math.round((per100g * servingGrams / 100) * 10) / 10;

      // ── Try Edamam Food Database (only if not cached) ──
      if (!label) try {
        const url = `https://api.edamam.com/api/food-database/v2/parser?app_id=${appId}&app_key=${appKey}&upc=${barcode}`;
        const res = await fetch(url);
        console.log(`[SpiceStrong] Edamam status: ${res.status}`);
        if (res.status === 429) console.warn('[SpiceStrong] Edamam RATE LIMIT hit — check your monthly quota at developer.edamam.com');
        if (res.ok) {
          const data = await res.json();
          if (data.hints && data.hints.length > 0) {
            const food = data.hints[0].food;
            const nutrients = food.nutrients || {};
            // Edamam nutrients are per 100g; convert to per-serving
            const servingInfo = food.servingSizes?.[0];
            const servingG = servingInfo?.quantity || 100;
            const servingLabel = servingInfo?.label || '100g';
            label = {
              productName: food.label || food.knownAs || 'Unknown Product',
              servingSize: servingLabel,
              calories: Math.round((nutrients.ENERC_KCAL || 0) * servingG / 100),
              proteinG: scale100gToServing(nutrients.PROCNT || 0, servingG),
              carbsG: scale100gToServing(nutrients.CHOCDF || 0, servingG),
              fatG: scale100gToServing(nutrients.FAT || 0, servingG),
              saturatedFatG: scale100gToServing(nutrients.FASAT || 0, servingG),
              transFatG: scale100gToServing(nutrients.FATRN || 0, servingG),
              fiberG: scale100gToServing(nutrients.FIBTG || 0, servingG),
              sugarG: scale100gToServing(nutrients.SUGAR || 0, servingG),
              addedSugarG: 0,
              sodiumMg: Math.round((nutrients.NA || 0) * servingG / 100),
              cholesterolMg: Math.round((nutrients.CHOLE || 0) * servingG / 100),
              ingredients: [],
              additives: [],
              allergens: food.foodContentsLabel ? food.foodContentsLabel.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : [],
              dietType: 'unknown',
              dietReason: '',
            };
            console.log(`[SpiceStrong] Edamam hit: ${label.productName} (serving: ${servingG}g)`);
          }
        }
      } catch (e) {
        console.log('[SpiceStrong] Edamam lookup failed, trying fallback', e);
      }

      // ── Fallback: Open Food Facts (free, huge barcode DB) ──
      if (!label) {
        try {
          const offRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
          if (offRes.ok) {
            const offData = await offRes.json();
            if (offData.status === 1 && offData.product) {
              const p = offData.product;
              const n = p.nutriments || {};
              // Prefer per-serving fields; fall back to scaling per-100g
              const hasServing = !!(n['energy-kcal_serving'] || n.proteins_serving);
              const servingG = parseFloat(p.serving_quantity) || 100;
              label = {
                productName: p.product_name || p.generic_name || 'Unknown Product',
                servingSize: p.serving_size || p.quantity || '100g',
                calories: Math.round(hasServing
                  ? (n['energy-kcal_serving'] || (n.energy_serving ? n.energy_serving / 4.184 : 0))
                  : ((n['energy-kcal_100g'] || (n.energy_100g ? n.energy_100g / 4.184 : 0)) * servingG / 100)),
                proteinG: hasServing
                  ? Math.round((n.proteins_serving || 0) * 10) / 10
                  : scale100gToServing(n.proteins_100g || 0, servingG),
                carbsG: hasServing
                  ? Math.round((n.carbohydrates_serving || 0) * 10) / 10
                  : scale100gToServing(n.carbohydrates_100g || 0, servingG),
                fatG: hasServing
                  ? Math.round((n.fat_serving || 0) * 10) / 10
                  : scale100gToServing(n.fat_100g || 0, servingG),
                saturatedFatG: hasServing
                  ? Math.round((n['saturated-fat_serving'] || 0) * 10) / 10
                  : scale100gToServing(n['saturated-fat_100g'] || 0, servingG),
                transFatG: hasServing
                  ? Math.round((n['trans-fat_serving'] || 0) * 10) / 10
                  : scale100gToServing(n['trans-fat_100g'] || 0, servingG),
                fiberG: hasServing
                  ? Math.round((n.fiber_serving || 0) * 10) / 10
                  : scale100gToServing(n.fiber_100g || 0, servingG),
                sugarG: hasServing
                  ? Math.round((n.sugars_serving || 0) * 10) / 10
                  : scale100gToServing(n.sugars_100g || 0, servingG),
                addedSugarG: 0,
                sodiumMg: hasServing
                  ? Math.round((n.sodium_serving || 0) * 1000)
                  : Math.round((n.sodium_100g || 0) * 1000 * servingG / 100),
                cholesterolMg: hasServing
                  ? Math.round((n.cholesterol_serving || 0) * 1000)
                  : Math.round((n.cholesterol_100g || 0) * 1000 * servingG / 100),
                ingredients: p.ingredients_text ? p.ingredients_text.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : [],
                additives: p.additives_tags ? p.additives_tags.map((t: string) => t.replace('en:', '')) : [],
                allergens: p.allergens_tags ? p.allergens_tags.map((t: string) => t.replace('en:', '')) : [],
                dietType: dietTypeFromOFFTags(p.ingredients_analysis_tags),
                dietReason: '',
              };
              console.log(`[SpiceStrong] Open Food Facts hit: ${label.productName} (serving: ${p.serving_size || 'per 100g'})`);
            }
          }
        } catch (e) {
          console.log('[SpiceStrong] Open Food Facts lookup failed', e);
        }
      }

      if (!label) throw new Error('not_food');

      // Save to Supabase cache (non-blocking, saves cost for future scans)
      try {
        const { supabase } = require('../../services/supabase');
        supabase.from('barcode_cache').upsert({
          barcode,
          product_name: label.productName,
          serving_size: label.servingSize,
          calories: label.calories,
          protein_g: label.proteinG,
          carbs_g: label.carbsG,
          fat_g: label.fatG,
          saturated_fat_g: label.saturatedFatG,
          trans_fat_g: label.transFatG,
          fiber_g: label.fiberG,
          sugar_g: label.sugarG,
          sodium_mg: label.sodiumMg,
          cholesterol_mg: label.cholesterolMg,
          ingredients: label.ingredients,
          additives: label.additives,
          allergens: label.allergens,
          diet_type: label.dietType,
          diet_reason: label.dietReason,
          source: 'api',
        }, { onConflict: 'barcode' }).then(({ error }: any) => {
          if (error) console.warn('[SpiceStrong] Barcode cache save failed:', error.message);
          else console.log(`[SpiceStrong] Barcode cached: ${barcode} → ${label!.productName}`);
        });
      } catch {}

      // Lookup succeeded — close the camera and show results
      scanLockRef.current = true;
      setBarcodeOpen(false);
      setBarcodeLookupError(null);
      setLabelData(label);
      recordUsage('scan');
      trackEvent('scan_label', { screen: 'ScanLabelScreen', metadata: { method: 'barcode', dietType: label.dietType } });
      const score = calculateHealthScore(label);
      setHealthScore(score);

      // Secondary enrichment — don't let failures here trigger the "not found" alert
      try {
        const dietary = await getDietaryRestrictions();
        setDietaryViolations(checkDietaryViolations(label, dietary));
      } catch (e) { console.log('[SpiceStrong] Dietary check failed', e); }

      try {
        const targets = await getSavedMacroTargets();
        if (targets) {
          setDailyPct({
            calories: Math.round((label.calories / targets.calories) * 100),
            proteinG: Math.round((label.proteinG / targets.proteinG) * 100),
            carbsG: Math.round((label.carbsG / targets.carbsG) * 100),
            fatG: Math.round((label.fatG / targets.fatG) * 100),
          });
        }
      } catch (e) { console.log('[SpiceStrong] Macro targets failed', e); }

      try {
        const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
        if (apiKey) {
          const summaryRes = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
            body: JSON.stringify({
              model: ANTHROPIC_MODEL,
              max_tokens: 300,
              messages: [{ role: 'user', content: `You are a brutally honest fitness nutritionist. Assess this product using the Protein Source Quality framework below.

PROTEIN TIER SYSTEM:
- S-Tier (Supreme): Highest protein, very low fat/calories. Examples: chicken breast, turkey, tuna in water, whey isolate, egg whites.
- A-Tier (Excellent): Very high quality, slightly less lean. Examples: lean ground beef 93/7, shrimp, non-fat Greek yogurt, white fish, cottage cheese, tofu.
- B-Tier (Good): Good protein but more fat or lower density. Examples: whole eggs, salmon, lean pork, lamb, lentils.
- C-Tier (Average): Protein with significant fats/carbs. Examples: protein bars, ground beef 80/20, beans, cheese.
- D-Tier (Low): Perceived as protein but primarily fat. Examples: peanut butter, nuts, sausage, bacon.
- F-Tier (Skip): Low protein, high fat/sugar. Examples: hot dogs, fried chicken, nuggets, processed junk.

PRODUCT: ${label.productName}
Per serving: ${label.calories} cal, ${label.proteinG}g protein, ${label.carbsG}g carbs, ${label.fatG}g fat, ${label.sugarG}g sugar, ${label.sodiumMg}mg sodium
Protein density: ${label.calories > 0 ? ((label.proteinG / label.calories) * 100).toFixed(1) : 0}g per 100 cal
Calories per 25g protein: ${label.proteinG > 0 ? Math.round((25 / label.proteinG) * label.calories) : 'N/A (no protein)'}

Give a 2-3 sentence verdict. Include:
- Which tier this product falls into (S/A/B/C/D)
- Calories needed to get 25g protein from this product
- Whether this helps or hurts fitness goals — be direct, no sugarcoating
Start with ✅ if good (S/A tier) or ⚠️ if concerning (B or below).` }],
            }),
          });
          if (summaryRes.ok) {
            const sd = await summaryRes.json();
            setAiSummary(sd.content?.[0]?.text || '');
          }
        }
      } catch (e) { console.log('[SpiceStrong] AI summary failed', e); }
    } catch (err: any) {
      if (!barcodeOpenRef.current) return;
      setBarcodeScanned(false);
      setBarcodeReady(false);
      scanLockRef.current = false;
      if (err?.message === 'not_food') {
        setBarcodeLookupError('Product not found — try scanning the label photo instead.');
      } else {
        console.error('[SpiceStrong] Barcode lookup error:', err?.message);
        setBarcodeLookupError('Lookup failed — try again or scan the label photo.');
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

    // Processing score (15%)
    const additiveCount = label.additives.length;
    const hasIngredients = label.ingredients.length > 0;
    const processingScore = additiveCount === 0
      ? (hasIngredients ? 100 : 70)
      : additiveCount <= 2 ? 70 : additiveCount <= 5 ? 40 : 10;

    // Clean Ingredients score (20%) — Bobby Approved style
    // Scans ingredients + additives for harmful compounds
    const allIngredientText = [...label.ingredients, ...label.additives].join(' ').toLowerCase();
    const cleanFlags: string[] = [];
    let cleanPenalty = 0;

    // Seed oils (refined industrial oils — inflammatory)
    const seedOils = ['canola', 'soybean oil', 'sunflower oil', 'safflower', 'corn oil', 'grapeseed', 'cottonseed', 'vegetable oil', 'rapeseed'];
    seedOils.forEach((oil) => {
      if (allIngredientText.includes(oil)) { cleanFlags.push(`Seed oil (${oil})`); cleanPenalty += 15; }
    });

    // High-fructose corn syrup
    if (/high.fructose|hfcs|corn syrup/i.test(allIngredientText)) { cleanFlags.push('High-fructose corn syrup'); cleanPenalty += 25; }

    // Artificial sweeteners
    const sweeteners = ['sucralose', 'aspartame', 'acesulfame', 'saccharin', 'neotame', 'advantame'];
    sweeteners.forEach((s) => {
      if (allIngredientText.includes(s)) { cleanFlags.push(`Artificial sweetener (${s})`); cleanPenalty += 15; }
    });

    // Artificial colors
    const colors = ['red 40', 'red #40', 'yellow 5', 'yellow #5', 'yellow 6', 'blue 1', 'blue #1', 'fd&c'];
    colors.forEach((c) => {
      if (allIngredientText.includes(c)) { cleanFlags.push(`Artificial color (${c})`); cleanPenalty += 20; }
    });

    // Preservatives
    const preservatives = ['bha', 'bht', 'tbhq', 'sodium benzoate', 'potassium sorbate', 'sodium nitrite', 'sodium nitrate'];
    preservatives.forEach((p) => {
      if (allIngredientText.includes(p)) { cleanFlags.push(`Preservative (${p})`); cleanPenalty += 10; }
    });

    // Natural flavors (vague, often hides chemicals)
    if (/natural flavor|artificial flavor/i.test(allIngredientText)) { cleanFlags.push('"Natural flavors"'); cleanPenalty += 5; }

    // Other flags
    if (allIngredientText.includes('carrageenan')) { cleanFlags.push('Carrageenan'); cleanPenalty += 5; }
    if (allIngredientText.includes('maltodextrin')) { cleanFlags.push('Maltodextrin'); cleanPenalty += 5; }
    if (allIngredientText.includes('monosodium glutamate') || allIngredientText.includes('msg')) { cleanFlags.push('MSG'); cleanPenalty += 5; }

    // If no ingredients were read, give a neutral 70 (can't assess)
    const cleanScore = !hasIngredients
      ? 70
      : Math.max(0, 100 - cleanPenalty);

    // Dietary compliance score (10%)
    const dietaryScore = 100;

    const total = Math.round(
      proteinScore * 0.35 +
      sugarSodiumScore * 0.20 +
      processingScore * 0.15 +
      cleanScore * 0.20 +
      dietaryScore * 0.10
    );

    let color = GREEN, label2 = 'Excellent', emoji = '🟢';
    if (total < 75) { color = YELLOW; label2 = 'Good'; emoji = '🟡'; }
    if (total < 50) { color = ORANGE; label2 = 'Poor'; emoji = '🟠'; }
    if (total < 20) { color = RED; label2 = 'Bad'; emoji = '🔴'; }

    return { total, proteinScore, sugarSodiumScore, processingScore, cleanScore, cleanFlags, dietaryScore, color, label: label2, emoji };
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
    <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Label</Text>
        <HomeButton />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>

        {/* Camera/Barcode buttons */}
        {!imageUri && !scanning && !labelData && (
          <View style={styles.uploadSection}>
            <Text style={styles.uploadEmoji}>🔍</Text>
            <Text style={styles.uploadTitle}>Check Any Product</Text>
            <Text style={styles.uploadSub}>Photograph the full label — the Nutrition Facts panel and the ingredients list together</Text>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.cameraBtn} onPress={() => pickImage(true)} activeOpacity={0.8}>
                <Text style={styles.cameraBtnText}>📷 Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.galleryBtn} onPress={() => pickImage(false)} activeOpacity={0.8}>
                <Text style={styles.galleryBtnText}>🖼️ Upload Photo</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>📸 For an accurate report, include:</Text>
              <Text style={styles.tipLine}>✓  The full Nutrition Facts panel</Text>
              <Text style={styles.tipLine}>✓  The complete Ingredients list &amp; “Contains…” line</Text>
              <Text style={styles.tipLine}>✓  Good lighting, label filling the frame, no glare</Text>
              <Text style={styles.tipNote}>The ingredients list is how we detect additives, allergens, and whether it’s Veg / Vegan.</Text>
            </View>
          </View>
        )}

        {/* Barcode Scanner Modal */}
        <Modal visible={barcodeOpen} animationType="slide" onRequestClose={() => setBarcodeOpen(false)}>
          <View style={styles.barcodeContainer}>
            <CameraView
              style={styles.barcodeCamera}
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
              onBarcodeScanned={(!barcodeReady || barcodeScanned) ? undefined : (result) => {
                if (result.data && result.data.length >= 8) {
                  handleBarcodeScan(result.data);
                }
              }}
            />
            <View style={styles.barcodeOverlay}>
              <View style={styles.barcodeCrosshair} />
              <Text style={styles.barcodeHint}>
                {barcodeScanned ? 'Looking up product...' : (barcodeReady ? 'Scanning automatically...' : 'Line up the barcode in the frame')}
              </Text>
              {barcodeLookupError && <Text style={styles.barcodeErrorText}>{barcodeLookupError}</Text>}
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
                {[
                  {
                    label: '💪 Protein Density',
                    value: healthScore.proteinScore,
                    color: healthScore.proteinScore >= 64 ? GREEN : healthScore.proteinScore >= 40 ? YELLOW : RED,
                    info: 'Measures grams of protein per 100 calories. Higher = more muscle-building fuel per calorie. SpiceStrong standard is 6.4g per 100 cal. S-Tier proteins like chicken breast score 100%.',
                  },
                  {
                    label: '🍬 Sugar & Sodium',
                    value: healthScore.sugarSodiumScore,
                    color: healthScore.sugarSodiumScore >= 60 ? GREEN : healthScore.sugarSodiumScore >= 30 ? YELLOW : RED,
                    info: 'Penalizes excess sugar (>12g/serving) and sodium (>800mg/serving). WHO recommends <25g sugar and <2000mg sodium daily. High scores mean low sugar and sodium — ideal for fitness.',
                  },
                  {
                    label: '🏭 Processing',
                    value: healthScore.processingScore,
                    color: healthScore.processingScore >= 70 ? GREEN : healthScore.processingScore >= 40 ? YELLOW : RED,
                    info: 'Rates how many artificial additives are in the product. Fewer additives = higher score. Products with 0 additives and a clean ingredient list score 100%. More than 5 additives drops to 10%.',
                  },
                  {
                    label: '🌿 Clean Ingredients',
                    value: healthScore.cleanScore,
                    color: healthScore.cleanScore >= 70 ? GREEN : healthScore.cleanScore >= 40 ? YELLOW : RED,
                    info: 'Scans for harmful ingredients that sabotage fitness goals: seed oils (canola, soybean), artificial sweeteners (sucralose, aspartame), artificial colors (Red 40), preservatives (BHA, BHT), and high-fructose corn syrup. Each harmful ingredient lowers the score.',
                  },
                ].map((row) => (
                  <TouchableOpacity
                    key={row.label}
                    style={styles.scoreRow}
                    onPress={() => Alert.alert(row.label.replace(/^.\s/, ''), row.info)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.scoreRowLabel}>{row.label}</Text>
                    <View style={styles.scoreBarBg}>
                      <View style={[styles.scoreBarFill, { width: `${row.value}%`, backgroundColor: row.color }]} />
                    </View>
                    <Text style={styles.scoreRowVal}>{row.value}%</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {healthScore.cleanFlags.length > 0 && (
                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#FF6B6B', letterSpacing: 0.5, marginBottom: 6 }}>⚠️ RED FLAGS</Text>
                  {healthScore.cleanFlags.slice(0, 5).map((flag, i) => (
                    <Text key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', marginTop: 2 }}>• {flag}</Text>
                  ))}
                </View>
              )}
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

            {/* Protein Tier Badge */}
            {(() => {
              const tier = getProductTier(labelData.productName, labelData.proteinG, labelData.calories);
              const calPer25g = labelData.proteinG > 0 ? Math.round((25 / labelData.proteinG) * labelData.calories) : 0;
              return (
                <View style={[styles.proteinCard, { borderColor: tier.color + '50' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <View style={{ backgroundColor: tier.color + '20', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1.5, borderColor: tier.color + '40' }}>
                      <Text style={{ fontSize: 20, fontWeight: '900', color: tier.color }}>{tier.tier}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: tier.color }}>{tier.emoji} {tier.label} Protein</Text>
                      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 2 }}>{tier.description}</Text>
                    </View>
                  </View>
                  {labelData.proteinG > 0 && (
                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.70)', marginTop: 4 }}>
                      {calPer25g} calories to get 25g protein from this product
                    </Text>
                  )}
                </View>
              );
            })()}

            {/* Nutrition Facts */}
            <View style={styles.nutritionCard}>
              <Text style={styles.cardTitle}>Nutrition Facts</Text>
              <Text style={styles.servingSize}>Serving: {labelData.servingSize}</Text>

              {/* Diet type — shown for all users (e.g. checking if a protein powder is vegan) */}
              {(() => {
                const badge = DIET_BADGE[labelData.dietType];
                return (
                  <View style={[styles.dietBadge, { borderColor: badge.color + '40', backgroundColor: badge.color + '14' }]}>
                    <Text style={styles.dietBadgeEmoji}>{badge.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dietBadgeLabel, { color: badge.color }]}>{badge.label}</Text>
                      {!!labelData.dietReason && (
                        <Text style={styles.dietBadgeReason}>{labelData.dietReason}</Text>
                      )}
                    </View>
                  </View>
                );
              })()}

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
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} limitCheck={paywallCheck} onUpgrade={() => { setPaywallVisible(false); /* TODO: IAP */ }} />
    </PremiumScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
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
  tipsCard: { marginTop: 22, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', padding: 16 },
  tipsTitle: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.80)', marginBottom: 10 },
  tipLine: { fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 22 },
  tipNote: { fontSize: 12, color: ORANGE, marginTop: 10, lineHeight: 18, fontWeight: '600' },

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
  barcodeErrorText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    marginHorizontal: 28,
    textAlign: 'center',
    lineHeight: 18,
    backgroundColor: 'rgba(239,68,68,0.78)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    overflow: 'hidden',
  },
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
  dietBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, marginTop: 12, marginBottom: 4 },
  dietBadgeEmoji: { fontSize: 20 },
  dietBadgeLabel: { fontSize: 15, fontWeight: '800' },
  dietBadgeReason: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 1 },
  scoreBreakdown: { gap: 8 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreRowLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.55)', width: 120 },
  scoreBarBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  scoreBarFill: { height: 6, borderRadius: 3 },
  scoreRowVal: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.60)', minWidth: 42, textAlign: 'right' },

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
