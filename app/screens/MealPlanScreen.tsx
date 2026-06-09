/**
 * MealPlanScreen.tsx — SpiceStrong
 * Fancy day-by-day meal plan view.
 * - Day navigator in header (← Month Day, Year →)
 * - Daily macro summary bar (total cal, protein, carbs, fat)
 * - Hero image recipe cards per meal slot, styled like RecipeListScreen
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { File, Directory, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addToMealPlan,
  getMealPlanForDate,
  removeFromMealPlan,
  SLOT_LABELS,
  SLOT_LIMITS,
  type MealPlanEntry,
  type MealSlot,
} from '../../services/mealPlanService';
import { getRecipeById, getCompletionStats, type SavedRecipe } from '../../src/store/recipes';
import { getRecipeImageUrls, saveAIRecipe, uploadRecipeHeroImage, updateRecipeStatus, classifyAndEnrichRecipe } from '../../services/recipeService';
import { loadRecipeImages } from '../../services/imageGenerationService';
import { getRecipeCardImage } from '../../src/data/recipeImages';
import { analyzeMultipleImagesWithEdamam, isEdamamVisionAvailable } from '../../services/edamamVisionService';
import { getFitnessProfile, calculateMacroTargets, type MacroTargets } from '../../services/fitnessProfileService';
import Svg, { Circle } from 'react-native-svg';
import { PremiumScreen } from '../../components/PremiumScreen';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
const MACRO_OVERRIDE_PREFIX = 'spicestrong_macro_override_';

interface MacroOverride {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  photoUri: string;       // first photo (hero)
  photoUris?: string[];   // all photos (for collage display)
}

function detectMediaType(base64: string): string {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

async function hydrateMealPhotos(photos: { uri: string; base64: string }[]) {
  const hydrated = await Promise.all(photos.map(async (photo) => {
    if (photo.base64 && photo.base64.length > 100) return photo;
    try {
      const result = await manipulateAsync(
        photo.uri.split('?')[0],
        [{ resize: { width: 1024 } }],
        { compress: 0.55, format: SaveFormat.JPEG, base64: true },
      );
      return { ...photo, base64: result.base64 ?? '' };
    } catch {
      return photo;
    }
  }));
  return hydrated.filter((p) => p.base64 && p.base64.length > 100);
}

async function persistMealPhotoUris(photos: { uri: string; base64: string }[], prefix: string): Promise<string[]> {
  const dir = new Directory(Paths.document, 'meal_photos');
  try {
    if (!dir.exists) dir.create();
  } catch {}

  const saved: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    let uri = photos[i].uri.split('?')[0];
    if (uri.includes('/meal_photos/')) {
      saved.push(uri);
      continue;
    }
    try {
      const dest = new File(dir, `${prefix}_${Date.now()}_${i}.jpg`);
      if (dest.exists) dest.delete();
      new File(uri).move(dest);
      uri = dest.uri;
    } catch {}
    saved.push(uri);
  }
  return saved;
}

async function recalculateFromComponentsList(components: string[]): Promise<{
  calories: number; caloriesMin: number; caloriesMax: number;
  proteinG: number; carbsG: number; fatG: number;
  confidence: 'high' | 'medium' | 'low';
}> {
  if (!ANTHROPIC_KEY) throw new Error('No API key');
  const list = components.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 250,
      messages: [{
        role: 'user',
        content: `You are a nutrition expert. Calculate total macros for these food items:\n${list}\n\nReturn ONLY this JSON:\n{"calories":0,"caloriesMin":0,"caloriesMax":0,"proteinG":0,"carbsG":0,"fatG":0,"confidence":"medium"}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const parsed = extractFirstJson(data.content?.[0]?.text || '');
  const calories = Math.round(Number(parsed.calories) || 0);
  return {
    calories,
    caloriesMin: Math.round(Number(parsed.caloriesMin) || Math.round(calories * 0.85)),
    caloriesMax: Math.round(Number(parsed.caloriesMax) || Math.round(calories * 1.15)),
    proteinG: Math.round(Number(parsed.proteinG) || 0),
    carbsG: Math.round(Number(parsed.carbsG) || 0),
    fatG: Math.round(Number(parsed.fatG) || 0),
    confidence: parsed.confidence ?? 'medium',
  };
}

function extractFirstJson(text: string): any {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON in response');
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error('Incomplete JSON');
  return JSON.parse(text.slice(start, end));
}

interface FoodPhotoAnalysis {
  calories: number;
  caloriesMin: number;
  caloriesMax: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: 'high' | 'medium' | 'low';
  components: string[];
  isRestaurantPortion: boolean;
}

/**
 * Cal AI-style: single Claude Vision call directly estimates macros, range, and confidence.
 * Handles nutrition labels (exact read) and food photos (visual portion estimation).
 * Accepts multiple photos — multi-angle of the same meal or main + sides.
 */
async function analyzeFoodPhotosDirect(
  images: { base64: string }[],
  mealName: string,
  options?: {
    portionType?: 'restaurant' | 'home' | null;
    feedbackHint?: 'too_low' | 'too_high' | null;
  },
): Promise<FoodPhotoAnalysis> {
  if (!ANTHROPIC_KEY) throw new Error('No API key — set EXPO_PUBLIC_ANTHROPIC_KEY');

  const imageBlocks = images.map((img) => ({
    type: 'image',
    source: { type: 'base64', media_type: detectMediaType(img.base64), data: img.base64 },
  }));

  const portionContext = options?.portionType === 'restaurant'
    ? '\n\nCONTEXT: User confirmed RESTAURANT MEAL — apply restaurant sizing (1.5–2× home portions, generous oils/butter, larger portions).'
    : options?.portionType === 'home'
    ? '\n\nCONTEXT: User confirmed HOME COOKED — use standard home serving sizes, typical oil amounts.'
    : '';

  const feedbackContext = options?.feedbackHint === 'too_high'
    ? '\n\nREVISION: User says the previous estimate was too HIGH. Recheck portion size carefully — it may be smaller than it looks, or you overestimated oil/sauce. Be more conservative.'
    : options?.feedbackHint === 'too_low'
    ? '\n\nREVISION: User says the previous estimate was too LOW. Look harder for hidden calories — denser portions, extra oil/sauce, or items initially missed. Revise meaningfully upward.'
    : '';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: `You are an expert nutritionist and visual portion estimator for a high-protein fitness app.
Analyze food photos and estimate nutrition accurately using visual cues, like Cal AI.

VISUAL REFERENCE SIZES:
- Standard dinner plate = 26cm; food fills 60–80% of the plate
- Side plate = 20cm, Lunch bowl ≈ 400ml, Large bowl ≈ 600ml
- Palm-sized cooked protein = 85–115g (3–4 oz)
- Fist-sized cooked carbs = 150g rice/pasta
- Thumb-tip = 1 tsp oil (~40 cal), Thumb = 1 tbsp (~120 cal)

PROTEIN REFERENCES:
- Chicken breast fillet = 120–165g cooked = 35–50g protein
- Chicken thigh (boneless) = 100–130g cooked = 22–28g protein + more fat
- Ground beef patty (restaurant) = 150–200g = 30–40g protein
- Salmon fillet = 150–180g = 30–38g protein
- Large egg = 70 cal, 6g protein

HIDDEN CALORIES (critical):
- Deep fried: +80–120 cal/100g vs baked (oil absorption)
- Pan-fried with visible oil sheen: +40–80 cal/100g
- Creamy sauce/gravy (2–3 tbsp): +80–150 cal
- Butter on top: +50–150 cal
- Cheese slice: +70–120 cal
- Visible dressing/mayo: +50–200 cal

RESTAURANT vs HOME:
- Restaurant portions: typically 1.5–2× home portions
- Burger bun: ~200 cal alone; patty: 300–500 cal
- Restaurant pasta/rice: 300–500g cooked vs home 150–200g

MULTIPLE PHOTOS:
- Same meal from different angles: analyze as one meal
- Different dishes in different photos: sum the macros

NUTRITION FACTS LABEL: if any image shows a printed label, read exact values, mark confidence "high", ignore food photos.

Return ONLY this JSON, no other text:
{
  "type": "label" | "food",
  "calories": <best single estimate as integer>,
  "caloriesMin": <lower bound — lighter portion, less oil>,
  "caloriesMax": <upper bound — larger portion, more sauce/oil>,
  "proteinG": <integer>,
  "carbsG": <integer>,
  "fatG": <integer>,
  "confidence": "high" | "medium" | "low",
  "components": [
    "Grilled chicken breast ~150g — ~250 cal, 35g protein",
    "Steamed rice ~180g — ~230 cal",
    "Sesame sauce ~2 tbsp — ~60 cal"
  ],
  "isRestaurantPortion": true | false
}

CONFIDENCE: "high" = label or single obvious item; "medium" = recognizable dish; "low" = blurry/complex/obscured.${portionContext}${feedbackContext}`,
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: `Analyze this meal: "${mealName || 'meal'}". Return the nutrition JSON.` },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(`[SpiceStrong] Cal AI vision error ${res.status}:`, errBody);
    throw new Error(`API ${res.status}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  console.log('[SpiceStrong] Cal AI vision response:', text);

  const parsed = extractFirstJson(text);
  const calories = Math.round(Number(parsed.calories) || 0);

  return {
    calories,
    caloriesMin: Math.round(Number(parsed.caloriesMin) || Math.round(calories * 0.8)),
    caloriesMax: Math.round(Number(parsed.caloriesMax) || Math.round(calories * 1.2)),
    proteinG: Math.round(Number(parsed.proteinG) || 0),
    carbsG: Math.round(Number(parsed.carbsG) || 0),
    fatG: Math.round(Number(parsed.fatG) || 0),
    confidence: parsed.confidence ?? 'medium',
    components: Array.isArray(parsed.components) ? parsed.components : [],
    isRestaurantPortion: !!parsed.isRestaurantPortion,
  };
}

const ORANGE = '#8F3A1F';
const SURFACE = 'rgba(248,241,232,0.08)';
const BORDER = 'rgba(248,241,232,0.12)';
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'PlayfairDisplay_700Bold',
  default: 'serif',
});

const CARD_W = Dimensions.get('window').width - 48;
const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch_dinner', 'snack_dessert'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

const RING_SIZE = Math.floor((Dimensions.get('window').width - 48) / 3);
const RING_STROKE = 11;
const RING_R = RING_SIZE / 2 - RING_STROKE / 2 - 2;
const RING_CIRC = 2 * Math.PI * RING_R;

function MacroRing({
  label, color, target, consumed,
}: {
  label: string; color: string; target: number; consumed: number;
}) {
  const ratio = target > 0 ? Math.min(consumed / target, 1) : 0;
  const dashOffset = RING_CIRC * (1 - ratio);
  const diff = consumed - target;
  const cx = RING_SIZE / 2;
  const cy = RING_SIZE / 2;

  return (
    <View style={{ alignItems: 'center', width: RING_SIZE }}>
      <Text style={{ color, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 6, textTransform: 'uppercase' }}>
        {label} (g)
      </Text>
      <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute' }}>
          <Circle
            cx={cx} cy={cy} r={RING_R}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={RING_STROKE}
          />
          <Circle
            cx={cx} cy={cy} r={RING_R}
            fill="none"
            stroke={color}
            strokeWidth={RING_STROKE}
            strokeDasharray={RING_CIRC}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${cx},${cy}`}
          />
        </Svg>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.9 }}>TARGET</Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF', lineHeight: 22 }}>{target}g</Text>
          <View style={{ width: 28, height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 3 }} />
          <Text style={{ fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.9 }}>CONSUMED</Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color, lineHeight: 22 }}>{consumed}g</Text>
        </View>
      </View>
      <View style={{
        backgroundColor: color,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginTop: 8,
        opacity: 0.92,
      }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.4 }}>
          DIFF {diff >= 0 ? '+' : ''}{diff}g
        </Text>
      </View>
    </View>
  );
}

