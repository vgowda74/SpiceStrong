/**
 * MealPlanScreen.tsx — SpiceStrong
 * Fancy day-by-day meal plan view.
 * - Day navigator in header (← Month Day, Year →)
 * - Daily macro summary bar (total cal, protein, carbs, fat)
 * - Hero image recipe cards per meal slot, styled like RecipeListScreen
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
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
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
import { getFitnessProfile, calculateMacroTargets, type MacroTargets } from '../../services/fitnessProfileService';
import Svg, { Circle } from 'react-native-svg';
import { HomeButton } from '../../components/HomeButton';
import { ProcessingRing } from '../../components/ProcessingRing';
import { logScreenView } from '../../services/firebaseAnalytics';
import { invokeAnthropicMessages } from '../../services/anthropicService';

const MACRO_OVERRIDE_PREFIX = 'spicestrong_macro_override_';
const TRACKING_START_KEY = 'spicestrong_tracking_start_date';
const TRACKER_CACHE_PREFIX = 'spicestrong_tracker_snapshot_';
const TRACKER_CACHE_VERSION = 2;

interface MacroOverride {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  description?: string;
  components?: string[];
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
  const list = components.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const data = await invokeAnthropicMessages({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `You are a nutrition expert. Calculate total macros for these food items:\n${list}\n\nReturn ONLY this JSON:\n{"calories":0,"caloriesMin":0,"caloriesMax":0,"proteinG":0,"carbsG":0,"fatG":0,"confidence":"medium"}`,
    }],
  });
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
  name: string;
  description: string;
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

function parseIngredientComponent(component: string): { name: string; calories: string; quantity: string } {
  const normalized = component.replace(/—/g, '|').replace(/ - /g, ' | ');
  const parts = normalized.split('|').map((part) => part.trim()).filter(Boolean);
  const name = parts[0]?.replace(/^[-•\s]+/, '') || component;
  const calories = parts.find((part) => /\bcal\b|kcal/i.test(part))?.replace(/^~\s*/, '') ?? '';
  const quantity = parts.find((part) => !/\bcal\b|kcal/i.test(part) && part !== name) ?? '';
  return { name, calories, quantity };
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

  const data = await invokeAnthropicMessages({
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
  "name": "short appetizing food title, e.g. Veggie Omelette with Avocado",
  "description": "one short useful description of the meal or nutrition label",
  "calories": <best single estimate as integer>,
  "caloriesMin": <lower bound — lighter portion, less oil>,
  "caloriesMax": <upper bound — larger portion, more sauce/oil>,
  "proteinG": <integer>,
  "carbsG": <integer>,
  "fatG": <integer>,
  "confidence": "high" | "medium" | "low",
  "components": [
    "Bell pepper | 25 cal | 1/2 cup",
    "Spinach | 15 cal | 1 cup",
    "Eggs | 140 cal | 2 large"
  ],
  "isRestaurantPortion": true | false
}

INGREDIENT RULES:
- Break visible foods into separate simple ingredients whenever possible. Prefer "bell pepper", "spinach", "mixed vegetables", "egg", "cheese", "rice", "sauce" instead of one combined dish line.
- Each component must use this exact format: "Ingredient name | total cal | qty".
- Keep ingredient names short and human-readable.
- Do not include protein/carbs/fat in component rows; only ingredient name, total calories, and quantity.

CONFIDENCE: "high" = label or single obvious item; "medium" = recognizable dish; "low" = blurry/complex/obscured.${portionContext}${feedbackContext}`,
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: `Analyze this meal: "${mealName || 'meal'}". Return the nutrition JSON.` },
        ],
      }],
  });
  const text = data.content?.[0]?.text || '';
  console.log('[SpiceStrong] Cal AI vision response:', text);

  const parsed = extractFirstJson(text);
  const calories = Math.round(Number(parsed.calories) || 0);

  return {
    name: String(parsed.name || ''),
    description: String(parsed.description || ''),
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
const CAL_TRACKER_BACKGROUND = '#100604';
const SURFACE = 'rgba(248,241,232,0.08)';
const BORDER = 'rgba(248,241,232,0.12)';
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'serif',
  default: 'serif',
});

const CARD_W = Dimensions.get('window').width - 36;
const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch_dinner', 'snack_dessert', 'others'];
const SLOT_META: Record<MealSlot, { icon: keyof typeof Ionicons.glyphMap; accent: string; hint: string }> = {
  breakfast: { icon: 'sunny-outline', accent: '#F5A524', hint: 'Start strong' },
  lunch_dinner: { icon: 'restaurant-outline', accent: '#E8671A', hint: 'Fuel the day' },
  snack_dessert: { icon: 'sparkles-outline', accent: '#22C55E', hint: 'Smart finish' },
  others: { icon: 'grid-outline', accent: '#94A3B8', hint: 'Untagged meals' },
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

const RING_SIZE = Math.floor((Dimensions.get('window').width - 72) / 4);
const RING_STROKE = 8;
const RING_R = RING_SIZE / 2 - RING_STROKE / 2 - 2;
const RING_CIRC = 2 * Math.PI * RING_R;

function formatMacroRingValue(value: number, unit: string, showPositiveSign: boolean): string {
  const rounded = Math.round(value);
  const prefix = showPositiveSign && rounded > 0 ? '+' : '';
  return `${prefix}${rounded}${unit}`;
}

function getMacroRingModeMeta(displayMode: 'diff' | 'target' | 'consumed', diff: number) {
  if (displayMode === 'diff') {
    return {
      icon: diff >= 0 ? '▲' : '▼',
      label: 'Diff',
      color: '#FFFFFF',
      bg: diff >= 0 ? 'rgba(34,197,94,0.20)' : 'rgba(245,158,11,0.20)',
      border: diff >= 0 ? 'rgba(134,239,172,0.44)' : 'rgba(253,230,138,0.44)',
    };
  }
  if (displayMode === 'target') {
    return {
      icon: '◎',
      label: 'Target',
      color: '#FFFFFF',
      bg: 'rgba(232,168,124,0.18)',
      border: 'rgba(232,168,124,0.42)',
    };
  }
  return {
    icon: '✓',
    label: 'Eaten',
    color: '#FFFFFF',
    bg: 'rgba(59,130,246,0.18)',
    border: 'rgba(147,197,253,0.36)',
  };
}

function MacroRing({
  label, color, target, consumed, displayMode, onPress, unit = 'g',
}: {
  label: string;
  color: string;
  target: number;
  consumed: number;
  displayMode: 'diff' | 'target' | 'consumed';
  onPress: () => void;
  unit?: string;
}) {
  const ratio = target > 0 ? Math.min(consumed / target, 1) : 0;
  const dashOffset = RING_CIRC * (1 - ratio);
  const diff = consumed - target;
  const cx = RING_SIZE / 2;
  const cy = RING_SIZE / 2;
  const displayValue = displayMode === 'diff' ? diff : displayMode === 'target' ? target : consumed;
  const modeMeta = getMacroRingModeMeta(displayMode, diff);

  return (
    <View style={{ alignItems: 'center', width: RING_SIZE }}>
      <Text style={{ color, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginBottom: 5, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Pressable
        style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}
        onPress={onPress}
      >
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
        <View style={{ alignItems: 'center', maxWidth: RING_SIZE - 10 }}>
          <View style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: modeMeta.bg, borderWidth: 1, borderColor: modeMeta.border, marginBottom: 3 }}>
            <Text style={{ fontSize: 8.5, fontWeight: '900', color: modeMeta.color, letterSpacing: 0.3 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
              {modeMeta.icon} {modeMeta.label}
            </Text>
          </View>
          <View style={{ borderRadius: 11, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: modeMeta.bg, borderWidth: 1, borderColor: modeMeta.border }}>
            <Text style={{ fontSize: 14.5, fontWeight: '900', color: modeMeta.color, lineHeight: 18, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
              {formatMacroRingValue(displayValue, unit, displayMode === 'diff')}
            </Text>
          </View>
        </View>
      </Pressable>
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

interface TrackerCacheSnapshot {
  version: number;
  date: string;
  savedAt: number;
  entries: EnrichedEntry[];
}

interface MacroTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

function dateFromString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function stringFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function trackerCacheKey(date: string) {
  return `${TRACKER_CACHE_PREFIX}${date}`;
}

async function readTrackerCache(date: string): Promise<EnrichedEntry[] | null> {
  try {
    const raw = await AsyncStorage.getItem(trackerCacheKey(date));
    if (!raw) return null;
    const snapshot: TrackerCacheSnapshot = JSON.parse(raw);
    if (
      snapshot.version !== TRACKER_CACHE_VERSION ||
      snapshot.date !== date ||
      !Array.isArray(snapshot.entries)
    ) {
      return null;
    }
    return snapshot.entries;
  } catch {
    return null;
  }
}

async function writeTrackerCache(date: string, entries: EnrichedEntry[]) {
  try {
    const snapshot: TrackerCacheSnapshot = {
      version: TRACKER_CACHE_VERSION,
      date,
      savedAt: Date.now(),
      entries,
    };
    await AsyncStorage.setItem(trackerCacheKey(date), JSON.stringify(snapshot));
  } catch {
    // Cache writes should never block the tracker.
  }
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

function hasLoggedMacros(totals: MacroTotals): boolean {
  return totals.calories > 0 || totals.proteinG > 0 || totals.carbsG > 0 || totals.fatG > 0;
}

function scoreMacroTotals(totals: MacroTotals, targets: MacroTargets): number {
  const score = (consumed: number, target: number) =>
    target > 0 ? Math.max(0, 1 - Math.abs(consumed - target) / target) : 0;
  return (
    score(totals.calories, targets.calories) +
    score(totals.proteinG, targets.proteinG) +
    score(totals.carbsG, targets.carbsG) +
    score(totals.fatG, targets.fatG)
  ) / 4;
}

function getInclusiveDayCount(startDate: string | null, endDate: string): number {
  if (!startDate) return 0;
  const diff = Math.floor((dateFromString(endDate).getTime() - dateFromString(startDate).getTime()) / 86400000);
  return Math.max(0, diff + 1);
}

function getTrackingDates(startDate: string | null, endDate: string): string[] {
  if (!startDate) return [];
  const dates: string[] = [];
  const cursor = dateFromString(startDate);
  const end = dateFromString(endDate);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(stringFromDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

async function getMealEntryMacros(entry: MealPlanEntry): Promise<MacroTotals> {
  let calories = 0, proteinG = 0, carbsG = 0, fatG = 0;

  const applyOverride = async () => {
    try {
      const overrideStr = await AsyncStorage.getItem(`${MACRO_OVERRIDE_PREFIX}${entry.id}`);
      if (overrideStr) {
        const o: MacroOverride = JSON.parse(overrideStr);
        calories = o.calories;
        proteinG = o.proteinG;
        carbsG = o.carbsG;
        fatG = o.fatG;
        return true;
      }
    } catch {}
    return false;
  };

  if (await applyOverride()) return { calories, proteinG, carbsG, fatG };

  const recipe = await getRecipeById(entry.recipeId);
  const isAutoplan = entry.recipeId.startsWith('autoplan_');

  if (isAutoplan && recipe?.aiNutrition && recipe.status !== 'ready') {
    calories = Math.round(recipe.aiNutrition.calories / 2.5);
    proteinG = Math.round(recipe.aiNutrition.proteinG / 2.5);
    carbsG = Math.round(recipe.aiNutrition.carbsG / 2.5);
    fatG = Math.round(recipe.aiNutrition.fatG / 2.5);
  } else if (recipe) {
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

  if (isAutoplan && calories === 0) {
    const desc = entry.recipeName + ' ' + (recipe?.description ?? '');
    const calMatch = desc.match(/~?(\d+)\s*cal/i);
    const proMatch = desc.match(/~?(\d+)g?\s*protein/i);
    if (calMatch) calories = parseInt(calMatch[1], 10);
    if (proMatch) proteinG = parseInt(proMatch[1], 10);
  }

  return { calories, proteinG, carbsG, fatG };
}

export default function MealPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const today = stringFromDate(new Date());
  const [currentDate, setCurrentDate] = useState(today);
  const [enriched, setEnriched] = useState<EnrichedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const activeLoadRef = useRef(0);
  const [macroTargets, setMacroTargets] = useState<MacroTargets | null>(null);
  const [overallAdherencePct, setOverallAdherencePct] = useState<number | null>(null);
  const [overallAdherenceLoading, setOverallAdherenceLoading] = useState(false);
  const [overallLoggedDays, setOverallLoggedDays] = useState(0);
  const [cronometerMode, setCronometerMode] = useState<'diff' | 'target' | 'consumed'>('diff');
  const [trackingStartDate, setTrackingStartDate] = useState<string | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(today);

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

  const updateEnrichedForCurrentDate = useCallback((updater: (entries: EnrichedEntry[]) => EnrichedEntry[]) => {
    setEnriched((prev) => {
      const next = updater(prev);
      void writeTrackerCache(currentDate, next);
      return next;
    });
  }, [currentDate]);

  const openCorrectMacros = async (entry: EnrichedEntry) => {
    setCorrectEntry(entry);
    const initialMacros = {
      calories: Math.round(entry.calories ?? 0),
      proteinG: Math.round(entry.proteinG ?? 0),
      carbsG: Math.round(entry.carbsG ?? 0),
      fatG: Math.round(entry.fatG ?? 0),
    };
    setCorrectedMacros(initialMacros);
    let savedPhotoUris = entry.photoUris ?? (entry.imageUri ? [entry.imageUri] : []);
    let savedComponents: string[] = [];
    try {
      const overrideStr = await AsyncStorage.getItem(`${MACRO_OVERRIDE_PREFIX}${entry.id}`);
      if (overrideStr) {
        const override: MacroOverride = JSON.parse(overrideStr);
        savedPhotoUris = override.photoUris ?? (override.photoUri ? [override.photoUri] : savedPhotoUris);
        savedComponents = override.components ?? [];
      }
    } catch {}
    setCorrectionPhotos(savedPhotoUris.slice(0, MAX_MEAL_PHOTOS).map((uri) => ({ uri, base64: '' })));
    setCorrecting(false);
    setManualMode(false);
    const fallbackComponent = `${entry.recipeName || 'Meal'} | ${initialMacros.calories} cal | 1 serving`;
    setCorrectionComponents(savedComponents.length > 0 ? savedComponents : [fallbackComponent]);
    setCorrectionCalRange(null);
    setCorrectionConfidence(null);
    setCorrectionPortionType(null);
    setCorrectionFeedback(null);
    setCorrectionReanalyzing(false);
    setCorrectionComponentEditMode(true);
    setCorrectionEditableComponents(savedComponents.length > 0 ? savedComponents : [fallbackComponent]);
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
    updateEnrichedForCurrentDate((prev) =>
      prev.map((e) =>
        e.id === correctEntry.id
          ? { ...e, ...macros, imageUri: existingPhotoUris[0] ?? e.imageUri, photoUris: existingPhotoUris }
          : e
      )
    );
    closeCorrectMacros();
  };

  const updateCorrectionMacroNumber = (
    field: 'calories' | 'proteinG' | 'carbsG' | 'fatG',
    value: string,
  ) => {
    const numericValue = Math.max(0, Math.round(Number(value.replace(/[^\d]/g, '')) || 0));
    setCorrectedMacros((prev) => prev ? { ...prev, [field]: numericValue } : prev);
  };

  const updateCorrectionIngredientPart = (
    index: number,
    part: 'name' | 'calories' | 'quantity',
    value: string,
  ) => {
    setCorrectionEditableComponents((prev) => {
      const updated = [...prev];
      const item = parseIngredientComponent(updated[index] ?? '');
      const next = {
        ...item,
        [part]: part === 'calories'
          ? `${value.replace(/[^\d]/g, '') || '0'} cal`
          : value,
      };
      updated[index] = `${next.name || 'Ingredient'} | ${next.calories || '0 cal'} | ${next.quantity || 'qty'}`;
      return updated;
    });
  };

  const addCorrectionIngredient = () => {
    setCorrectionEditableComponents((prev) => [...prev, 'Ingredient | 0 cal | qty']);
  };

  const removeCorrectionIngredient = (index: number) => {
    setCorrectionEditableComponents((prev) => prev.filter((_, i) => i !== index));
  };

  const applyCorrection = async () => {
    if (!correctEntry || !correctedMacros) return;

    const existingPhotoUris = correctEntry.photoUris ?? (correctEntry.imageUri ? [correctEntry.imageUri] : []);
    const components = correctionEditableComponents.filter((item) => item.trim());
    const override: MacroOverride = {
      ...correctedMacros,
      components,
      photoUri: existingPhotoUris[0] ?? '',
      photoUris: existingPhotoUris,
    };
    await AsyncStorage.setItem(`${MACRO_OVERRIDE_PREFIX}${correctEntry.id}`, JSON.stringify(override));
    updateEnrichedForCurrentDate((prev) =>
      prev.map((e) =>
        e.id === correctEntry.id
          ? { ...e, calories: correctedMacros.calories, proteinG: correctedMacros.proteinG, carbsG: correctedMacros.carbsG, fatG: correctedMacros.fatG, imageUri: existingPhotoUris[0] ?? e.imageUri, photoUris: existingPhotoUris }
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
  const [quickAddDescription, setQuickAddDescription] = useState('');
  const [quickAddPhotos, setQuickAddPhotos] = useState<{ uri: string; base64: string }[]>([]);
  const [quickAddScanning, setQuickAddScanning] = useState(false);
  const [quickAddLabelMode, setQuickAddLabelMode] = useState(false);
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
  const [labelCameraOpen, setLabelCameraOpen] = useState(false);
  const [labelCameraReady, setLabelCameraReady] = useState(false);
  const [labelCapturing, setLabelCapturing] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const labelCameraRef = useRef<CameraView>(null);

  const openQuickAdd = (slot: MealSlot) => {
    setQuickAddSlot(slot);
    setQuickAddName('');
    setQuickAddDescription('');
    setQuickAddPhotos([]);
    setQuickAddScanning(false);
    setQuickAddLabelMode(false);
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

  const openManualQuickAdd = (slot: MealSlot = 'lunch_dinner') => {
    openQuickAdd(slot);
    setQuickAddManualMode(true);
  };

  const openBrowseRecipeHelp = () => {
    setBrowseHelpVisible(true);
  };

  const closeQuickAdd = () => {
    Keyboard.dismiss();
    setQuickAddOpen(false);
    setLabelCameraOpen(false);
    setLabelCameraReady(false);
  };

  const applyQuickAddAnalysis = (analysis: FoodPhotoAnalysis) => {
    if (analysis.name?.trim()) setQuickAddName(analysis.name.trim());
    if (analysis.description?.trim()) setQuickAddDescription(analysis.description.trim());
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
  };

  const addQuickAddPhotoFromUri = async (uri: string, providedBase64?: string) => {
    const compressed = providedBase64
      ? { base64: providedBase64 }
      : await manipulateAsync(
          uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.5, format: SaveFormat.JPEG, base64: true },
        );
    let b64 = compressed.base64 ?? '';
    if (b64.includes(',')) b64 = b64.split(',')[1];

    setQuickAddEstimated(false);
    setQuickAddPhotos((prev) => [...prev, { uri: `${uri}?t=${Date.now()}`, base64: b64 }]);

    if (b64 && b64.length > 100) {
      setQuickAddScanning(true);
      try {
        const analysis = await analyzeFoodPhotosDirect([{ base64: b64 }], quickAddName || 'meal', { portionType: quickAddPortionType });
        applyQuickAddAnalysis(analysis);
      } catch (err: any) {
        console.warn('[SpiceStrong] Quick add scan failed:', err);
      } finally {
        setQuickAddScanning(false);
      }
    }
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
    setQuickAddPhotos((prev) => [...prev, { uri: `${asset.uri}?t=${Date.now()}`, base64: b64 }]);

    // Auto-scan immediately after first photo
    if (b64 && b64.length > 100) {
      setQuickAddScanning(true);
      try {
        const analysis = await analyzeFoodPhotosDirect([{ base64: b64 }], quickAddName || 'meal', { portionType: quickAddPortionType });
        applyQuickAddAnalysis(analysis);
      } catch (err: any) {
        console.warn('[SpiceStrong] Quick add scan failed:', err);
        // Silent — user can enter manually
      } finally {
        setQuickAddScanning(false);
      }
    }
  };

  const scanQuickAddNutritionLabel = async () => {
    setQuickAddPortionType(null);
    const perm = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera access required.');
      return;
    }
    setLabelCameraReady(false);
    setLabelCameraOpen(true);
  };

  const captureNutritionLabelPhoto = async () => {
    if (!labelCameraReady || !labelCameraRef.current || labelCapturing) return;
    setLabelCapturing(true);
    try {
      const photo = await labelCameraRef.current.takePictureAsync({
        quality: 0.75,
        base64: true,
        skipProcessing: false,
      });
      if (photo?.uri) {
        setLabelCameraOpen(false);
        setQuickAddLabelMode(false);
        await addQuickAddPhotoFromUri(photo.uri, photo.base64);
      }
    } catch {
      Alert.alert('Capture failed', 'Could not capture the nutrition label. Try again.');
    } finally {
      setLabelCapturing(false);
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
      applyQuickAddAnalysis(analysis);
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
      applyQuickAddAnalysis(analysis);
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
    const components = (newItem ? [...quickAddEditableComponents, newItem] : [...quickAddEditableComponents]).filter((c) => c.trim());
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
    const components = (newItem ? [...correctionEditableComponents, newItem] : [...correctionEditableComponents]).filter((c) => c.trim());
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
    const description = quickAddDescription.trim();
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

    // Save macros + photo as override using the entry ID returned by the service
    const photoUris = await persistMealPhotoUris(quickAddPhotos, `quick_${Date.now()}`);
    const override: MacroOverride = { ...macros, description, components: quickAddComponents, photoUri: photoUris[0] ?? '', photoUris };
    if (result.entryId) {
      await AsyncStorage.setItem(`${MACRO_OVERRIDE_PREFIX}${result.entryId}`, JSON.stringify(override));
    }

    closeQuickAdd();
    loadEntries(currentDate);
  };

  const loadEntries = useCallback(async (date: string) => {
    const loadId = ++activeLoadRef.current;
    setLoading(true);
    try {
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

      if (loadId !== activeLoadRef.current) return;
      setEnriched(enrichedEntries);
      void writeTrackerCache(date, enrichedEntries);
    } catch (err) {
      if (loadId === activeLoadRef.current) {
        console.warn('[SpiceStrong] Could not load meal plan entries:', err);
      }
    } finally {
      if (loadId === activeLoadRef.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    activeLoadRef.current += 1;

    readTrackerCache(currentDate).then((cachedEntries) => {
      if (cancelled) return;
      setEnriched(cachedEntries ?? []);
      loadEntries(currentDate);
    });

    getFitnessProfile().then((profile) => {
      if (cancelled) return;
      if (profile) setMacroTargets(calculateMacroTargets(profile));
      else setMacroTargets(null);
    }).catch(() => {});
    AsyncStorage.getItem(TRACKING_START_KEY).then((v) => {
      if (!cancelled) setTrackingStartDate(v);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentDate, loadEntries]));

  useEffect(() => { logScreenView('MealPlanScreen'); }, []);

  useEffect(() => {
    let cancelled = false;

    const loadOverallAdherence = async () => {
      if (!macroTargets || !trackingStartDate) {
        setOverallAdherencePct(null);
        setOverallLoggedDays(0);
        setOverallAdherenceLoading(false);
        return;
      }

      const trackingDates = getTrackingDates(trackingStartDate, currentDate);
      if (trackingDates.length === 0) {
        setOverallAdherencePct(null);
        setOverallLoggedDays(0);
        setOverallAdherenceLoading(false);
        return;
      }

      setOverallAdherenceLoading(true);
      try {
        let scoreSum = 0;
        let loggedDays = 0;

        for (const date of trackingDates) {
          const entries = await getMealPlanForDate(date);
          const entryMacros = await Promise.all(entries.map(getMealEntryMacros));
          const totalsForDate = entryMacros.reduce(
            (acc, macros) => ({
              calories: acc.calories + macros.calories,
              proteinG: acc.proteinG + macros.proteinG,
              carbsG: acc.carbsG + macros.carbsG,
              fatG: acc.fatG + macros.fatG,
            }),
            { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
          );

          if (hasLoggedMacros(totalsForDate)) {
            loggedDays += 1;
            scoreSum += scoreMacroTotals(totalsForDate, macroTargets);
          }
        }

        if (!cancelled) {
          setOverallLoggedDays(loggedDays);
          setOverallAdherencePct(loggedDays > 0 ? Math.round((scoreSum / trackingDates.length) * 100) : null);
        }
      } catch {
        if (!cancelled) {
          setOverallLoggedDays(0);
          setOverallAdherencePct(null);
        }
      } finally {
        if (!cancelled) setOverallAdherenceLoading(false);
      }
    };

    loadOverallAdherence();

    return () => {
      cancelled = true;
    };
  }, [currentDate, macroTargets, trackingStartDate]);

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

      // Determine protein from entry name/description or default
      const proteinId = entry.recipe?.proteinId || 'chicken';
      const proteinName = entry.recipe?.proteinName || 'Chicken';
      const proteinEmoji = entry.proteinEmoji || '🍗';
      const mealSlot = entry.slot;
      const cuisineStyle = entry.recipe?.cuisineType || entry.recipe?.cuisine || '';
      const cookTimeBucket = entry.recipe?.cookTimeBucket || '';

      const { SPICEBUILDER_SYSTEM_PROMPT } = require('../../src/prompts/spiceBuilderPrompt');
      const mealTypeLabel = mealSlot === 'breakfast' ? 'Breakfast' : mealSlot === 'snack_dessert' ? 'Snack/Dessert' : mealSlot === 'others' ? 'Meal' : 'Lunch/Dinner';
      const systemPrompt = SPICEBUILDER_SYSTEM_PROMPT;
      const cuisineInstruction = cuisineStyle
        ? `- Cuisine style: "${cuisineStyle}". This is mandatory. Do not switch to another cuisine.`
        : '';
      const cookTimeInstruction = cookTimeBucket
        ? `- Cook time preference: "${cookTimeBucket}". Keep the recipe within this time range when possible.`
        : '';

      const data = await invokeAnthropicMessages({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Generate a high-protein ${mealTypeLabel} recipe.
- proteinId: "${proteinId}"
- proteinName: "${proteinName}"
- proteinEmoji: "${proteinEmoji}"
- mealType: "${mealTypeLabel}"
- Target: ~${entry.calories} cal, ~${entry.proteinG}g protein per serving
- The recipe name, ingredients, seasoning, and cooking technique must match the requested meal type and cuisine.
${cuisineInstruction}
${cookTimeInstruction}
- Return ONLY the JSON object with: name, proteinId, proteinName, proteinEmoji, description, ingredients (with "2-3 servings" tier), steps (array with title, description, emoji, timerMinutes, tip), chefTip, mealType, aiNutrition (calories, proteinG, carbsG, fatG, fiberG, sugarG, sodiumMg)` }],
      });
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
        mealType: mealSlot === 'breakfast' ? 'breakfast' : mealSlot === 'snack_dessert' ? 'snack_dessert' : mealSlot === 'others' ? 'others' : 'lunch_dinner',
        status: 'ready',
        source: 'ai',
        cuisine: cuisineStyle || recipeData.cuisine || undefined,
        cuisineType: cuisineStyle || recipeData.cuisineType || undefined,
        cookTimeBucket: cookTimeBucket || recipeData.cookTimeBucket || undefined,
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

  const daysTracked = getInclusiveDayCount(trackingStartDate, currentDate);

  const displayedAdherencePct = trackingStartDate ? overallAdherencePct : null;

  const grouped: Record<MealSlot, EnrichedEntry[]> = {
    breakfast: [],
    lunch_dinner: [],
    snack_dessert: [],
    others: [],
  };
  enriched.forEach((e) => { if (grouped[e.slot]) grouped[e.slot].push(e); });

  const isToday = currentDate === today;
  const cycleCronometerMode = () =>
    setCronometerMode((m) => m === 'consumed' ? 'target' : m === 'target' ? 'diff' : 'consumed');

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: CAL_TRACKER_BACKGROUND }]}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Cal Tracker</Text>
        </View>
        <HomeButton />
      </View>

      {/* Day navigator */}
      <View style={styles.dayNav}>
        <TouchableOpacity style={styles.dayArrowBtn} onPress={goToPrev} hitSlop={{ top: 12, bottom: 12, left: 20, right: 20 }}>
          <Ionicons name="chevron-back" size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.dayCenter} onPress={openCalendar} activeOpacity={0.7}>
          <View style={styles.dayLabelRow}>
            <Text style={styles.dayLabel}>{formatDisplayDate(currentDate)}</Text>
            <Ionicons name="calendar-outline" size={15} color={ORANGE} />
          </View>
          <Text style={styles.daySubLabel}>{isToday ? 'Live targets and logged meals' : 'Review or plan this day'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dayArrowBtn} onPress={goToNext} hitSlop={{ top: 12, bottom: 12, left: 20, right: 20 }}>
          <Ionicons name="chevron-forward" size={21} color="#FFFFFF" />
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

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickActionPrimary}
              onPress={() => router.push({ pathname: '/screens/ScanFoodScreen', params: { date: currentDate } })}
              activeOpacity={0.84}
            >
              <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
              <Text style={styles.quickActionPrimaryText}>Scan Meal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickActionSecondary} onPress={openBrowseRecipeHelp} activeOpacity={0.78}>
              <Ionicons name="book-outline" size={18} color="#FFFFFF" />
              <Text style={styles.quickActionSecondaryText}>Recipes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickActionSecondary} onPress={() => openManualQuickAdd('lunch_dinner')} activeOpacity={0.78}>
              <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.quickActionSecondaryText}>Add Food</Text>
            </TouchableOpacity>
          </View>

          {loading && (
            <View style={styles.inlineLoadingCard}>
              <ActivityIndicator size="small" color="#E8A87C" />
              <Text style={styles.inlineLoadingText}>Updating tracker...</Text>
            </View>
          )}

          <View style={styles.ringsPanel}>
            <View style={styles.ringsRow}>
            <MacroRing
              label="Calories"
              color="#F5A524"
              target={macroTargets?.calories ?? 2000}
              consumed={totals.calories}
              displayMode={cronometerMode}
              onPress={cycleCronometerMode}
              unit=""
            />
            <MacroRing
              label="Protein"
              color="#E8671A"
              target={macroTargets?.proteinG ?? 120}
              consumed={totals.proteinG}
              displayMode={cronometerMode}
              onPress={cycleCronometerMode}
            />
            <MacroRing
              label="Carbs"
              color="#3B82F6"
              target={macroTargets?.carbsG ?? 150}
              consumed={totals.carbsG}
              displayMode={cronometerMode}
              onPress={cycleCronometerMode}
            />
            <MacroRing
              label="Fat"
              color="#22C55E"
              target={macroTargets?.fatG ?? 80}
              consumed={totals.fatG}
              displayMode={cronometerMode}
              onPress={cycleCronometerMode}
            />
          </View>
          </View>
          {/* Calorie equation — Target − Consumed = Diff */}

          {/* Diet adherence + days tracking */}
          {!macroTargets ? (
            <TouchableOpacity
              style={styles.fitnessNudge}
              onPress={() => router.push('/screens/FitnessProfileScreen')}
              activeOpacity={0.82}
            >
              <Ionicons name="fitness-outline" size={20} color={ORANGE} />
              <Text style={styles.fitnessNudgeText}>Set your fitness goals to track diet adherence</Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(248,241,232,0.44)" />
            </TouchableOpacity>
          ) : (
            <View style={styles.adherencePanel}>
              <View style={styles.adherenceTopRow}>
                <View>
                  <Text style={styles.adherenceLabel}>Overall Adherence</Text>
                  <Text style={styles.adherencePct}>
                    {overallAdherenceLoading ? '...' : displayedAdherencePct !== null ? `${displayedAdherencePct}%` : '—'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.daysBtn}
                  onPress={() => { setPickerDate(trackingStartDate ?? today); setShowStartDatePicker(true); }}
                  activeOpacity={0.82}
                >
                  <Ionicons name="calendar-outline" size={14} color={ORANGE} />
                  <Text style={styles.daysBtnText}>Day {daysTracked}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.adherenceTrack}>
                <View style={[
                  styles.adherenceFill,
                  {
                    width: `${Math.min(100, displayedAdherencePct ?? 0)}%`,
                    backgroundColor:
                      displayedAdherencePct === null ? 'rgba(248,241,232,0.15)' :
                      displayedAdherencePct >= 80 ? '#22C55E' :
                      displayedAdherencePct >= 60 ? '#F5A524' : '#EF4444',
                  },
                ]} />
              </View>
              {displayedAdherencePct === null && !overallAdherenceLoading && (
                <Text style={styles.adherenceHint}>
                  {trackingStartDate
                    ? 'Log meals from your start date to see overall adherence'
                    : 'Set a start date to track overall adherence'}
                </Text>
              )}
              {displayedAdherencePct !== null && trackingStartDate && (
                <Text style={styles.adherenceHint}>{overallLoggedDays}/{daysTracked} days logged since start</Text>
              )}
            </View>
          )}

          {false && (() => {
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
            const slotMeta = SLOT_META[slot];
            return (
              <View key={slot} style={styles.slotSection}>
                <View style={styles.slotHeader}>
                  <View style={styles.slotTitleWrap}>
                    <View style={[styles.slotIconBadge, { backgroundColor: `${slotMeta.accent}22`, borderColor: `${slotMeta.accent}66` }]}>
                      <Ionicons name={slotMeta.icon} size={17} color={slotMeta.accent} />
                    </View>
                    <View>
                      <Text style={styles.slotTitle}>{SLOT_LABELS[slot]}</Text>
                      <Text style={styles.slotHint}>{slotMeta.hint}</Text>
                    </View>
                  </View>
                  {slot !== 'others' && (
                    <View style={styles.slotCountPill}>
                      <Text style={styles.slotCount}>{slotEntries.length}/{limit}</Text>
                    </View>
                  )}
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
                              <Ionicons name="close" size={15} color="#FFFFFF" />
                            </TouchableOpacity>
                          </View>

                          {/* Bottom: title + correct macros */}
                          <View style={styles.cardBottomRow}>
                            <Text style={styles.cardOverlayTitle} numberOfLines={2}>{entry.recipeName}</Text>
                            <View style={styles.cardBottomActions}>
                              <TouchableOpacity
                                style={styles.updateBtnOverlay}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  router.push({
                                    pathname: '/screens/EditMealNutritionScreen',
                                    params: { date: currentDate, entryId: entry.id },
                                  });
                                }}
                                activeOpacity={0.75}
                              >
                                <Ionicons name="create-outline" size={14} color="#FFFFFF" />
                                <Text style={styles.updateBtnOverlayText}>Update</Text>
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

              </View>
            );
          })}
        </ScrollView>

      <Modal visible={labelCameraOpen} animationType="slide" onRequestClose={() => setLabelCameraOpen(false)}>
        <View style={styles.labelCameraWrap}>
          <CameraView
            ref={labelCameraRef}
            style={styles.labelCamera}
            facing="back"
            onCameraReady={() => setLabelCameraReady(true)}
          />
          <View pointerEvents="box-none" style={styles.labelCameraOverlay}>
            <View style={styles.labelCameraTopRow}>
              <TouchableOpacity style={styles.labelCameraTopBtn} onPress={() => setLabelCameraOpen(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={25} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.labelCameraHelpBadge}>
                <Ionicons name="receipt-outline" size={17} color="#E8A87C" />
                <Text style={styles.labelCameraHelpText}>Nutrition Label</Text>
              </View>
            </View>

            <View style={styles.labelCameraFrameWrap}>
              <View style={styles.labelCameraFrame}>
                <View style={[styles.labelCameraCorner, styles.labelCameraCornerTopLeft]} />
                <View style={[styles.labelCameraCorner, styles.labelCameraCornerTopRight]} />
                <View style={[styles.labelCameraCorner, styles.labelCameraCornerBottomLeft]} />
                <View style={[styles.labelCameraCorner, styles.labelCameraCornerBottomRight]} />
                <Text style={styles.labelCameraFrameText}>Cover nutrition details</Text>
                <Text style={styles.labelCameraFrameSubtext}>Fit the full Nutrition Facts panel inside this box</Text>
              </View>
            </View>

            <View style={styles.labelCameraBottomBar}>
              <TouchableOpacity
                style={[styles.labelCameraCapture, (!labelCameraReady || labelCapturing) && styles.labelCameraCaptureDisabled]}
                onPress={captureNutritionLabelPhoto}
                disabled={!labelCameraReady || labelCapturing}
                activeOpacity={0.85}
              >
                {labelCapturing ? (
                  <ActivityIndicator color="#0F0D0B" size="small" />
                ) : (
                  <View style={styles.labelCameraCaptureInner} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.qaSlotPicker}
            >
              {SLOT_ORDER.map((slot) => {
                const slotMeta = SLOT_META[slot];
                const active = quickAddSlot === slot;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[styles.qaSlotOption, active && styles.qaSlotOptionActive]}
                    onPress={() => setQuickAddSlot(slot)}
                    activeOpacity={0.82}
                  >
                    <Ionicons name={slotMeta.icon} size={16} color={active ? '#FFFFFF' : slotMeta.accent} />
                    <Text style={[styles.qaSlotOptionText, active && styles.qaSlotOptionTextActive]}>
                      {SLOT_LABELS[slot].replace(/^[^\s]+\s/, '')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Meal name */}
            <TextInput
              style={styles.qaNameInput}
              value={quickAddName}
              onChangeText={setQuickAddName}
              placeholder="Food title (e.g., Chicken rice bowl)"
              placeholderTextColor="rgba(255,255,255,0.30)"
              returnKeyType="done"
            />
            <TextInput
              style={[styles.qaNameInput, styles.qaDescriptionInput]}
              value={quickAddDescription}
              onChangeText={setQuickAddDescription}
              placeholder="Description (optional)"
              placeholderTextColor="rgba(255,255,255,0.30)"
              multiline
              textAlignVertical="top"
              returnKeyType="done"
            />

            {!quickAddManualMode && !quickAddEstimated && !quickAddScanning && (
              <>
            <Text style={styles.qaScaleTip}>Scan a plate, import a meal photo, or capture a nutrition label.</Text>
            <View style={styles.scanActionGrid}>
              <TouchableOpacity style={[styles.scanActionCard, styles.scanActionPrimaryCard]} onPress={() => { setQuickAddLabelMode(false); pickQuickAddPhoto(true); }} activeOpacity={0.84}>
                <View style={styles.scanActionIconPrimary}>
                  <Ionicons name="scan-outline" size={24} color="#FFFFFF" />
                </View>
                <Text style={styles.scanActionTitlePrimary}>Scan Food</Text>
                <Text style={styles.scanActionTextPrimary}>Use camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.scanActionCard} onPress={() => { setQuickAddLabelMode(false); pickQuickAddPhoto(false); }} activeOpacity={0.82}>
                <View style={styles.scanActionIcon}>
                  <Ionicons name="images-outline" size={23} color="#E8A87C" />
                </View>
                <Text style={styles.scanActionTitle}>Gallery</Text>
                <Text style={styles.scanActionText}>Pick photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.scanActionCard, quickAddLabelMode && styles.scanActionCardActive]} onPress={() => setQuickAddLabelMode(true)} activeOpacity={0.82}>
                <View style={styles.scanActionIcon}>
                  <Ionicons name="receipt-outline" size={23} color="#E8A87C" />
                </View>
                <Text style={styles.scanActionTitle}>Food Label</Text>
                <Text style={styles.scanActionText}>Read macros</Text>
              </TouchableOpacity>
            </View>

            {quickAddLabelMode && (
              <View style={styles.labelScanGuide}>
                <View style={styles.labelScanFrame}>
                  <View style={[styles.labelCorner, styles.labelCornerTopLeft]} />
                  <View style={[styles.labelCorner, styles.labelCornerTopRight]} />
                  <View style={[styles.labelCorner, styles.labelCornerBottomLeft]} />
                  <View style={[styles.labelCorner, styles.labelCornerBottomRight]} />
                  <Ionicons name="receipt-outline" size={28} color="#E8A87C" />
                  <Text style={styles.labelScanTitle}>Cover the nutrition label</Text>
                  <Text style={styles.labelScanText}>Fit the full Nutrition Facts panel inside this rectangle.</Text>
                </View>
                <TouchableOpacity style={styles.labelScanButton} onPress={scanQuickAddNutritionLabel} activeOpacity={0.84}>
                  <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.labelScanButtonText}>Open Camera</Text>
                </TouchableOpacity>
              </View>
            )}

            {quickAddPhotos.length > 0 && (
              <View style={styles.quickPhotoStrip}>
                {quickAddPhotos.slice(0, 4).map((photo, idx) => (
                  <View key={`${photo.uri}-${idx}`} style={styles.quickPhotoThumb}>
                    <Image source={{ uri: photo.uri }} style={styles.quickPhotoThumbImg} contentFit="cover" cachePolicy="none" />
                    <TouchableOpacity style={styles.quickPhotoRemove} onPress={() => removeQuickAddPhoto(idx)}>
                      <Ionicons name="close" size={12} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {quickAddPhotos.length > 0 && (
              <TouchableOpacity style={styles.cmAnalyzeBtn} onPress={analyzeQuickAddPhotos} activeOpacity={0.8}>
                <Text style={styles.cmAnalyzeBtnText}>{quickAddScanning ? 'Analyzing...' : `Analyze Meal (${quickAddPhotos.length} photo${quickAddPhotos.length > 1 ? 's' : ''})`}</Text>
              </TouchableOpacity>
            )}
              </>
            )}

            {quickAddScanning && (
              <View style={styles.cmAnalyzing}>
                <ProcessingRing
                  label={`Analyzing ${quickAddPhotos.length} photo${quickAddPhotos.length > 1 ? 's' : ''}...`}
                  expectedMs={8000}
                  size={80}
                />
              </View>
            )}

            {(quickAddManualMode || quickAddEstimated) && !quickAddScanning && (
              <>

            {quickAddEstimated && (
              <View style={styles.nutritionResultCard}>
                <View style={styles.nutritionResultTop}>
                  <View style={styles.nutritionBookmark}>
                    <Ionicons name="bookmark-outline" size={20} color="#E8A87C" />
                  </View>
                  <View style={styles.nutritionServingPill}>
                    <Text style={styles.nutritionServingText}>1</Text>
                    <Ionicons name="pencil" size={14} color="#F8F1E8" />
                  </View>
                </View>
                <Text style={styles.nutritionResultTime}>{new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                <Text style={styles.nutritionResultTitle} numberOfLines={2}>
                  {quickAddName.trim() || 'Detected Food'}
                </Text>

                <View style={styles.nutritionCaloriesCard}>
                  <View style={styles.nutritionCaloriesIcon}>
                    <Ionicons name="flame" size={26} color="#F8F1E8" />
                  </View>
                  <View>
                    <Text style={styles.nutritionMetricLabel}>Calories</Text>
                    <Text style={styles.nutritionCaloriesValue}>{quickAddMacros.calories || '0'}</Text>
                  </View>
                </View>

                <View style={styles.nutritionMacroRow}>
                  <View style={styles.nutritionMacroTile}>
                    <Ionicons name="barbell-outline" size={18} color="#E85D5D" />
                    <Text style={styles.nutritionMacroLabel}>Protein</Text>
                    <Text style={styles.nutritionMacroValue}>{quickAddMacros.proteinG || '0'}g</Text>
                  </View>
                  <View style={styles.nutritionMacroTile}>
                    <Ionicons name="leaf-outline" size={18} color="#E8A87C" />
                    <Text style={styles.nutritionMacroLabel}>Carbs</Text>
                    <Text style={styles.nutritionMacroValue}>{quickAddMacros.carbsG || '0'}g</Text>
                  </View>
                  <View style={styles.nutritionMacroTile}>
                    <Ionicons name="water-outline" size={18} color="#6EA8FE" />
                    <Text style={styles.nutritionMacroLabel}>Fats</Text>
                    <Text style={styles.nutritionMacroValue}>{quickAddMacros.fatG || '0'}g</Text>
                  </View>
                </View>

                {quickAddComponents.length > 0 && (
                  <View style={styles.nutritionIngredientsBlock}>
                    <View style={styles.nutritionIngredientsHeader}>
                      <Text style={styles.nutritionIngredientsTitle}>Ingredients</Text>
                      <TouchableOpacity onPress={enterQuickAddEditMode} activeOpacity={0.75}>
                        <Text style={styles.nutritionAddMore}>+ Add More</Text>
                      </TouchableOpacity>
                    </View>
                    {!quickAddComponentEditMode ? (
                      quickAddComponents.slice(0, 5).map((component, index) => (
                        (() => {
                          const ingredient = parseIngredientComponent(component);
                          return (
                            <TouchableOpacity
                              key={`${component}-${index}`}
                              style={styles.nutritionIngredientRow}
                              onPress={enterQuickAddEditMode}
                              activeOpacity={0.78}
                            >
                              <Text style={styles.nutritionIngredientName} numberOfLines={1}>{ingredient.name}</Text>
                              <View style={styles.nutritionIngredientDetails}>
                                {!!ingredient.calories && <Text style={styles.nutritionIngredientCalories}>{ingredient.calories}</Text>}
                                {!!ingredient.quantity && <Text style={styles.nutritionIngredientQty}>{ingredient.quantity}</Text>}
                              </View>
                            </TouchableOpacity>
                          );
                        })()
                      ))
                    ) : (
                      <>
                        {quickAddEditableComponents.map((component, index) => (
                          <View key={`edit-${index}`} style={styles.nutritionIngredientEditRow}>
                            <TextInput
                              style={styles.nutritionIngredientInput}
                              value={component}
                              onChangeText={(value) => {
                                const updated = [...quickAddEditableComponents];
                                updated[index] = value;
                                setQuickAddEditableComponents(updated);
                              }}
                              multiline
                              returnKeyType="done"
                              blurOnSubmit
                            />
                            <TouchableOpacity
                              style={styles.nutritionIngredientRemove}
                              onPress={() => setQuickAddEditableComponents((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                              activeOpacity={0.75}
                            >
                              <Ionicons name="close" size={14} color="#FFFFFF" />
                            </TouchableOpacity>
                          </View>
                        ))}
                        <View style={styles.nutritionIngredientEditRow}>
                          <TextInput
                            style={[styles.nutritionIngredientInput, { opacity: 0.7 }]}
                            value={quickAddNewIngredient}
                            onChangeText={setQuickAddNewIngredient}
                            placeholder="Add ingredient or detail"
                            placeholderTextColor="rgba(248,241,232,0.34)"
                            returnKeyType="done"
                            blurOnSubmit
                          />
                        </View>
                        <View style={styles.nutritionEditActions}>
                          <TouchableOpacity
                            style={styles.nutritionRecalculateBtn}
                            onPress={recalculateQuickAddMacros}
                            disabled={quickAddRecalculating}
                            activeOpacity={0.82}
                          >
                            {quickAddRecalculating ? (
                              <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                              <Text style={styles.nutritionRecalculateText}>Recalculate</Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.nutritionCancelEditBtn}
                            onPress={() => setQuickAddComponentEditMode(false)}
                            activeOpacity={0.75}
                          >
                            <Text style={styles.nutritionCancelEditText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Cal AI breakdown card */}
            {false && quickAddEstimated && quickAddComponents.length > 0 && quickAddComponentEditMode && quickAddCalRange && (
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
                      <Text style={styles.qaCalRange}>Est. range: {quickAddCalRange?.min ?? 0}–{quickAddCalRange?.max ?? 0} kcal</Text>
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
                <ProcessingRing label="Revising estimate..." expectedMs={6000} size={72} />
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

            <View style={styles.updateEditCard}>
              <View style={styles.updateCaloriesCard}>
                <View style={styles.nutritionCaloriesIcon}>
                  <Ionicons name="flame" size={24} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nutritionMetricLabel}>Calories</Text>
                  <TextInput
                    style={styles.updateCaloriesInput}
                    value={String(correctedMacros?.calories ?? 0)}
                    onChangeText={(value) => updateCorrectionMacroNumber('calories', value)}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    returnKeyType="done"
                  />
                </View>
              </View>

              <View style={styles.updateMacroGrid}>
                {[
                  { key: 'proteinG' as const, label: 'Protein', color: '#EF6A6A', icon: 'barbell-outline' as const },
                  { key: 'carbsG' as const, label: 'Carbs', color: '#E8A87C', icon: 'leaf-outline' as const },
                  { key: 'fatG' as const, label: 'Fats', color: '#60A5FA', icon: 'water-outline' as const },
                ].map((macro) => (
                  <View key={macro.key} style={styles.updateMacroField}>
                    <Ionicons name={macro.icon} size={18} color={macro.color} />
                    <Text style={styles.updateMacroLabel}>{macro.label}</Text>
                    <View style={styles.updateMacroInputRow}>
                      <TextInput
                        style={styles.updateMacroInput}
                        value={String(correctedMacros?.[macro.key] ?? 0)}
                        onChangeText={(value) => updateCorrectionMacroNumber(macro.key, value)}
                        keyboardType="number-pad"
                        selectTextOnFocus
                        returnKeyType="done"
                      />
                      <Text style={styles.updateMacroUnit}>g</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.updateIngredientsHeader}>
              <Text style={styles.nutritionIngredientsTitle}>Ingredients</Text>
              <TouchableOpacity style={styles.updateAddIngredientBtn} onPress={addCorrectionIngredient} activeOpacity={0.82}>
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.updateAddIngredientText}>Add</Text>
              </TouchableOpacity>
            </View>

            {correctionEditableComponents.map((component, index) => {
              const item = parseIngredientComponent(component);
              return (
                <View key={`${component}_${index}`} style={styles.updateIngredientRow}>
                  <TextInput
                    style={[styles.updateIngredientInput, styles.updateIngredientNameInput]}
                    value={item.name}
                    onChangeText={(value) => updateCorrectionIngredientPart(index, 'name', value)}
                    placeholder="Ingredient"
                    placeholderTextColor="rgba(248,241,232,0.34)"
                    returnKeyType="done"
                  />
                  <TextInput
                    style={[styles.updateIngredientInput, styles.updateIngredientCalInput]}
                    value={item.calories.replace(/[^\d]/g, '')}
                    onChangeText={(value) => updateCorrectionIngredientPart(index, 'calories', value)}
                    keyboardType="number-pad"
                    placeholder="cal"
                    placeholderTextColor="rgba(248,241,232,0.34)"
                    returnKeyType="done"
                  />
                  <TextInput
                    style={[styles.updateIngredientInput, styles.updateIngredientQtyInput]}
                    value={item.quantity}
                    onChangeText={(value) => updateCorrectionIngredientPart(index, 'quantity', value)}
                    placeholder="qty"
                    placeholderTextColor="rgba(248,241,232,0.34)"
                    returnKeyType="done"
                  />
                  <TouchableOpacity style={styles.updateRemoveIngredientBtn} onPress={() => removeCorrectionIngredient(index)} activeOpacity={0.82}>
                    <Ionicons name="close" size={15} color="rgba(248,241,232,0.72)" />
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity style={[styles.cmApplyBtn, { marginTop: 12 }]} onPress={applyCorrection} activeOpacity={0.8}>
              <Text style={styles.cmApplyBtnText}>Apply Changes</Text>
            </TouchableOpacity>

            {false && (<>
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
                              <Text style={styles.qaCalRange}>Est. range: {correctionCalRange?.min ?? 0}–{correctionCalRange?.max ?? 0} kcal</Text>
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
                      <Text style={[styles.cmMacroVal, styles.cmMacroNew]}>{correctedMacros?.calories ?? 0} kcal</Text>
                      <Text style={styles.cmMacroDot}>·</Text>
                      <Text style={[styles.cmMacroVal, { color: ORANGE }]}>{correctedMacros?.proteinG ?? 0}g P</Text>
                      <Text style={styles.cmMacroDot}>·</Text>
                      <Text style={[styles.cmMacroVal, styles.cmMacroNew]}>{correctedMacros?.carbsG ?? 0}g C</Text>
                      <Text style={styles.cmMacroDot}>·</Text>
                      <Text style={[styles.cmMacroVal, styles.cmMacroNew]}>{correctedMacros?.fatG ?? 0}g F</Text>
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
                        <ProcessingRing label="Revising estimate..." expectedMs={6000} size={72} />
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
                <ProcessingRing
                  label={`Analyzing ${correctionPhotos.length} photo${correctionPhotos.length > 1 ? 's' : ''}...`}
                  expectedMs={8000}
                  size={80}
                />
              </View>
            )}
            </>)}
          </Pressable>
          </ScrollView>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Tracking start date picker */}
      <Modal visible={showStartDatePicker} transparent animationType="slide" onRequestClose={() => setShowStartDatePicker(false)}>
        <View style={styles.datePickerOverlay}>
          <View style={styles.datePickerSheet}>
            <Text style={styles.datePickerTitle}>Tracking Start Date</Text>
            <Text style={styles.datePickerSub}>When did you start following your diet plan?</Text>

            <View style={styles.datePickerNav}>
              <TouchableOpacity
                style={styles.datePickerArrow}
                onPress={() => {
                  const d = new Date(pickerDate);
                  d.setDate(d.getDate() - 1);
                  setPickerDate(d.toISOString().slice(0, 10));
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.datePickerDate}>
                {new Date(pickerDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </Text>
              <TouchableOpacity
                style={styles.datePickerArrow}
                onPress={() => {
                  const d = new Date(pickerDate);
                  d.setDate(d.getDate() + 1);
                  const next = d.toISOString().slice(0, 10);
                  if (next <= today) setPickerDate(next);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.datePickerSetBtn}
              onPress={async () => {
                await AsyncStorage.setItem(TRACKING_START_KEY, pickerDate);
                setTrackingStartDate(pickerDate);
                setShowStartDatePicker(false);
              }}
              activeOpacity={0.86}
            >
              <Text style={styles.datePickerSetBtnText}>Set Start Date</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.datePickerCancel} onPress={() => setShowStartDatePicker(false)} activeOpacity={0.7}>
              <Text style={styles.datePickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(248,241,232,0.08)',
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  back: { fontSize: 28, lineHeight: 30, color: '#FFFFFF', fontWeight: '900' },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
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
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(248,241,232,0.08)',
  },
  navArrow: { fontSize: 34, color: ORANGE, fontWeight: '700', lineHeight: 38 },
  dayArrowBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248,241,232,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
  },
  dayCenter: { alignItems: 'center', gap: 3, flex: 1 },
  dayLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  daySubLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(248,241,232,0.42)' },
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

  scroll: { paddingHorizontal: 18, paddingTop: 16 },

  dailyHero: {
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.16)',
    marginBottom: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 24, shadowOffset: { width: 0, height: 14 } },
      android: { elevation: 12 },
    }),
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  heroKicker: {
    fontSize: 11,
    fontWeight: '900',
    color: 'rgba(248,241,232,0.58)',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  heroHeadline: {
    fontSize: 54,
    lineHeight: 58,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  heroSubhead: { fontSize: 15, fontWeight: '800', color: '#86EFAC' },
  heroSubheadOver: { color: '#FCA5A5' },
  heroScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: 'rgba(13,11,9,0.46)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.13)',
  },
  heroScoreText: { fontSize: 13, fontWeight: '900', color: '#86EFAC' },
  heroScoreTextOver: { color: '#FCA5A5' },
  calorieRail: {
    height: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(248,241,232,0.12)',
    overflow: 'hidden',
    marginBottom: 16,
  },
  calorieRailFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#E8671A',
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(13,11,9,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
    marginBottom: 14,
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  heroStatLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(248,241,232,0.42)', textTransform: 'uppercase', letterSpacing: 0.9, marginTop: 3 },
  heroStatDivider: { width: 1, height: 30, backgroundColor: 'rgba(248,241,232,0.10)' },
  macroBars: { gap: 10 },
  macroBarItem: { gap: 6 },
  macroBarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  macroBarLabel: { fontSize: 12, fontWeight: '800', color: 'rgba(248,241,232,0.70)' },
  macroBarValue: { fontSize: 12, fontWeight: '900', color: '#FFFFFF' },
  macroBarTrack: { height: 6, borderRadius: 999, backgroundColor: 'rgba(248,241,232,0.12)', overflow: 'hidden' },
  macroBarFill: { height: '100%', borderRadius: 999 },

  // Fitness nudge banner (no profile set)
  fitnessNudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(232,168,124,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.22)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 14,
  },
  fitnessNudgeText: {
    flex: 1,
    color: '#F8F1E8',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },

  // Diet adherence panel
  adherencePanel: {
    backgroundColor: 'rgba(248,241,232,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  adherenceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  adherenceLabel: {
    color: 'rgba(248,241,232,0.54)',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  adherencePct: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  daysBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(232,168,124,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.30)',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  daysBtnText: {
    color: '#E8A87C',
    fontSize: 13,
    fontWeight: '900',
  },
  adherenceTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(248,241,232,0.10)',
    overflow: 'hidden',
  },
  adherenceFill: {
    height: '100%',
    borderRadius: 999,
  },
  adherenceHint: {
    color: 'rgba(248,241,232,0.40)',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },

  // Date picker modal
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.60)',
    justifyContent: 'flex-end',
  },
  datePickerSheet: {
    backgroundColor: '#1A1410',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: 'rgba(248,241,232,0.12)',
  },
  datePickerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 6,
    textAlign: 'center',
  },
  datePickerSub: {
    color: 'rgba(248,241,232,0.50)',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  datePickerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  datePickerArrow: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerDate: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    flex: 1,
    textAlign: 'center',
  },
  datePickerSetBtn: {
    backgroundColor: '#8F3A1F',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  datePickerSetBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  datePickerCancel: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  datePickerCancelText: {
    color: 'rgba(248,241,232,0.45)',
    fontSize: 14,
    fontWeight: '700',
  },

  quickActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  inlineLoadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(232,168,124,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.22)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  inlineLoadingText: {
    color: 'rgba(248,241,232,0.70)',
    fontSize: 12,
    fontWeight: '800',
  },
  quickActionPrimary: {
    flex: 1.4,
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: '#B6532B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#B6532B', shadowOpacity: 0.34, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 5 },
    }),
  },
  quickActionPrimaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  quickActionSecondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  quickActionSecondaryText: { color: '#F8F1E8', fontSize: 13, fontWeight: '800' },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
  },

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
    paddingHorizontal: 0,
  },
  ringsPanel: {
    backgroundColor: 'rgba(248,241,232,0.06)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  // Calorie equation card
  calEqCard: {
    backgroundColor: 'rgba(13,11,9,0.46)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 20,
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
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  calEqLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  calEqOp: {
    fontSize: 17,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.25)',
    paddingBottom: 16,
  },

  // Slot sections
  slotSection: { marginBottom: 30 },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  slotTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  slotIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  slotTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  slotHint: { fontSize: 11, fontWeight: '700', color: 'rgba(248,241,232,0.42)', marginTop: 2 },
  slotCountPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
  },
  slotCount: {
    fontSize: 12,
    fontWeight: '900',
    color: 'rgba(248,241,232,0.70)',
  },
  // Recipe hero card
  card: {
    width: CARD_W,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.13)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.34, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
      android: { elevation: 8 },
    }),
  },
  // Compact card — everything on hero image
  cardHero: { height: 194, position: 'relative' },
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
    height: 78,
  },
  cardHeroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 118,
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
    padding: 12,
  },
  cardMacroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1, marginRight: 8 },
  cardMacroPill: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    backgroundColor: 'rgba(13,11,9,0.56)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  cardMacroPillProtein: {
    backgroundColor: 'rgba(143,58,31,0.55)',
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(13,11,9,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
  },
  removeBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  // Bottom row: title + correct macros
  cardBottomRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
  },
  cardOverlayTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardBottomActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  updateBtnOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(143,58,31,0.38)',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.45)',
  },
  updateBtnOverlayText: { fontSize: 13, fontWeight: '900', color: '#FFFFFF' },
  tapToGenerate: { fontSize: 11, fontWeight: '600', color: ORANGE, fontStyle: 'italic' },
  generatingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  generatingText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.70)' },

  // Correct Macros modal
  cmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 96 : 72,
    paddingBottom: 20,
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
  qaSlotPicker: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 14,
    paddingRight: 8,
  },
  qaSlotOption: {
    minWidth: 132,
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.18)',
    backgroundColor: 'rgba(248,241,232,0.075)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
  },
  qaSlotOptionActive: {
    backgroundColor: 'rgba(143,58,31,0.42)',
    borderColor: 'rgba(232,168,124,0.62)',
  },
  qaSlotOptionText: {
    fontSize: 13,
    fontWeight: '900',
    color: 'rgba(248,241,232,0.76)',
  },
  qaSlotOptionTextActive: {
    color: '#FFFFFF',
  },
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
  qaDescriptionInput: {
    minHeight: 76,
    paddingTop: 12,
    lineHeight: 20,
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
  scanActionGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  scanActionCard: {
    flex: 1,
    minHeight: 112,
    borderRadius: 20,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  scanActionPrimaryCard: {
    backgroundColor: '#F8F1E8',
    borderColor: 'rgba(248,241,232,0.70)',
  },
  scanActionCardActive: {
    borderColor: 'rgba(232,168,124,0.58)',
    backgroundColor: 'rgba(143,58,31,0.20)',
  },
  scanActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: 'rgba(143,58,31,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  scanActionIconPrimary: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: '#8F3A1F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  scanActionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  scanActionTitlePrimary: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F0D0B',
    textAlign: 'center',
  },
  scanActionText: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(248,241,232,0.42)',
    marginTop: 4,
    textAlign: 'center',
  },
  scanActionTextPrimary: {
    fontSize: 10,
    fontWeight: '900',
    color: 'rgba(15,13,11,0.52)',
    marginTop: 4,
    textAlign: 'center',
  },
  labelScanGuide: {
    marginBottom: 14,
  },
  labelScanFrame: {
    minHeight: 170,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.28)',
    backgroundColor: 'rgba(13,11,9,0.36)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    overflow: 'hidden',
  },
  labelCorner: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderColor: '#F8F1E8',
  },
  labelCornerTopLeft: {
    top: 16,
    left: 16,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 12,
  },
  labelCornerTopRight: {
    top: 16,
    right: 16,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 12,
  },
  labelCornerBottomLeft: {
    bottom: 16,
    left: 16,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 12,
  },
  labelCornerBottomRight: {
    bottom: 16,
    right: 16,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 12,
  },
  labelScanTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 10,
    textAlign: 'center',
  },
  labelScanText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(248,241,232,0.54)',
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 5,
    maxWidth: 230,
  },
  labelScanButton: {
    minHeight: 46,
    borderRadius: 15,
    backgroundColor: '#8F3A1F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  labelScanButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  labelCameraWrap: {
    flex: 1,
    backgroundColor: '#000000',
  },
  labelCamera: {
    flex: 1,
  },
  labelCameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: Platform.OS === 'ios' ? 62 : 34,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
  },
  labelCameraTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelCameraTopBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,11,9,0.62)',
  },
  labelCameraHelpBadge: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(13,11,9,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
  },
  labelCameraHelpText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  labelCameraFrameWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  labelCameraFrame: {
    width: '100%',
    minHeight: '70%',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.36)',
    backgroundColor: 'rgba(13,11,9,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  labelCameraCorner: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderColor: '#FFFFFF',
  },
  labelCameraCornerTopLeft: {
    top: 18,
    left: 18,
    borderTopWidth: 5,
    borderLeftWidth: 5,
    borderTopLeftRadius: 18,
  },
  labelCameraCornerTopRight: {
    top: 18,
    right: 18,
    borderTopWidth: 5,
    borderRightWidth: 5,
    borderTopRightRadius: 18,
  },
  labelCameraCornerBottomLeft: {
    bottom: 18,
    left: 18,
    borderBottomWidth: 5,
    borderLeftWidth: 5,
    borderBottomLeftRadius: 18,
  },
  labelCameraCornerBottomRight: {
    bottom: 18,
    right: 18,
    borderBottomWidth: 5,
    borderRightWidth: 5,
    borderBottomRightRadius: 18,
  },
  labelCameraFrameText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  labelCameraFrameSubtext: {
    color: 'rgba(248,241,232,0.82)',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 260,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  labelCameraBottomBar: {
    alignItems: 'center',
  },
  labelCameraCapture: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: 'rgba(248,241,232,0.92)',
    borderWidth: 7,
    borderColor: 'rgba(13,11,9,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelCameraCaptureDisabled: {
    opacity: 0.55,
  },
  labelCameraCaptureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
  },
  quickPhotoStrip: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  quickPhotoThumb: {
    width: 56,
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
  },
  quickPhotoThumbImg: {
    width: '100%',
    height: '100%',
  },
  quickPhotoRemove: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(13,11,9,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
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

  // Cal AI-inspired nutrition result, SpiceStrong style
  nutritionResultCard: {
    borderRadius: 24,
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
    padding: 16,
    marginBottom: 12,
  },
  nutritionResultTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  nutritionBookmark: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(143,58,31,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.28)',
  },
  nutritionServingPill: {
    minWidth: 72,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(13,11,9,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.13)',
  },
  nutritionServingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  nutritionResultTime: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(13,11,9,0.28)',
    color: 'rgba(248,241,232,0.58)',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
  nutritionResultTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 29,
    fontWeight: '900',
    marginBottom: 16,
  },
  nutritionCaloriesCard: {
    minHeight: 96,
    borderRadius: 20,
    backgroundColor: 'rgba(13,11,9,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  nutritionCaloriesIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8F3A1F',
  },
  nutritionMetricLabel: {
    color: 'rgba(248,241,232,0.56)',
    fontSize: 13,
    fontWeight: '800',
  },
  nutritionCaloriesValue: {
    color: '#FFFFFF',
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '900',
  },
  nutritionMacroRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  nutritionMacroTile: {
    flex: 1,
    minHeight: 88,
    borderRadius: 18,
    backgroundColor: 'rgba(13,11,9,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.11)',
    padding: 10,
    justifyContent: 'center',
  },
  nutritionMacroLabel: {
    color: 'rgba(248,241,232,0.58)',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
  },
  nutritionMacroValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 3,
  },
  nutritionIngredientsBlock: {
    marginTop: 2,
  },
  nutritionIngredientsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  nutritionIngredientsTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  nutritionAddMore: {
    color: 'rgba(248,241,232,0.56)',
    fontSize: 14,
    fontWeight: '900',
  },
  nutritionIngredientRow: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
    gap: 12,
  },
  nutritionIngredientName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  nutritionIngredientDetails: {
    alignItems: 'flex-end',
    gap: 2,
    maxWidth: 118,
  },
  nutritionIngredientCalories: {
    color: '#E8A87C',
    fontSize: 13,
    fontWeight: '900',
  },
  nutritionIngredientQty: {
    color: 'rgba(248,241,232,0.52)',
    fontSize: 12,
    fontWeight: '800',
  },
  nutritionIngredientEditRow: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 9,
  },
  nutritionIngredientInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
    paddingVertical: 4,
  },
  nutritionIngredientRemove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,11,9,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
  },
  nutritionEditActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  nutritionRecalculateBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: '#8F3A1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nutritionRecalculateText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  nutritionCancelEditBtn: {
    minHeight: 44,
    borderRadius: 15,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nutritionCancelEditText: {
    color: 'rgba(248,241,232,0.62)',
    fontSize: 14,
    fontWeight: '900',
  },
  updateEditCard: {
    borderRadius: 22,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    padding: 12,
    marginBottom: 14,
  },
  updateCaloriesCard: {
    minHeight: 88,
    borderRadius: 18,
    backgroundColor: 'rgba(13,11,9,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  updateCaloriesInput: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    padding: 0,
  },
  updateMacroGrid: {
    flexDirection: 'row',
    gap: 9,
  },
  updateMacroField: {
    flex: 1,
    minHeight: 82,
    borderRadius: 16,
    backgroundColor: 'rgba(13,11,9,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
    padding: 10,
    justifyContent: 'center',
  },
  updateMacroLabel: {
    color: 'rgba(248,241,232,0.58)',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 5,
  },
  updateMacroInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 2,
  },
  updateMacroInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    padding: 0,
  },
  updateMacroUnit: {
    color: 'rgba(248,241,232,0.52)',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 2,
  },
  updateIngredientsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  updateAddIngredientBtn: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(143,58,31,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.48)',
  },
  updateAddIngredientText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  updateIngredientRow: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 9,
  },
  updateIngredientInput: {
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(13,11,9,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  updateIngredientNameInput: { flex: 1.1 },
  updateIngredientCalInput: { width: 58, textAlign: 'right' },
  updateIngredientQtyInput: { flex: 0.72 },
  updateRemoveIngredientBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,11,9,0.46)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
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