interface EnrichedEntry extends MealPlanEntry {
  recipe: SavedRecipe | null;
  imageUri: string | null;
  photoUris?: string[];
  builtinImage: any | null; // require() source for built-in recipes
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isQuickAdd?: boolean; // true for manually added meals (no recipe)
}

function dateFromString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function stringFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function formatDisplayDate(dateStr: string): string {
  const d = dateFromString(dateStr);
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

async function resolveImage(recipeId: string, recipe: SavedRecipe | null): Promise<string | null> {
  try {
    const urls = await getRecipeImageUrls(recipeId);
    if (urls.heroUrl) return urls.heroUrl;
  } catch {}
  try {
    const ai = await loadRecipeImages(recipeId);
    if (ai?.dishImage) return ai.dishImage;
  } catch {}
  if (recipe) {
    const builtin = getRecipeCardImage(recipe.id);
    if (builtin) return null; // built-in returns require() — handle below
  }
  return null;
}

export default function MealPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const today = stringFromDate(new Date());
  const [currentDate, setCurrentDate] = useState(today);
  const [enriched, setEnriched] = useState<EnrichedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [macroTargets, setMacroTargets] = useState<MacroTargets | null>(null);

  // Macro correction modal state
  const [correctEntry, setCorrectEntry] = useState<EnrichedEntry | null>(null);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const MAX_MEAL_PHOTOS = 4;
  const [correcting, setCorrecting] = useState(false);
  const [correctedMacros, setCorrectedMacros] = useState<{ calories: number; proteinG: number; carbsG: number; fatG: number } | null>(null);
  const [correctionPhotos, setCorrectionPhotos] = useState<{ uri: string; base64: string }[]>([]);
  const [correctionComponents, setCorrectionComponents] = useState<string[]>([]);
  const [correctionCalRange, setCorrectionCalRange] = useState<{ min: number; max: number } | null>(null);
  const [correctionConfidence, setCorrectionConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  const [correctionPortionType, setCorrectionPortionType] = useState<'restaurant' | 'home' | null>(null);
  const [correctionFeedback, setCorrectionFeedback] = useState<'too_low' | 'ok' | 'too_high' | null>(null);
  const [correctionReanalyzing, setCorrectionReanalyzing] = useState(false);
  const [correctionComponentEditMode, setCorrectionComponentEditMode] = useState(false);
  const [correctionEditableComponents, setCorrectionEditableComponents] = useState<string[]>([]);
  const [correctionNewIngredient, setCorrectionNewIngredient] = useState('');
  const [correctionRecalculating, setCorrectionRecalculating] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualCal, setManualCal] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');

  const openCorrectMacros = async (entry: EnrichedEntry) => {
    setCorrectEntry(entry);
    setCorrectedMacros(null);
    let savedPhotoUris = entry.photoUris ?? (entry.imageUri ? [entry.imageUri] : []);
    try {
      const overrideStr = await AsyncStorage.getItem(`${MACRO_OVERRIDE_PREFIX}${entry.id}`);
      if (overrideStr) {
        const override: MacroOverride = JSON.parse(overrideStr);
        savedPhotoUris = override.photoUris ?? (override.photoUri ? [override.photoUri] : savedPhotoUris);
      }
    } catch {}
    setCorrectionPhotos(savedPhotoUris.slice(0, MAX_MEAL_PHOTOS).map((uri) => ({ uri, base64: '' })));
    setCorrecting(false);
    setManualMode(false);
    setCorrectionComponents([]);
    setCorrectionCalRange(null);
    setCorrectionConfidence(null);
    setCorrectionPortionType(null);
    setCorrectionFeedback(null);
    setCorrectionReanalyzing(false);
    setCorrectionComponentEditMode(false);
    setCorrectionEditableComponents([]);
    setCorrectionNewIngredient('');
    setCorrectionRecalculating(false);
    setManualCal(''); setManualProtein(''); setManualCarbs(''); setManualFat('');
  };

  const closeCorrectMacros = () => {
    setCorrectEntry(null);
    setCorrectedMacros(null);
    setCorrectionPhotos([]);
    setCorrecting(false);
    setManualMode(false);
    setCorrectionComponents([]);
    setCorrectionCalRange(null);
    setCorrectionConfidence(null);
    setCorrectionPortionType(null);
    setCorrectionFeedback(null);
    setCorrectionReanalyzing(false);
    setCorrectionComponentEditMode(false);
    setCorrectionEditableComponents([]);
    setCorrectionNewIngredient('');
    setCorrectionRecalculating(false);
  };

  const addMealPhoto = async (useCamera: boolean) => {
    if (correctionPhotos.length >= MAX_MEAL_PHOTOS) {
      Alert.alert('Maximum Photos', `You can add up to ${MAX_MEAL_PHOTOS} photos. Remove one to add another.`);
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.5,
      base64: true,
      allowsEditing: false,
    };
    let result: ImagePicker.ImagePickerResult;
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Camera access is required.'); return; }
      result = await ImagePicker.launchCameraAsync(opts);
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
      result = await ImagePicker.launchImageLibraryAsync(opts);
    }
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const compressed = await manipulateAsync(
      asset.uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.5, format: SaveFormat.JPEG, base64: true },
    );
    let base64 = compressed.base64 ?? '';
    if (base64.includes(',')) base64 = base64.split(',')[1];

    if (!base64 || base64.length < 100) {
      Alert.alert('Photo Error', 'Could not read the image. Try again.');
      return;
    }

    const uniqueUri = `${asset.uri}?t=${Date.now()}`;
    setCorrectionPhotos((prev) => [...prev, { uri: uniqueUri, base64 }]);
  };

  const removeMealPhoto = (idx: number) => {
    setCorrectionPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const analyzeAllPhotos = async () => {
    if (correctionPhotos.length === 0) return;
    setCorrecting(true);
    try {
      const validPhotos = await hydrateMealPhotos(correctionPhotos);
      if (validPhotos.length === 0) throw new Error('No valid photos to analyze');
      console.log(`[SpiceStrong] Cal AI analysis: ${validPhotos.length} photos`);

      const analysis = await analyzeFoodPhotosDirect(validPhotos, correctEntry?.recipeName || 'meal', { portionType: correctionPortionType });
      console.log(`[SpiceStrong] Result: ${analysis.calories} cal (${analysis.caloriesMin}–${analysis.caloriesMax}), ${analysis.proteinG}g P, confidence: ${analysis.confidence}`);

      setCorrectedMacros({
        calories: analysis.calories,
        proteinG: analysis.proteinG,
        carbsG: analysis.carbsG,
        fatG: analysis.fatG,
      });
      setCorrectionComponents(analysis.components);
      setCorrectionCalRange({ min: analysis.caloriesMin, max: analysis.caloriesMax });
      setCorrectionConfidence(analysis.confidence);
      setCorrectionFeedback(null);
    } catch (err: any) {
      console.error('[SpiceStrong] Cal AI analysis failed:', err);
      Alert.alert('Analysis Failed', `${err?.message ?? 'Unknown error'}. Try again or enter manually.`);
    } finally {
      setCorrecting(false);
    }
  };

  const handleCorrectionFeedback = async (feedback: 'too_low' | 'ok' | 'too_high') => {
    setCorrectionFeedback(feedback);
    if (feedback === 'ok') return;

    setCorrectionReanalyzing(true);
    try {
      const validPhotos = await hydrateMealPhotos(correctionPhotos);
      if (validPhotos.length === 0) return;
      const analysis = await analyzeFoodPhotosDirect(validPhotos, correctEntry?.recipeName || 'meal', {
        portionType: correctionPortionType,
        feedbackHint: feedback,
      });
      setCorrectedMacros({
        calories: analysis.calories,
        proteinG: analysis.proteinG,
        carbsG: analysis.carbsG,
        fatG: analysis.fatG,
      });
      setCorrectionComponents(analysis.components);
      setCorrectionCalRange({ min: analysis.caloriesMin, max: analysis.caloriesMax });
      setCorrectionConfidence(analysis.confidence);
      setCorrectionFeedback(null);
    } catch (err: any) {
      console.warn('[SpiceStrong] Correction feedback re-analysis failed:', err);
    } finally {
      setCorrectionReanalyzing(false);
    }
  };

  const applyManualEntry = async () => {
    if (!correctEntry) return;
    const macros = {
      calories: Math.round(Number(manualCal) || 0),
      proteinG: Math.round(Number(manualProtein) || 0),
      carbsG: Math.round(Number(manualCarbs) || 0),
      fatG: Math.round(Number(manualFat) || 0),
    };
    const existingPhotoUris = correctEntry.photoUris ?? (correctEntry.imageUri ? [correctEntry.imageUri] : []);
    const override: MacroOverride = { ...macros, photoUri: existingPhotoUris[0] ?? '', photoUris: existingPhotoUris };
    await AsyncStorage.setItem(`${MACRO_OVERRIDE_PREFIX}${correctEntry.id}`, JSON.stringify(override));
    setEnriched((prev) =>
      prev.map((e) =>
        e.id === correctEntry.id
          ? { ...e, ...macros, imageUri: existingPhotoUris[0] ?? e.imageUri, photoUris: existingPhotoUris }
          : e
      )
    );
    closeCorrectMacros();
  };

  const applyCorrection = async () => {
    if (!correctEntry || !correctedMacros || correctionPhotos.length === 0) return;

    const photoUris = await persistMealPhotoUris(correctionPhotos, `meal_${correctEntry.id}`);
    const heroUri = photoUris[0] ?? '';

    const override: MacroOverride = { ...correctedMacros, photoUri: heroUri, photoUris };
    await AsyncStorage.setItem(`${MACRO_OVERRIDE_PREFIX}${correctEntry.id}`, JSON.stringify(override));
    setEnriched((prev) =>
      prev.map((e) =>
        e.id === correctEntry.id
          ? { ...e, calories: correctedMacros.calories, proteinG: correctedMacros.proteinG, carbsG: correctedMacros.carbsG, fatG: correctedMacros.fatG, imageUri: heroUri, photoUris }
          : e
      )
    );
    closeCorrectMacros();
  };

  // Calendar picker state
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const openCalendar = () => {
    const d = dateFromString(currentDate);
    setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
    setCalendarVisible(true);
  };
  const closeCalendar = () => setCalendarVisible(false);
  const prevCalMonth = () => setCalMonth(({ year, month }) =>
    month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
  );
  const nextCalMonth = () => setCalMonth(({ year, month }) =>
    month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
  );
  const selectCalDay = (day: number) => {
    const dateStr = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setCurrentDate(dateStr);
    setCalendarVisible(false);
  };

  // ── Quick Add Meal state ──
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddSlot, setQuickAddSlot] = useState<MealSlot>('lunch_dinner');
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddPhoto, setQuickAddPhoto] = useState<string | null>(null);
  const [quickAddBase64, setQuickAddBase64] = useState<string>('');
  const [quickAddPhotos, setQuickAddPhotos] = useState<{ uri: string; base64: string }[]>([]);
  const [quickAddScanning, setQuickAddScanning] = useState(false);
  const [quickAddManualMode, setQuickAddManualMode] = useState(false);
  const [quickAddEstimated, setQuickAddEstimated] = useState(false);
  const [quickAddMacros, setQuickAddMacros] = useState<{ calories: string; proteinG: string; carbsG: string; fatG: string }>({ calories: '', proteinG: '', carbsG: '', fatG: '' });
  const [quickAddCalRange, setQuickAddCalRange] = useState<{ min: number; max: number } | null>(null);
  const [quickAddComponents, setQuickAddComponents] = useState<string[]>([]);
  const [quickAddConfidence, setQuickAddConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  const [quickAddPortionType, setQuickAddPortionType] = useState<'restaurant' | 'home' | null>(null);
  const [quickAddFeedback, setQuickAddFeedback] = useState<'too_low' | 'ok' | 'too_high' | null>(null);
  const [quickAddReanalyzing, setQuickAddReanalyzing] = useState(false);
  const [quickAddComponentEditMode, setQuickAddComponentEditMode] = useState(false);
  const [quickAddEditableComponents, setQuickAddEditableComponents] = useState<string[]>([]);
  const [quickAddNewIngredient, setQuickAddNewIngredient] = useState('');
  const [quickAddRecalculating, setQuickAddRecalculating] = useState(false);
  const [browseHelpVisible, setBrowseHelpVisible] = useState(false);

  const openQuickAdd = (slot: MealSlot) => {
    setQuickAddSlot(slot);
    setQuickAddName('');
    setQuickAddPhoto(null);
    setQuickAddBase64('');
    setQuickAddPhotos([]);
    setQuickAddScanning(false);
    setQuickAddManualMode(false);
    setQuickAddEstimated(false);
    setQuickAddMacros({ calories: '', proteinG: '', carbsG: '', fatG: '' });
    setQuickAddCalRange(null);
    setQuickAddComponents([]);
    setQuickAddConfidence(null);
    setQuickAddPortionType(null);
    setQuickAddFeedback(null);
    setQuickAddReanalyzing(false);
    setQuickAddComponentEditMode(false);
    setQuickAddEditableComponents([]);
    setQuickAddNewIngredient('');
    setQuickAddRecalculating(false);
    setQuickAddOpen(true);
  };

  const openBrowseRecipeHelp = () => {
    setBrowseHelpVisible(true);
  };

  const closeQuickAdd = () => {
    Keyboard.dismiss();
    setQuickAddOpen(false);
  };

  const pickQuickAddPhoto = async (useCamera: boolean) => {
    if (quickAddPhotos.length >= MAX_MEAL_PHOTOS) {
      Alert.alert('Maximum Photos', `You can add up to ${MAX_MEAL_PHOTOS} photos. Remove one to add another.`);
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.5,
      base64: true,
      allowsEditing: false,
    };
    let result: ImagePicker.ImagePickerResult;
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Camera access required.'); return; }
      result = await ImagePicker.launchCameraAsync(opts);
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Gallery access required.'); return; }
      result = await ImagePicker.launchImageLibraryAsync(opts);
    }
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const compressed = await manipulateAsync(
      asset.uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.5, format: SaveFormat.JPEG, base64: true },
    );
    let b64 = compressed.base64 ?? '';
    if (b64.includes(',')) b64 = b64.split(',')[1];

    setQuickAddEstimated(false);
    setQuickAddPhoto(`${asset.uri}?t=${Date.now()}`);
    setQuickAddBase64(b64);
    setQuickAddPhotos((prev) => [...prev, { uri: `${asset.uri}?t=${Date.now()}`, base64: b64 }]);

    // Auto-scan immediately after first photo
    if (b64 && b64.length > 100) {
      setQuickAddScanning(true);
      try {
        const analysis = await analyzeFoodPhotosDirect([{ base64: b64 }], quickAddName || 'meal', { portionType: quickAddPortionType });
        setQuickAddMacros({
          calories: String(analysis.calories),
          proteinG: String(analysis.proteinG),
          carbsG: String(analysis.carbsG),
          fatG: String(analysis.fatG),
        });
        setQuickAddCalRange({ min: analysis.caloriesMin, max: analysis.caloriesMax });
        setQuickAddComponents(analysis.components);
        setQuickAddConfidence(analysis.confidence);
        setQuickAddFeedback(null);
        setQuickAddEstimated(true);
      } catch (err: any) {
        console.warn('[SpiceStrong] Quick add scan failed:', err);
        // Silent — user can enter manually
      } finally {
        setQuickAddScanning(false);
      }
    }
  };

  const removeQuickAddPhoto = (idx: number) => {
    setQuickAddEstimated(false);
    setQuickAddCalRange(null);
    setQuickAddComponents([]);
    setQuickAddConfidence(null);
    setQuickAddFeedback(null);
    setQuickAddPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const analyzeQuickAddPhotos = async () => {
    if (quickAddPhotos.length === 0) return;
    setQuickAddScanning(true);
    try {
      const validPhotos = await hydrateMealPhotos(quickAddPhotos);
      if (validPhotos.length === 0) throw new Error('No valid photos to analyze');
      // Send all photos in one Claude call — it handles multi-angle and multi-dish
      const analysis = await analyzeFoodPhotosDirect(validPhotos, quickAddName || 'meal', { portionType: quickAddPortionType });
      setQuickAddMacros({
        calories: String(analysis.calories),
        proteinG: String(analysis.proteinG),
        carbsG: String(analysis.carbsG),
        fatG: String(analysis.fatG),
      });
      setQuickAddCalRange({ min: analysis.caloriesMin, max: analysis.caloriesMax });
      setQuickAddComponents(analysis.components);
      setQuickAddConfidence(analysis.confidence);
      setQuickAddFeedback(null);
      setQuickAddEstimated(true);
    } catch (err: any) {
      console.warn('[SpiceStrong] Quick add scan failed:', err);
      Alert.alert('Analysis Failed', `${err?.message ?? 'Unknown error'}. Try again or enter manually.`);
    } finally {
      setQuickAddScanning(false);
    }
  };

  const handleQuickAddFeedback = async (feedback: 'too_low' | 'ok' | 'too_high') => {
    setQuickAddFeedback(feedback);
    if (feedback === 'ok') return;

    // Re-analyze with the user's correction hint
    setQuickAddReanalyzing(true);
    try {
      const validPhotos = await hydrateMealPhotos(quickAddPhotos);
      if (validPhotos.length === 0) return;
      const analysis = await analyzeFoodPhotosDirect(validPhotos, quickAddName || 'meal', {
        portionType: quickAddPortionType,
        feedbackHint: feedback,
      });
      setQuickAddMacros({
        calories: String(analysis.calories),
        proteinG: String(analysis.proteinG),
        carbsG: String(analysis.carbsG),
        fatG: String(analysis.fatG),
      });
      setQuickAddCalRange({ min: analysis.caloriesMin, max: analysis.caloriesMax });
      setQuickAddComponents(analysis.components);
      setQuickAddConfidence(analysis.confidence);
      setQuickAddFeedback(null); // reset so user can give feedback again on revised estimate
    } catch (err: any) {
      console.warn('[SpiceStrong] Feedback re-analysis failed:', err);
    } finally {
      setQuickAddReanalyzing(false);
    }
  };

  const enterQuickAddEditMode = () => {
    setQuickAddEditableComponents([...quickAddComponents]);
    setQuickAddNewIngredient('');
    setQuickAddComponentEditMode(true);
  };

  const recalculateQuickAddMacros = async () => {
    const newItem = quickAddNewIngredient.trim();
    const components = newItem ? [...quickAddEditableComponents, newItem] : [...quickAddEditableComponents];
    if (components.length === 0) return;
    setQuickAddRecalculating(true);
    try {
      const result = await recalculateFromComponentsList(components);
      setQuickAddMacros({
        calories: String(result.calories),
        proteinG: String(result.proteinG),
        carbsG: String(result.carbsG),
        fatG: String(result.fatG),
      });
      setQuickAddCalRange({ min: result.caloriesMin, max: result.caloriesMax });
      setQuickAddConfidence(result.confidence);
      setQuickAddComponents(components);
      setQuickAddFeedback(null);
      setQuickAddNewIngredient('');
      setQuickAddComponentEditMode(false);
    } catch (err: any) {
      console.warn('[SpiceStrong] Recalculate failed:', err);
      Alert.alert('Failed', 'Could not recalculate. Try again.');
    } finally {
      setQuickAddRecalculating(false);
    }
  };

  const enterCorrectionEditMode = () => {
    setCorrectionEditableComponents([...correctionComponents]);
    setCorrectionNewIngredient('');
    setCorrectionComponentEditMode(true);
  };

  const recalculateCorrectionMacros = async () => {
    const newItem = correctionNewIngredient.trim();
    const components = newItem ? [...correctionEditableComponents, newItem] : [...correctionEditableComponents];
    if (components.length === 0) return;
    setCorrectionRecalculating(true);
    try {
      const result = await recalculateFromComponentsList(components);
      setCorrectedMacros({
        calories: result.calories,
        proteinG: result.proteinG,
        carbsG: result.carbsG,
        fatG: result.fatG,
      });
      setCorrectionCalRange({ min: result.caloriesMin, max: result.caloriesMax });
      setCorrectionConfidence(result.confidence);
      setCorrectionComponents(components);
      setCorrectionFeedback(null);
      setCorrectionNewIngredient('');
      setCorrectionComponentEditMode(false);
    } catch (err: any) {
      console.warn('[SpiceStrong] Correction recalculate failed:', err);
      Alert.alert('Failed', 'Could not recalculate. Try again.');
    } finally {
      setCorrectionRecalculating(false);
    }
  };

  const saveQuickAdd = async () => {
    const name = quickAddName.trim() || 'My Meal';
    const entryId = `quick_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const macros = {
      calories: Math.round(Number(quickAddMacros.calories) || 0),
      proteinG: Math.round(Number(quickAddMacros.proteinG) || 0),
      carbsG: Math.round(Number(quickAddMacros.carbsG) || 0),
      fatG: Math.round(Number(quickAddMacros.fatG) || 0),
    };

    // Save to meal plan service
    const result = await addToMealPlan(currentDate, quickAddSlot, {
      id: entryId,
      name,
      proteinName: 'Custom',
      proteinEmoji: '🍽',
      mealType: quickAddSlot,
    });

    if (!result.success) {
      Alert.alert('Slot Full', result.error ?? 'Could not add meal.');
      return;
    }

    // Save macros + photo as override
    const photoUris = await persistMealPhotoUris(quickAddPhotos, `quick_${Date.now()}`);
    const override: MacroOverride = { ...macros, photoUri: photoUris[0] ?? '', photoUris };
    // Need the actual entry ID from the service — use the same ID format
    const entries = await getMealPlanForDate(currentDate);
    const newEntry = entries.find((e) => e.recipeName === name && e.slot === quickAddSlot);
    if (newEntry) {
      await AsyncStorage.setItem(`${MACRO_OVERRIDE_PREFIX}${newEntry.id}`, JSON.stringify(override));
    }

    closeQuickAdd();
    loadEntries(currentDate);
  };

  const loadEntries = useCallback(async (date: string) => {
    setLoading(true);
    const entries = await getMealPlanForDate(date);

    // Enrich each entry with full recipe details + images + nutrition
    const enrichedEntries = await Promise.all(
      entries.map(async (entry): Promise<EnrichedEntry> => {
        const isQuickAdd = entry.recipeId.startsWith('quick_');
        const isAutoplan = entry.recipeId.startsWith('autoplan_');

        // Quick-add meals — no recipe, macros from override only
        if (isQuickAdd) {
          let imageUri: string | null = null;
          let photoUris: string[] = [];
          let calories = 0, proteinG = 0, carbsG = 0, fatG = 0;
          try {
            const overrideStr = await AsyncStorage.getItem(`${MACRO_OVERRIDE_PREFIX}${entry.id}`);
            if (overrideStr) {
              const o: MacroOverride = JSON.parse(overrideStr);
              calories = o.calories; proteinG = o.proteinG; carbsG = o.carbsG; fatG = o.fatG;
              if (o.photoUri) imageUri = o.photoUri;
              photoUris = o.photoUris ?? (o.photoUri ? [o.photoUri] : []);
            }
          } catch {}
          return { ...entry, recipe: null, imageUri, photoUris, builtinImage: null, calories, proteinG, carbsG, fatG, isQuickAdd: true };
        }

        // Autoplan placeholders — target macros stored in aiNutrition on local recipe
        if (isAutoplan) {
          const recipe = await getRecipeById(entry.recipeId);
          let imageUri = await resolveImage(entry.recipeId, recipe);
          let photoUris: string[] = imageUri ? [imageUri] : [];
          let calories = 0, proteinG = 0, carbsG = 0, fatG = 0;
          if (recipe) {
            // If recipe has been fully generated (status=ready), use getCompletionStats
            if (recipe.status === 'ready' && (recipe.aiNutrition || (recipe as any).nutrition)) {
              const stats = getCompletionStats(recipe, '2-3 servings');
              calories = stats.calories;
              proteinG = stats.proteinG;
              carbsG = stats.carbsG;
              fatG = stats.fatG;
            } else if (recipe.aiNutrition) {
              // Placeholder still building — aiNutrition has target macros (×2.5 batch)
              calories = Math.round(recipe.aiNutrition.calories / 2.5);
              proteinG = Math.round(recipe.aiNutrition.proteinG / 2.5);
              carbsG = Math.round(recipe.aiNutrition.carbsG / 2.5);
              fatG = Math.round(recipe.aiNutrition.fatG / 2.5);
            }
          }
          // Parse from description as last fallback (e.g. "~500 cal, ~38g protein")
          if (calories === 0) {
            const desc = entry.recipeName + ' ' + (recipe?.description ?? '');
            const calMatch = desc.match(/~?(\d+)\s*cal/i);
            const proMatch = desc.match(/~?(\d+)g?\s*protein/i);
            if (calMatch) calories = parseInt(calMatch[1], 10);
            if (proMatch) proteinG = parseInt(proMatch[1], 10);
          }
          // Override with user correction if available
          try {
            const overrideStr = await AsyncStorage.getItem(`${MACRO_OVERRIDE_PREFIX}${entry.id}`);
            if (overrideStr) {
              const o: MacroOverride = JSON.parse(overrideStr);
              calories = o.calories; proteinG = o.proteinG; carbsG = o.carbsG; fatG = o.fatG;
              if (o.photoUri) imageUri = o.photoUri;
              photoUris = o.photoUris ?? (o.photoUri ? [o.photoUri] : []);
            }
          } catch {}
          return { ...entry, recipe, imageUri, photoUris, builtinImage: null, calories, proteinG, carbsG, fatG };
        }

        const recipe = await getRecipeById(entry.recipeId);
        let imageUri = await resolveImage(entry.recipeId, recipe);
        let photoUris: string[] = imageUri ? [imageUri] : [];
        const builtinImage = recipe ? getRecipeCardImage(recipe.id) : null;
        let calories = 0, proteinG = 0, carbsG = 0, fatG = 0;
        if (recipe) {
          // Pipeline values are already per-serving (highest priority)
          if (recipe.pipelineCalories || recipe.pipelineProteinG) {
            calories = recipe.pipelineCalories ?? 0;
            proteinG = recipe.pipelineProteinG ?? 0;
            carbsG = recipe.pipelineCarbsG ?? 0;
            fatG = recipe.pipelineFatG ?? 0;
          } else {
            const stats = getCompletionStats(recipe, '2-3 servings');
            calories = stats.calories;
            proteinG = stats.proteinG;
            carbsG = stats.carbsG;
            fatG = stats.fatG;
          }
        }
        // Apply saved macro override + hero image if user corrected via photo
        try {
          const overrideStr = await AsyncStorage.getItem(`${MACRO_OVERRIDE_PREFIX}${entry.id}`);
          if (overrideStr) {
            const o: MacroOverride = JSON.parse(overrideStr);
            calories = o.calories; proteinG = o.proteinG; carbsG = o.carbsG; fatG = o.fatG;
            if (o.photoUri) imageUri = o.photoUri;
            photoUris = o.photoUris ?? (o.photoUri ? [o.photoUri] : []);
          }
        } catch {}
        return { ...entry, recipe, imageUri, photoUris, builtinImage, calories, proteinG, carbsG, fatG };
      })
    );

    setEnriched(enrichedEntries);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    loadEntries(currentDate);
    getFitnessProfile().then((profile) => {
      if (profile) setMacroTargets(calculateMacroTargets(profile));
    }).catch(() => {});
  }, [currentDate, loadEntries]));

  const goToPrev = () => {
    const d = dateFromString(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(stringFromDate(d));
  };
  const goToNext = () => {
    const d = dateFromString(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(stringFromDate(d));
  };

  // Background AI recipe generation for autoplan placeholders
  const handleGenerateRecipe = async (entry: EnrichedEntry) => {
    if (generatingIds.has(entry.id)) return;
    setGeneratingIds((prev) => new Set(prev).add(entry.id));

    try {
      // Dynamically import the AI builder's callClaudeAPI + saveRecipeFromAI
      const { callClaudeAPI, saveRecipeFromAI } = require('./AIRecipeBuilderScreen');

      // Determine protein from entry name/description or default
      const proteinId = entry.recipe?.proteinId || 'chicken';
      const proteinName = entry.recipe?.proteinName || 'Chicken';
      const proteinEmoji = entry.proteinEmoji || '🍗';
      const mealSlot = entry.slot;

      // Use the spiceBuilderPrompt via a simplified Claude call
      const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
      if (!ANTHROPIC_KEY) throw new Error('No API key');

      const { SPICEBUILDER_SYSTEM_PROMPT } = require('../../src/prompts/spiceBuilderPrompt');
      const mealTypeLabel = mealSlot === 'breakfast' ? 'Breakfast' : mealSlot === 'snack_dessert' ? 'Snack/Dessert' : 'Lunch/Dinner';
      const systemPrompt = SPICEBUILDER_SYSTEM_PROMPT;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: `Generate a high-protein ${mealTypeLabel} recipe.
- proteinId: "${proteinId}"
- proteinName: "${proteinName}"
- proteinEmoji: "${proteinEmoji}"
- mealType: "${mealTypeLabel}"
- Target: ~${entry.calories} cal, ~${entry.proteinG}g protein per serving
- Return ONLY the JSON object with: name, proteinId, proteinName, proteinEmoji, description, ingredients (with "2-3 servings" tier), steps (array with title, description, emoji, timerMinutes, tip), chefTip, mealType, aiNutrition (calories, proteinG, carbsG, fatG, fiberG, sugarG, sodiumMg)` }],
        }),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const text = data.content?.[0]?.text || '';

      // Extract JSON
      const start = text.indexOf('{');
      let depth = 0, end = -1;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end === -1) throw new Error('Could not parse recipe');
      const recipeData = JSON.parse(text.slice(start, end));

      // Build SavedRecipe
      // Ensure both serving tiers exist — 4-6 is 2× the 2-3 tier
      const rawIngredients = recipeData.ingredients || {};
      // Handle various formats: { "2-3 servings": [...] } or just [...]
      let tier23: any[] = [];
      if (Array.isArray(rawIngredients)) {
        tier23 = rawIngredients;
      } else if (rawIngredients['2-3 servings'] && Array.isArray(rawIngredients['2-3 servings'])) {
        tier23 = rawIngredients['2-3 servings'];
      } else {
        const firstKey = Object.keys(rawIngredients)[0];
        tier23 = firstKey && Array.isArray(rawIngredients[firstKey]) ? rawIngredients[firstKey] : [];
      }
      const tier46 = (rawIngredients['4-6 servings'] && Array.isArray(rawIngredients['4-6 servings']))
        ? rawIngredients['4-6 servings']
        : tier23.map((i: any) => {
        // Double the quantity for 4-6 tier
        const qty = String(i.quantity || '');
        const numMatch = qty.match(/^([\d.\/]+)/);
        if (numMatch) {
          const num = parseFloat(numMatch[1]) * 2;
          return { name: i.name, quantity: qty.replace(numMatch[1], String(num)) };
        }
        return { name: i.name, quantity: `2x ${qty}` };
      });

      const newRecipe: SavedRecipe = {
        id: entry.recipeId, // keep the same ID
        name: String(recipeData.name || `${proteinName} Recipe`),
        proteinId,
        proteinName,
        proteinEmoji,
        description: String(recipeData.description || ''),
        ingredients: { '2-3 servings': tier23, '4-6 servings': tier46 },
        steps: (recipeData.steps || []).map((s: any) => ({
          title: String(s.title || ''),
          description: String(s.description || ''),
          emoji: s.emoji || '',
          timerMinutes: s.timerMinutes || undefined,
          tip: s.tip || undefined,
        })),
        chefTip: String(recipeData.chefTip || ''),
        createdAt: Date.now(),
        mealType: mealSlot === 'breakfast' ? 'breakfast' : mealSlot === 'snack_dessert' ? 'snack_dessert' : 'lunch_dinner',
        status: 'ready',
        source: 'ai',
        aiNutrition: recipeData.aiNutrition || entry.recipe?.aiNutrition,
      };

      // Save recipe locally + Supabase (under correct protein group)
      await saveAIRecipe(newRecipe);

      // Generate images
      const { generateAllRecipeImages, saveRecipeImages } = require('../../services/imageGenerationService');
      const imageResults = await generateAllRecipeImages({
        id: newRecipe.id,
        name: newRecipe.name,
        ingredients: newRecipe.ingredients,
        steps: newRecipe.steps,
      });
      await saveRecipeImages(newRecipe.id, imageResults);

      if (imageResults.dishImage) {
        uploadRecipeHeroImage(newRecipe.id, imageResults.dishImage).catch(() => {});
      }

      // Classify
      try { await classifyAndEnrichRecipe(newRecipe); } catch {}

      // Mark ready
      updateRecipeStatus(newRecipe.id, 'ready').catch(() => {});

      // Reload entries to show updated card
      loadEntries(currentDate);
    } catch (err) {
      console.error('[SpiceStrong] Background recipe generation failed:', err);
      Alert.alert('Generation Failed', 'Could not generate recipe. Try again.');
    } finally {
      setGeneratingIds((prev) => { const next = new Set(prev); next.delete(entry.id); return next; });
    }
  };

  const handleRemove = (entry: MealPlanEntry) => {
    Alert.alert('Remove from Meal Plan', `Remove "${entry.recipeName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeFromMealPlan(entry.id, entry.date);
          loadEntries(currentDate);
        },
      },
    ]);
  };

  // Daily totals (per serving — each entry already stores per-serving values)
  const totals = enriched.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      proteinG: acc.proteinG + e.proteinG,
      carbsG: acc.carbsG + e.carbsG,
      fatG: acc.fatG + e.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );

  const grouped: Record<MealSlot, EnrichedEntry[]> = {
    breakfast: [],
    lunch_dinner: [],
    snack_dessert: [],
  };
  enriched.forEach((e) => { if (grouped[e.slot]) grouped[e.slot].push(e); });

  const isToday = currentDate === today;

  return (
    <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Daily Tracker</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Day navigator */}
      <View style={styles.dayNav}>
        <TouchableOpacity onPress={goToPrev} hitSlop={{ top: 12, bottom: 12, left: 20, right: 20 }}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dayCenter} onPress={openCalendar} activeOpacity={0.7}>
          <View style={styles.dayLabelRow}>
            <Text style={styles.dayLabel}>{formatDisplayDate(currentDate)}</Text>
            <Text style={styles.calendarHint}>▾</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={goToNext} hitSlop={{ top: 12, bottom: 12, left: 20, right: 20 }}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Month calendar picker modal */}
      <Modal
        visible={calendarVisible}
        transparent
        animationType="fade"
        onRequestClose={closeCalendar}
        statusBarTranslucent
      >
        <Pressable style={styles.calBackdrop} onPress={closeCalendar}>
          <Pressable style={styles.calSheet} onPress={() => {}}>
            {/* Month header */}
            <View style={styles.calHeader}>
              <TouchableOpacity onPress={prevCalMonth} hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}>
                <Text style={styles.calNavArrow}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.calMonthTitle}>
                {MONTH_NAMES[calMonth.month]} {calMonth.year}
              </Text>
              <TouchableOpacity onPress={nextCalMonth} hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}>
                <Text style={styles.calNavArrow}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Day-of-week row */}
            <View style={styles.calDayRow}>
              {DAY_SHORT.map((d) => (
                <Text key={d} style={styles.calDayName}>{d}</Text>
              ))}
            </View>

            {/* Day grid */}
            <View style={styles.calGrid}>
              {(() => {
                const daysInMonth = getDaysInMonth(calMonth.year, calMonth.month);
                const firstDay = getFirstDayOfWeek(calMonth.year, calMonth.month);
                const todayD = dateFromString(today);
                const selectedD = dateFromString(currentDate);
                const cells: React.ReactElement[] = [];

                // Leading empty cells
                for (let i = 0; i < firstDay; i++) {
                  cells.push(<View key={`empty-${i}`} style={styles.calCell} />);
                }

                for (let day = 1; day <= daysInMonth; day++) {
                  const cellDate = new Date(calMonth.year, calMonth.month, day);
                  const isSelected =
                    selectedD.getFullYear() === calMonth.year &&
                    selectedD.getMonth() === calMonth.month &&
                    selectedD.getDate() === day;
                  const isTodayCell =
                    todayD.getFullYear() === calMonth.year &&
                    todayD.getMonth() === calMonth.month &&
                    todayD.getDate() === day;

                  cells.push(
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.calCell,
                        isSelected && styles.calCellSelected,
                        !isSelected && isTodayCell && styles.calCellToday,
                      ]}
                      onPress={() => selectCalDay(day)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.calCellText,
                        isSelected && styles.calCellTextSelected,
                        !isSelected && isTodayCell && styles.calCellTextToday,
                      ]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                }
                return cells;
              })()}
            </View>

            {/* Today shortcut */}
            <TouchableOpacity
              style={styles.calTodayBtn}
              onPress={() => { setCurrentDate(today); setCalendarVisible(false); }}
              activeOpacity={0.7}
            >
              <Text style={styles.calTodayBtnText}>Jump to Today</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ORANGE} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Macro progress rings */}
          <View style={styles.ringsRow}>
            <MacroRing
              label="Protein"
              color="#E8671A"
              target={macroTargets?.proteinG ?? 120}
              consumed={totals.proteinG}
            />
            <MacroRing
              label="Carbs"
              color="#3B82F6"
              target={macroTargets?.carbsG ?? 150}
              consumed={totals.carbsG}
            />
            <MacroRing
              label="Fat"
              color="#22C55E"
              target={macroTargets?.fatG ?? 80}
              consumed={totals.fatG}
            />
          </View>

          {/* Calorie equation — Target − Consumed = Diff */}
          {(() => {
            const calTarget = macroTargets?.calories ?? 2000;
            const diff = calTarget - totals.calories;
            const isOver = diff < 0;
            const diffColor = isOver ? '#EF4444' : '#22C55E';
            return (
              <View style={styles.calEqCard}>
                <View style={styles.calEqRow}>
                  <View style={styles.calEqItem}>
                    <Text style={styles.calEqNum}>{calTarget}</Text>
                    <Text style={styles.calEqLabel}>Target</Text>
                  </View>
                  <Text style={styles.calEqOp}>−</Text>
                  <View style={styles.calEqItem}>
                    <Text style={styles.calEqNum}>{totals.calories}</Text>
                    <Text style={styles.calEqLabel}>Consumed</Text>
                  </View>
                  <Text style={styles.calEqOp}>=</Text>
                  <View style={styles.calEqItem}>
                    <Text style={[styles.calEqNum, { color: diffColor }]}>{Math.abs(diff)}</Text>
                    <Text style={[styles.calEqLabel, { color: diffColor }]}>{isOver ? 'Over' : 'Diff'}</Text>
                  </View>
                </View>
              </View>
            );
          })()}

          {SLOT_ORDER.map((slot) => {
            const slotEntries = grouped[slot];
            const limit = SLOT_LIMITS[slot];
            const emptyCount = Math.max(0, limit - slotEntries.length);
            return (
              <View key={slot} style={styles.slotSection}>
                <View style={styles.slotHeader}>
                  <Text style={styles.slotTitle}>{SLOT_LABELS[slot]}</Text>
                  <Text style={styles.slotCount}>{slotEntries.length}/{limit}</Text>
                </View>

                {slotEntries.map((entry) => {
                    const isAutoplanPlaceholder = entry.recipeId.startsWith('autoplan_') && entry.recipe?.status === 'building';
                    const isGenerating = generatingIds.has(entry.id);
                    const handleCardTap = () => {
                      if (isGenerating) return;
                      if (isAutoplanPlaceholder) {
                        // Still building — generate the full recipe in background
                        handleGenerateRecipe(entry);
                      } else if (!entry.isQuickAdd) {
                        // Ready recipe — check if it's from meal plan (has servingCount)
                        const sc = entry.servingCount;
                        if (sc) {
                          // Meal plan flow: go to ingredient checklist with exact serving count
                          router.push({
                            pathname: '/screens/IngredientChecklistScreen',
                            params: {
                              recipeId: entry.recipeId,
                              quantityTier: sc <= 3 ? '2-3 servings' : '4-6 servings',
                              mealPlanServings: String(sc),
                            },
                          });
                        } else {
                          // Regular flow: go to recipe overview
                          router.push({
                            pathname: '/screens/RecipeOverviewScreen',
                            params: { recipeId: entry.recipeId, quantityTier: '2-3 servings' },
                          });
                        }
                      }
                    };
                    return (
                      <TouchableOpacity key={entry.id} style={styles.card} onPress={handleCardTap} activeOpacity={0.85}>
                        {/* Full hero with overlaid info */}
                        <View style={styles.cardHero}>
                          {entry.imageUri ? (
                            <Image source={{ uri: entry.imageUri }} style={styles.cardHeroImg} contentFit="cover" />
                          ) : entry.builtinImage ? (
                            <Image source={entry.builtinImage} style={styles.cardHeroImg} contentFit="cover" />
                          ) : (
                            <LinearGradient colors={['#3D1A0A', '#1A0500']} style={styles.cardHeroFallback}>
                              <Text style={styles.cardHeroEmoji}>{entry.proteinEmoji}</Text>
                            </LinearGradient>
                          )}
                          {/* Top gradient for macro pills */}
                          <LinearGradient colors={['rgba(0,0,0,0.65)', 'transparent']} style={styles.cardTopGradient} />
                          {/* Bottom gradient for title */}
                          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.80)']} style={styles.cardHeroGradient} />

                          {/* Top row: macros + remove */}
                          <View style={styles.cardTopRow}>
                            <View style={styles.cardMacroPills}>
                              {entry.calories > 0 && <Text style={styles.cardMacroPill}>🔥 {entry.calories}</Text>}
                              {entry.proteinG > 0 && <Text style={[styles.cardMacroPill, styles.cardMacroPillProtein]}>💪 {entry.proteinG}g</Text>}
                              {entry.carbsG > 0 && <Text style={styles.cardMacroPill}>🌾 {entry.carbsG}g</Text>}
                              {entry.fatG > 0 && <Text style={styles.cardMacroPill}>🥑 {entry.fatG}g</Text>}
                            </View>
                            <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(entry)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Text style={styles.removeBtnText}>✕</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Bottom: title + correct macros */}
                          <View style={styles.cardBottomRow}>
                            <Text style={styles.cardOverlayTitle} numberOfLines={2}>{entry.recipeName}</Text>
                            <View style={styles.cardBottomActions}>
                              <TouchableOpacity style={styles.updateBtnOverlay} onPress={(e) => { e.stopPropagation(); openCorrectMacros(entry); }} activeOpacity={0.75}>
                                <Text style={styles.updateBtnOverlayText}>📸 Update</Text>
                              </TouchableOpacity>
                              {isAutoplanPlaceholder && !isGenerating && (
                                <Text style={styles.tapToGenerate}>Tap to generate</Text>
                              )}
                              {isGenerating && (
                                <View style={styles.generatingRow}>
                                  <ActivityIndicator color="#FFFFFF" size="small" />
                                  <Text style={styles.generatingText}>Generating...</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                {/* Empty slot placeholders — tappable to add */}
                {Array.from({ length: emptyCount }).map((_, i) => (
                  <TouchableOpacity
                    key={`empty-${slot}-${i}`}
                    style={styles.emptySlot}
                    onPress={() => {
                      Alert.alert('Add to ' + SLOT_LABELS[slot].replace(/^[^\s]+\s/, ''), 'How would you like to add a meal?', [
                        { text: 'Browse Recipes', onPress: openBrowseRecipeHelp },
                        { text: 'Quick Add Meal', onPress: () => openQuickAdd(slot) },
                        { text: 'Cancel', style: 'cancel' },
                      ]);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.emptySlotPlus}>+</Text>
                    <Text style={styles.emptySlotText}>Add Meal</Text>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Browse recipe instruction modal */}
      <Modal visible={browseHelpVisible} transparent animationType="fade" onRequestClose={() => setBrowseHelpVisible(false)} statusBarTranslucent>
        <Pressable style={styles.browseHelpBackdrop} onPress={() => setBrowseHelpVisible(false)}>
          <Pressable style={styles.browseHelpSheet} onPress={() => {}}>
            <View style={styles.browseHelpIcon}>
              <Text style={styles.browseHelpIconText}>📅</Text>
            </View>
            <Text style={styles.browseHelpTitle}>Add Recipes to Meal Plan</Text>
            <Text style={styles.browseHelpText}>Long press any recipe to add it to your meal plan.</Text>
            <TouchableOpacity
              style={styles.browseHelpPrimary}
              onPress={() => {
                setBrowseHelpVisible(false);
                router.push('/screens/ProteinSelectionScreen');
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.browseHelpPrimaryText}>Browse Recipes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.browseHelpSecondary}
              onPress={() => setBrowseHelpVisible(false)}
              activeOpacity={0.75}
            >
              <Text style={styles.browseHelpSecondaryText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Quick Add Meal Modal */}
      <Modal visible={quickAddOpen} transparent animationType="fade" onRequestClose={() => { Keyboard.dismiss(); closeQuickAdd(); }} statusBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.cmBackdrop} onPress={() => { Keyboard.dismiss(); closeQuickAdd(); }}>
          <ScrollView>
          <Pressable style={styles.cmSheet} onPress={() => Keyboard.dismiss()}>
            <View style={styles.cmHandle} />
            <Text style={styles.cmTitle}>Quick Add Meal</Text>

            {/* Meal name */}
            <TextInput
              style={styles.qaNameInput}
              value={quickAddName}
              onChangeText={setQuickAddName}
              placeholder="Meal name (e.g., Chipotle Bowl)"
              placeholderTextColor="rgba(255,255,255,0.30)"
              returnKeyType="done"
            />

            {!quickAddManualMode && !quickAddEstimated && !quickAddScanning && (
              <>
            <Text style={styles.qaScaleTip}>Tip: hold a fork or your hand next to the food — it helps estimate portion size</Text>
            <View style={styles.cmFrameGrid}>
              {[0, 1, 2, 3].map((idx) => {
                const photo = quickAddPhotos[idx];
                return (
                  <View key={idx} style={styles.cmFrame}>
                    {photo ? (
                      <>
                        <Image source={{ uri: photo.uri }} style={styles.cmFrameImg} contentFit="cover" cachePolicy="none" />
                        <TouchableOpacity style={styles.cmFrameRemoveLeft} onPress={() => removeQuickAddPhoto(idx)}>
                          <Text style={styles.cmFrameRemoveText}>x</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity
                        style={styles.cmFrameEmpty}
                        onPress={() => Alert.alert('Add Photo', 'How would you like to add?', [
                          { text: 'Camera', onPress: () => pickQuickAddPhoto(true) },
                          { text: 'Gallery', onPress: () => pickQuickAddPhoto(false) },
                          { text: 'Cancel', style: 'cancel' },
                        ])}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.cmFrameEmptyIcon}>+</Text>
                        <Text style={styles.cmFrameEmptyLabel}>Photo {idx + 1}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Restaurant vs home toggle */}
            <View style={styles.qaPortionRow}>
              <Text style={styles.qaPortionHint}>Portion type</Text>
              <View style={styles.qaPortionBtns}>
                <TouchableOpacity
                  style={[styles.qaPortionBtn, quickAddPortionType === 'home' && styles.qaPortionBtnActive]}
                  onPress={() => setQuickAddPortionType(quickAddPortionType === 'home' ? null : 'home')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.qaPortionBtnText, quickAddPortionType === 'home' && styles.qaPortionBtnTextActive]}>🏠 Home</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.qaPortionBtn, quickAddPortionType === 'restaurant' && styles.qaPortionBtnActive]}
                  onPress={() => setQuickAddPortionType(quickAddPortionType === 'restaurant' ? null : 'restaurant')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.qaPortionBtnText, quickAddPortionType === 'restaurant' && styles.qaPortionBtnTextActive]}>🍴 Restaurant</Text>
                </TouchableOpacity>
              </View>
            </View>

            {quickAddPhotos.length > 0 && (
              <TouchableOpacity style={styles.cmAnalyzeBtn} onPress={analyzeQuickAddPhotos} activeOpacity={0.8}>
                <Text style={styles.cmAnalyzeBtnText}>{quickAddScanning ? 'Analyzing...' : `Analyze Meal (${quickAddPhotos.length} photo${quickAddPhotos.length > 1 ? 's' : ''})`}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cmManualBtn} onPress={() => setQuickAddManualMode(true)} activeOpacity={0.8}>
              <Text style={styles.cmManualBtnText}>Enter Manually</Text>
            </TouchableOpacity>
              </>
            )}

            {quickAddScanning && (
              <View style={styles.cmAnalyzing}>
                <ActivityIndicator color={ORANGE} size="small" />
                <Text style={styles.cmAnalyzingText}>Analyzing {quickAddPhotos.length} photo{quickAddPhotos.length > 1 ? 's' : ''}...</Text>
              </View>
            )}

            {(quickAddManualMode || quickAddEstimated) && !quickAddScanning && (
              <>

            {/* Photo section */}
            {false ? (
              <View style={styles.cmBtnRow}>
                <TouchableOpacity style={styles.cmPhotoBtn} onPress={() => pickQuickAddPhoto(true)} activeOpacity={0.75}>
                  <Text style={styles.cmPhotoBtnText}>📷 Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cmPhotoBtn} onPress={() => pickQuickAddPhoto(false)} activeOpacity={0.75}>
                  <Text style={styles.cmPhotoBtnText}>🖼 Gallery</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.qaPhotoRow}>
                <Image source={{ uri: quickAddPhoto ?? '' }} style={styles.qaPhotoThumb} contentFit="cover" />
                <TouchableOpacity onPress={() => { setQuickAddPhoto(null); setQuickAddBase64(''); }} activeOpacity={0.7}>
                  <Text style={styles.qaPhotoChange}>Change</Text>
                </TouchableOpacity>
                {quickAddScanning && <ActivityIndicator color={ORANGE} size="small" style={{ marginLeft: 8 }} />}
              </View>
            )}

            {/* Cal AI breakdown card */}
            {quickAddEstimated && quickAddComponents.length > 0 && (
              <View style={styles.qaBreakdownCard}>
                <View style={styles.qaBreakdownHeader}>
                  <Text style={styles.qaBreakdownTitle}>What we found</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.qaConfBadge, {
                      backgroundColor:
                        quickAddConfidence === 'high' ? 'rgba(34,197,94,0.18)' :
                        quickAddConfidence === 'low'  ? 'rgba(239,68,68,0.18)' :
                                                        'rgba(245,158,11,0.18)',
                    }]}>
                      <Text style={[styles.qaConfText, {
                        color:
                          quickAddConfidence === 'high' ? '#22C55E' :
                          quickAddConfidence === 'low'  ? '#EF4444' : '#F59E0B',
                      }]}>
                        {quickAddConfidence === 'high' ? 'High' : quickAddConfidence === 'low' ? 'Low' : 'Medium'} confidence
                      </Text>
                    </View>
                    {!quickAddComponentEditMode && (
                      <TouchableOpacity onPress={enterQuickAddEditMode} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.qaEditBtn}>Edit</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {!quickAddComponentEditMode ? (
                  <>
                    {quickAddComponents.map((c, i) => (
                      <Text key={i} style={styles.qaBreakdownItem}>· {c}</Text>
                    ))}
                    {quickAddCalRange && (
                      <Text style={styles.qaCalRange}>Est. range: {quickAddCalRange.min}–{quickAddCalRange.max} kcal</Text>
                    )}
                  </>
                ) : (
                  <>
                    {quickAddEditableComponents.map((c, i) => (
                      <View key={i} style={styles.qaEditRow}>
                        <TextInput
                          style={styles.qaEditInput}
                          value={c}
                          onChangeText={(v) => {
                            const updated = [...quickAddEditableComponents];
                            updated[i] = v;
                            setQuickAddEditableComponents(updated);
                          }}
                          multiline
                          returnKeyType="done"
                          blurOnSubmit
                        />
                        <TouchableOpacity onPress={() => setQuickAddEditableComponents((prev) => prev.filter((_, j) => j !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={styles.qaEditRemove}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <View style={styles.qaEditRow}>
                      <TextInput
                        style={[styles.qaEditInput, { opacity: 0.65 }]}
                        value={quickAddNewIngredient}
                        onChangeText={setQuickAddNewIngredient}
                        placeholder="Add item (e.g. 1 tbsp olive oil)"
                        placeholderTextColor="rgba(255,255,255,0.25)"
                        returnKeyType="done"
                        blurOnSubmit
                      />
                    </View>
                    <TouchableOpacity
                      style={[styles.cmAnalyzeBtn, { marginTop: 10, marginBottom: 0 }]}
                      onPress={recalculateQuickAddMacros}
                      disabled={quickAddRecalculating}
                      activeOpacity={0.8}
                    >
                      {quickAddRecalculating
                        ? <ActivityIndicator color="#FFF" size="small" />
                        : <Text style={styles.cmAnalyzeBtnText}>Recalculate Macros</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setQuickAddComponentEditMode(false)} style={{ marginTop: 10, alignItems: 'center' }}>
                      <Text style={styles.qaEditCancel}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {/* Feedback row */}
            {quickAddEstimated && !quickAddReanalyzing && quickAddFeedback !== 'ok' && (
              <View style={styles.qaFeedbackSection}>
                <Text style={styles.qaFeedbackLabel}>Does this look right?</Text>
                <View style={styles.qaFeedbackBtns}>
                  <TouchableOpacity style={styles.qaFeedbackBtn} onPress={() => handleQuickAddFeedback('too_low')} activeOpacity={0.75}>
                    <Text style={styles.qaFeedbackBtnText}>↑ Too low</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.qaFeedbackBtn, styles.qaFeedbackOkBtn]} onPress={() => handleQuickAddFeedback('ok')} activeOpacity={0.75}>
                    <Text style={[styles.qaFeedbackBtnText, { color: '#22C55E' }]}>✓ Looks right</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.qaFeedbackBtn} onPress={() => handleQuickAddFeedback('too_high')} activeOpacity={0.75}>
                    <Text style={styles.qaFeedbackBtnText}>↓ Too high</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {quickAddReanalyzing && (
              <View style={styles.cmAnalyzing}>
                <ActivityIndicator color={ORANGE} size="small" />
                <Text style={styles.cmAnalyzingText}>Revising estimate...</Text>
              </View>
            )}
            {quickAddFeedback === 'ok' && (
              <Text style={styles.qaFeedbackOkText}>✓ Estimate confirmed</Text>
            )}

            {/* Macro inputs */}
            <Text style={[styles.cmSectionLabel, { marginTop: 16 }]}>MACROS</Text>
            <View style={styles.cmManualGrid}>
              <View style={styles.cmManualField}>
                <Text style={styles.cmManualLabel}>Calories</Text>
                <TextInput
                  style={styles.cmManualInput}
                  value={quickAddMacros.calories}
                  onChangeText={(v) => setQuickAddMacros((p) => ({ ...p, calories: v }))}
                  keyboardType="numeric"
                  returnKeyType="done"
                  placeholder="0"
                  placeholderTextColor="rgba(255,255,255,0.20)"
                />
                {quickAddCalRange && quickAddEstimated && (
                  <Text style={styles.qaCalRangeInline}>{quickAddCalRange.min}–{quickAddCalRange.max}</Text>
                )}
              </View>
              <View style={styles.cmManualField}>
                <Text style={[styles.cmManualLabel, { color: ORANGE }]}>Protein (g)</Text>
                <TextInput
                  style={styles.cmManualInput}
                  value={quickAddMacros.proteinG}
                  onChangeText={(v) => setQuickAddMacros((p) => ({ ...p, proteinG: v }))}
                  keyboardType="numeric"
                  returnKeyType="done"
                  placeholder="0"
                  placeholderTextColor="rgba(255,255,255,0.20)"
                />
              </View>
              <View style={styles.cmManualField}>
                <Text style={styles.cmManualLabel}>Carbs (g)</Text>
                <TextInput
                  style={styles.cmManualInput}
                  value={quickAddMacros.carbsG}
                  onChangeText={(v) => setQuickAddMacros((p) => ({ ...p, carbsG: v }))}
                  keyboardType="numeric"
                  returnKeyType="done"
                  placeholder="0"
                  placeholderTextColor="rgba(255,255,255,0.20)"
                />
              </View>
              <View style={styles.cmManualField}>
                <Text style={styles.cmManualLabel}>Fat (g)</Text>
                <TextInput
                  style={styles.cmManualInput}
                  value={quickAddMacros.fatG}
                  onChangeText={(v) => setQuickAddMacros((p) => ({ ...p, fatG: v }))}
                  keyboardType="numeric"
                  returnKeyType="done"
                  placeholder="0"
                  placeholderTextColor="rgba(255,255,255,0.20)"
                />
              </View>
            </View>

            {/* Save button */}
            <TouchableOpacity style={styles.cmApplyBtn} onPress={saveQuickAdd} activeOpacity={0.8}>
              <Text style={styles.cmApplyBtnText}>Save</Text>
            </TouchableOpacity>
              </>
            )}
          </Pressable>
          </ScrollView>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Update Meal Modal — Multi-photo + Manual entry */}
      <Modal visible={!!correctEntry} transparent animationType="fade" onRequestClose={() => { Keyboard.dismiss(); closeCorrectMacros(); }} statusBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.cmBackdrop} onPress={() => { Keyboard.dismiss(); closeCorrectMacros(); }}>
          <ScrollView>
          <Pressable style={styles.cmSheet} onPress={() => Keyboard.dismiss()}>
            <View style={styles.cmHandle} />
            <Text style={styles.cmTitle}>Update Meal</Text>
            <Text style={styles.cmRecipeName}>{correctEntry?.recipeName}</Text>

            {/* Current macros */}
            <View style={styles.cmSection}>
              <Text style={styles.cmSectionLabel}>CURRENT</Text>
              <View style={styles.cmMacroRow}>
                <Text style={styles.cmMacroVal}>{correctEntry?.calories ?? 0} kcal</Text>
                <Text style={styles.cmMacroDot}>·</Text>
                <Text style={[styles.cmMacroVal, { color: ORANGE }]}>{correctEntry?.proteinG ?? 0}g P</Text>
                <Text style={styles.cmMacroDot}>·</Text>
                <Text style={styles.cmMacroVal}>{correctEntry?.carbsG ?? 0}g C</Text>
                <Text style={styles.cmMacroDot}>·</Text>
                <Text style={styles.cmMacroVal}>{correctEntry?.fatG ?? 0}g F</Text>
              </View>
            </View>

            {/* Manual entry mode */}
            {manualMode && !correcting && (
              <View style={styles.cmManualWrap}>
                <View style={styles.cmManualGrid}>
                  <View style={styles.cmManualField}>
                    <Text style={styles.cmManualLabel}>Calories</Text>
                    <TextInput style={styles.cmManualInput} value={manualCal} onChangeText={setManualCal} keyboardType="numeric" returnKeyType="done" placeholder="0" placeholderTextColor="rgba(255,255,255,0.20)" />
                  </View>
                  <View style={styles.cmManualField}>
                    <Text style={[styles.cmManualLabel, { color: ORANGE }]}>Protein (g)</Text>
                    <TextInput style={styles.cmManualInput} value={manualProtein} onChangeText={setManualProtein} keyboardType="numeric" returnKeyType="done" placeholder="0" placeholderTextColor="rgba(255,255,255,0.20)" />
                  </View>
                  <View style={styles.cmManualField}>
                    <Text style={styles.cmManualLabel}>Carbs (g)</Text>
                    <TextInput style={styles.cmManualInput} value={manualCarbs} onChangeText={setManualCarbs} keyboardType="numeric" returnKeyType="done" placeholder="0" placeholderTextColor="rgba(255,255,255,0.20)" />
                  </View>
                  <View style={styles.cmManualField}>
                    <Text style={styles.cmManualLabel}>Fat (g)</Text>
                    <TextInput style={styles.cmManualInput} value={manualFat} onChangeText={setManualFat} keyboardType="numeric" returnKeyType="done" placeholder="0" placeholderTextColor="rgba(255,255,255,0.20)" />
                  </View>
                </View>
                <TouchableOpacity style={styles.cmApplyBtn} onPress={applyManualEntry} activeOpacity={0.8}>
                  <Text style={styles.cmApplyBtnText}>Save Macros</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setManualMode(false)} activeOpacity={0.7}>
                  <Text style={styles.cmManualLink}>Back to photo upload</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Photo mode — 2×2 grid with empty frames */}
            {!manualMode && !correcting && (
              <>
                <Text style={styles.qaScaleTip}>Tip: hold a fork or your hand near the food for better scale</Text>
                <View style={styles.cmFrameGrid}>
                  {[0, 1, 2, 3].map((idx) => {
                    const photo = correctionPhotos[idx];
                    return (
                      <View key={idx} style={styles.cmFrame}>
                        {photo ? (
                          <>
                            <Image source={{ uri: photo.uri }} style={styles.cmFrameImg} contentFit="cover" cachePolicy="none" />
                            <TouchableOpacity style={styles.cmFrameRemoveLeft} onPress={() => removeMealPhoto(idx)}>
                              <Text style={styles.cmFrameRemoveText}>✕</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <TouchableOpacity
                            style={styles.cmFrameEmpty}
                            onPress={() => {
                              if (!correctedMacros) {
                                Alert.alert('Add Photo', 'How would you like to add?', [
                                  { text: '📷 Camera', onPress: () => addMealPhoto(true) },
                                  { text: '🖼 Gallery', onPress: () => addMealPhoto(false) },
                                  { text: 'Cancel', style: 'cancel' },
                                ]);
                              }
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.cmFrameEmptyIcon}>+</Text>
                            <Text style={styles.cmFrameEmptyLabel}>Photo {idx + 1}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>

                {correctionPhotos.length > 0 && (
                  <Text style={styles.cmPhotoCount}>{correctionPhotos.length}/4 photos added</Text>
                )}

                {/* Portion type toggle */}
                <View style={styles.qaPortionRow}>
                  <Text style={styles.qaPortionHint}>Portion type</Text>
                  <View style={styles.qaPortionBtns}>
                    <TouchableOpacity
                      style={[styles.qaPortionBtn, correctionPortionType === 'home' && styles.qaPortionBtnActive]}
                      onPress={() => setCorrectionPortionType(correctionPortionType === 'home' ? null : 'home')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.qaPortionBtnText, correctionPortionType === 'home' && styles.qaPortionBtnTextActive]}>🏠 Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.qaPortionBtn, correctionPortionType === 'restaurant' && styles.qaPortionBtnActive]}
                      onPress={() => setCorrectionPortionType(correctionPortionType === 'restaurant' ? null : 'restaurant')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.qaPortionBtnText, correctionPortionType === 'restaurant' && styles.qaPortionBtnTextActive]}>🍴 Restaurant</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Analyze button */}
                {correctionPhotos.length > 0 && !correctedMacros && (
                  <TouchableOpacity style={styles.cmAnalyzeBtn} onPress={analyzeAllPhotos} activeOpacity={0.8}>
                    <Text style={styles.cmAnalyzeBtnText}>Analyze Meal ({correctionPhotos.length} photo{correctionPhotos.length > 1 ? 's' : ''})</Text>
                  </TouchableOpacity>
                )}

                {/* Results */}
                {correctedMacros && (
                  <View style={styles.cmResultWrap}>

                    {/* Component breakdown card */}
                    {correctionComponents.length > 0 && (
                      <View style={styles.qaBreakdownCard}>
                        <View style={styles.qaBreakdownHeader}>
                          <Text style={styles.qaBreakdownTitle}>What we found</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={[styles.qaConfBadge, {
                              backgroundColor:
                                correctionConfidence === 'high' ? 'rgba(34,197,94,0.18)' :
                                correctionConfidence === 'low'  ? 'rgba(239,68,68,0.18)' :
                                                                  'rgba(245,158,11,0.18)',
                            }]}>
                              <Text style={[styles.qaConfText, {
                                color:
                                  correctionConfidence === 'high' ? '#22C55E' :
                                  correctionConfidence === 'low'  ? '#EF4444' : '#F59E0B',
                              }]}>
                                {correctionConfidence === 'high' ? 'High' : correctionConfidence === 'low' ? 'Low' : 'Medium'} confidence
                              </Text>
                            </View>
                            {!correctionComponentEditMode && (
                              <TouchableOpacity onPress={enterCorrectionEditMode} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Text style={styles.qaEditBtn}>Edit</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>

                        {!correctionComponentEditMode ? (
                          <>
                            {correctionComponents.map((c, i) => (
                              <Text key={i} style={styles.qaBreakdownItem}>· {c}</Text>
                            ))}
                            {correctionCalRange && (
                              <Text style={styles.qaCalRange}>Est. range: {correctionCalRange.min}–{correctionCalRange.max} kcal</Text>
                            )}
                          </>
                        ) : (
                          <>
                            {correctionEditableComponents.map((c, i) => (
                              <View key={i} style={styles.qaEditRow}>
                                <TextInput
                                  style={styles.qaEditInput}
                                  value={c}
                                  onChangeText={(v) => {
                                    const updated = [...correctionEditableComponents];
                                    updated[i] = v;
                                    setCorrectionEditableComponents(updated);
                                  }}
                                  multiline
                                  returnKeyType="done"
                                  blurOnSubmit
                                />
                                <TouchableOpacity onPress={() => setCorrectionEditableComponents((prev) => prev.filter((_, j) => j !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                  <Text style={styles.qaEditRemove}>×</Text>
                                </TouchableOpacity>
                              </View>
                            ))}
                            <View style={styles.qaEditRow}>
                              <TextInput
                                style={[styles.qaEditInput, { opacity: 0.65 }]}
                                value={correctionNewIngredient}
                                onChangeText={setCorrectionNewIngredient}
                                placeholder="Add item (e.g. 1 tbsp olive oil)"
                                placeholderTextColor="rgba(255,255,255,0.25)"
                                returnKeyType="done"
                                blurOnSubmit
                              />
                            </View>
                            <TouchableOpacity
                              style={[styles.cmAnalyzeBtn, { marginTop: 10, marginBottom: 0 }]}
                              onPress={recalculateCorrectionMacros}
                              disabled={correctionRecalculating}
                              activeOpacity={0.8}
                            >
                              {correctionRecalculating
                                ? <ActivityIndicator color="#FFF" size="small" />
                                : <Text style={styles.cmAnalyzeBtnText}>Recalculate Macros</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setCorrectionComponentEditMode(false)} style={{ marginTop: 10, alignItems: 'center' }}>
                              <Text style={styles.qaEditCancel}>Cancel</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    )}

                    {/* Macro totals */}
                    <Text style={[styles.cmSectionLabel, { marginTop: 12 }]}>AI-ESTIMATED TOTAL</Text>
                    <View style={styles.cmMacroRow}>
                      <Text style={[styles.cmMacroVal, styles.cmMacroNew]}>{correctedMacros.calories} kcal</Text>
                      <Text style={styles.cmMacroDot}>·</Text>
                      <Text style={[styles.cmMacroVal, { color: ORANGE }]}>{correctedMacros.proteinG}g P</Text>
                      <Text style={styles.cmMacroDot}>·</Text>
                      <Text style={[styles.cmMacroVal, styles.cmMacroNew]}>{correctedMacros.carbsG}g C</Text>
                      <Text style={styles.cmMacroDot}>·</Text>
                      <Text style={[styles.cmMacroVal, styles.cmMacroNew]}>{correctedMacros.fatG}g F</Text>
                    </View>

                    {/* Feedback row */}
                    {!correctionReanalyzing && correctionFeedback !== 'ok' && (
                      <View style={[styles.qaFeedbackSection, { marginTop: 10 }]}>
                        <Text style={styles.qaFeedbackLabel}>Does this look right?</Text>
                        <View style={styles.qaFeedbackBtns}>
                          <TouchableOpacity style={styles.qaFeedbackBtn} onPress={() => handleCorrectionFeedback('too_low')} activeOpacity={0.75}>
                            <Text style={styles.qaFeedbackBtnText}>↑ Too low</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.qaFeedbackBtn, styles.qaFeedbackOkBtn]} onPress={() => handleCorrectionFeedback('ok')} activeOpacity={0.75}>
                            <Text style={[styles.qaFeedbackBtnText, { color: '#22C55E' }]}>✓ Looks right</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.qaFeedbackBtn} onPress={() => handleCorrectionFeedback('too_high')} activeOpacity={0.75}>
                            <Text style={styles.qaFeedbackBtnText}>↓ Too high</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                    {correctionReanalyzing && (
                      <View style={[styles.cmAnalyzing, { marginTop: 10 }]}>
                        <ActivityIndicator color={ORANGE} size="small" />
                        <Text style={styles.cmAnalyzingText}>Revising estimate...</Text>
                      </View>
                    )}
                    {correctionFeedback === 'ok' && (
                      <Text style={[styles.qaFeedbackOkText, { marginTop: 8 }]}>✓ Estimate confirmed</Text>
                    )}

                    <View style={[styles.cmBtnRow, { marginTop: 14 }]}>
                      <TouchableOpacity style={styles.cmApplyBtn} onPress={applyCorrection} activeOpacity={0.8}>
                        <Text style={styles.cmApplyBtnText}>Apply</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.cmRetryBtn} onPress={() => { setCorrectionPhotos([]); setCorrectedMacros(null); setCorrectionComponents([]); setCorrectionCalRange(null); setCorrectionConfidence(null); setCorrectionFeedback(null); }} activeOpacity={0.75}>
                        <Text style={styles.cmRetryBtnText}>Retake All</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Manual entry link */}
                {!correctedMacros && (
                  <TouchableOpacity style={styles.cmManualBtn} onPress={() => {
                    setManualMode(true);
                    setManualCal(String(correctEntry?.calories ?? ''));
                    setManualProtein(String(correctEntry?.proteinG ?? ''));
                    setManualCarbs(String(correctEntry?.carbsG ?? ''));
                    setManualFat(String(correctEntry?.fatG ?? ''));
                  }} activeOpacity={0.8}>
                    <Text style={styles.cmManualBtnText}>✏️ Enter Manually</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Analyzing */}
            {correcting && (
              <View style={styles.cmAnalyzing}>
                <ActivityIndicator color={ORANGE} size="small" />
                <Text style={styles.cmAnalyzingText}>Analyzing {correctionPhotos.length} photo{correctionPhotos.length > 1 ? 's' : ''}...</Text>
              </View>
            )}
          </Pressable>
          </ScrollView>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </PremiumScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(248,241,232,0.12)',
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  autoPlanBtn: {
    backgroundColor: 'rgba(143,58,31,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.35)',
  },
  autoPlanBtnText: { fontSize: 12, fontWeight: '700', color: ORANGE },
  todayBtn: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.40)' },
  todayBtnActive: { color: ORANGE },

  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(248,241,232,0.12)',
  },
  navArrow: { fontSize: 34, color: ORANGE, fontWeight: '700', lineHeight: 38 },
  dayCenter: { alignItems: 'center', gap: 6 },
  dayLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  calendarHint: { fontSize: 12, color: ORANGE, marginTop: 2 },
  todayPill: {
    backgroundColor: 'rgba(143,58,31,0.20)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.45)',
  },
  todayPillText: { fontSize: 10, fontWeight: '800', color: ORANGE, letterSpacing: 1 },

  browseHelpBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  browseHelpSheet: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.16)',
    backgroundColor: 'rgba(29,24,20,0.96)',
    padding: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.48, shadowRadius: 24, shadowOffset: { width: 0, height: 14 } },
      android: { elevation: 16 },
    }),
  },
  browseHelpIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(143,58,31,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.55)',
    marginBottom: 14,
  },
  browseHelpIconText: { fontSize: 30 },
  browseHelpTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 8, fontFamily: PLAYFAIR },
  browseHelpText: { color: 'rgba(248,241,232,0.76)', fontSize: 15, fontWeight: '700', lineHeight: 22, textAlign: 'center', marginBottom: 22 },
  browseHelpPrimary: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: ORANGE,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  browseHelpPrimaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  browseHelpSecondary: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
    backgroundColor: 'rgba(248,241,232,0.06)',
    paddingVertical: 14,
    alignItems: 'center',
  },
  browseHelpSecondaryText: { color: 'rgba(248,241,232,0.72)', fontSize: 15, fontWeight: '800' },

  // Calendar picker modal
  calBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  calSheet: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
      android: { elevation: 16 },
    }),
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  calNavArrow: { fontSize: 28, color: ORANGE, fontWeight: '700', lineHeight: 32 },
  calMonthTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
  calDayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  calDayName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 100,
  },
  calCellSelected: {
    backgroundColor: ORANGE,
  },
  calCellToday: {
    borderWidth: 1.5,
    borderColor: ORANGE,
  },
  calCellText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.80)',
  },
  calCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  calCellTextToday: {
    color: ORANGE,
    fontWeight: '800',
  },
  calTodayBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(143,58,31,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.35)',
    alignItems: 'center',
  },
  calTodayBtnText: { fontSize: 14, fontWeight: '700', color: ORANGE },

  scroll: { paddingHorizontal: 20, paddingTop: 16 },

  // Servings selector
  servingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  servingsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
  },
  servingsControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  servingsBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  servingsBtnText: { fontSize: 18, fontWeight: '700', color: ORANGE },
  servingsValue: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', minWidth: 24, textAlign: 'center' },

  // Macro summary bar
  // Macro rings
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 20,
  },

  // Calorie equation card
  calEqCard: {
    backgroundColor: SURFACE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 24,
  },
  calEqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calEqItem: {
    flex: 1,
    alignItems: 'center',
  },
  calEqNum: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  calEqLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  calEqOp: {
    fontSize: 22,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.25)',
    paddingBottom: 16,
  },

  // Slot sections
  slotSection: { marginBottom: 28 },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  slotTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  slotCount: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.30)',
  },
  emptySlot: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(143,58,31,0.25)',
    borderStyle: 'dashed',
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptySlotPlus: {
    fontSize: 28,
    fontWeight: '300',
    color: ORANGE,
    marginBottom: 4,
  },
  emptySlotText: { color: 'rgba(255,255,255,0.40)', fontSize: 13, fontWeight: '600' },

  // Recipe hero card
  card: {
    width: CARD_W,
    backgroundColor: SURFACE,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BORDER,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 6 },
    }),
  },
  // Compact card — everything on hero image
  cardHero: { height: 180, position: 'relative' },
  cardHeroImg: { width: '100%', height: '100%' },
  cardHeroFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeroEmoji: { fontSize: 56 },
  cardTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  cardHeroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },

  // Top row: macro pills + remove
  cardTopRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 10,
  },
  cardMacroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1, marginRight: 8 },
  cardMacroPill: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  cardMacroPillProtein: {
    backgroundColor: 'rgba(143,58,31,0.55)',
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  // Bottom row: title + correct macros
  cardBottomRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
  },
  cardOverlayTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 20,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardBottomActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  updateBtnOverlay: {
    backgroundColor: 'rgba(143,58,31,0.25)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.50)',
  },
  updateBtnOverlayText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  tapToGenerate: { fontSize: 11, fontWeight: '600', color: ORANGE, fontStyle: 'italic' },
  generatingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  generatingText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.70)' },

  // Correct Macros modal
  cmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cmSheet: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    paddingBottom: 32,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
      android: { elevation: 16 },
    }),
  },
  cmHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  cmTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 4 },
  cmRecipeName: { fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginBottom: 16 },
  cmSection: { marginBottom: 16 },
  cmSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  cmMacroRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cmMacroVal: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.80)' },
  cmMacroNew: { color: '#22C55E' },
  cmMacroDot: { fontSize: 14, color: 'rgba(255,255,255,0.20)' },
  cmPhotoActions: { alignItems: 'center', gap: 14, marginBottom: 8 },
  cmPhotoHint: { fontSize: 13, color: 'rgba(255,255,255,0.50)', textAlign: 'center', lineHeight: 20 },
  cmBtnRow: { flexDirection: 'row', gap: 10 },
  cmPhotoBtn: {
    flex: 1,
    backgroundColor: 'rgba(143,58,31,0.20)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.40)',
  },
  cmPhotoBtnText: { fontSize: 14, fontWeight: '700', color: ORANGE },
  cmAnalyzing: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  cmAnalyzingText: { fontSize: 14, color: 'rgba(255,255,255,0.55)' },
  cmResultWrap: { gap: 12 },
  cmPhotoPreview: { width: '100%', height: 160, borderRadius: 14 },
  cmApplyBtn: {
    flex: 2,
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cmApplyBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  cmRetryBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  cmRetryBtnText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.60)' },
  // Quick Add styles
  qaNameInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#FFFFFF',
    fontSize: 15,
    marginBottom: 14,
  },
  qaPhotoRow: {
    display: 'none',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  qaPhotoThumb: {
    width: 80,
    height: 60,
    borderRadius: 10,
  },
  qaPhotoChange: {
    fontSize: 13,
    fontWeight: '700',
    color: ORANGE,
  },

  // Scale tip + portion type
  qaScaleTip: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.38)',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 17,
  },
  qaPortionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  qaPortionHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  qaPortionBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  qaPortionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  qaPortionBtnActive: {
    borderColor: ORANGE,
    backgroundColor: 'rgba(143,58,31,0.25)',
  },
  qaPortionBtnText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
  },
  qaPortionBtnTextActive: {
    color: '#E8A87C',
  },

  // Feedback row
  qaFeedbackSection: {
    marginTop: 4,
    marginBottom: 8,
  },
  qaFeedbackLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.40)',
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  qaFeedbackBtns: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  qaFeedbackBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  qaFeedbackOkBtn: {
    borderColor: 'rgba(34,197,94,0.3)',
    backgroundColor: 'rgba(34,197,94,0.06)',
  },
  qaFeedbackBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.60)',
  },
  qaFeedbackOkText: {
    fontSize: 12,
    color: '#22C55E',
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '600',
  },

  // Inline calorie range under the calories field
  qaCalRangeInline: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.32)',
    marginTop: 3,
    textAlign: 'center',
  },

  // Cal AI breakdown card
  qaBreakdownCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  qaBreakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  qaBreakdownTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  qaBreakdownItem: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.70)',
    lineHeight: 20,
    marginBottom: 1,
  },
  qaConfBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  qaConfText: {
    fontSize: 11,
    fontWeight: '700',
  },
  qaCalRange: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
    marginTop: 8,
  },
  qaEditBtn: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E85D26',
  },
  qaEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  qaEditInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#FFFFFF',
  },
  qaEditRemove: {
    fontSize: 20,
    color: 'rgba(239,68,68,0.8)',
    lineHeight: 24,
    paddingHorizontal: 4,
  },
  qaEditCancel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.40)',
    textDecorationLine: 'underline',
  },

  // 2×2 frame grid
  cmPhotoHintText: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginBottom: 12 },
  cmFrameGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  cmFrame: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    position: 'relative',
  },
  cmFrameImg: { width: '100%', height: '100%' },
  cmFrameRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cmFrameRemoveLeft: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cmFrameRemoveText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  cmFrameEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(143,58,31,0.25)',
    borderStyle: 'dashed',
    borderRadius: 13,
    margin: 1,
    gap: 4,
  },
  cmFrameEmptyIcon: { fontSize: 28, fontWeight: '300', color: ORANGE },
  cmFrameEmptyLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.35)' },
  cmPhotoCount: { fontSize: 12, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginBottom: 10, fontWeight: '600' },
  cmAnalyzeBtn: {
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 8,
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 4 },
    }),
  },
  cmAnalyzeBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  cmOptions: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  cmOptionCard: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 6,
  },
  cmOptionEmoji: { fontSize: 28 },
  cmOptionLabel: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  cmOptionDesc: { fontSize: 11, color: 'rgba(255,255,255,0.40)', textAlign: 'center', paddingHorizontal: 8 },

  cmManualBtn: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  cmManualBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  cmManualLink: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.50)',
    textDecorationLine: 'underline',
    marginTop: 4,
  },
  cmManualWrap: { gap: 12 },
  cmManualGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cmManualField: {
    width: '47%',
    gap: 4,
  },
  cmManualLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.50)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cmManualInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
});
