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
import { analyzeNutrition } from '../../services/nutritionService';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
const MACRO_OVERRIDE_PREFIX = 'spicestrong_macro_override_';

interface MacroOverride {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  photoUri: string;
}

function detectMediaType(base64: string): string {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

/**
 * Step 1: Claude Vision identifies the image type and extracts info.
 * - Nutrition label → returns exact macros directly
 * - Food photo → returns estimated ingredient list with quantities
 */
async function identifyFoodImage(base64: string, recipeName: string): Promise<{
  type: 'label' | 'food';
  macros?: { calories: number; proteinG: number; carbsG: number; fatG: number };
  ingredients?: string[];
}> {
  if (!ANTHROPIC_KEY) throw new Error('No API key — set EXPO_PUBLIC_ANTHROPIC_KEY');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You are a food identification AI for a fitness cooking app.

Analyze the image and determine if it is:
1. A NUTRITION FACTS LABEL — read exact per-serving values
2. A FOOD PHOTO — identify each visible food item with estimated quantity

For a NUTRITION LABEL, return:
{"type": "label", "macros": {"calories": number, "proteinG": number, "carbsG": number, "fatG": number}}

For a FOOD PHOTO, return an ingredient list with quantities that Edamam nutrition API can parse.
Example: {"type": "food", "ingredients": ["200g grilled chicken breast", "1 cup steamed rice", "100g steamed broccoli", "1 tbsp olive oil"]}

Be specific with quantities (grams, cups, tbsp) and cooking methods. Estimate portion sizes from the photo.
Return ONLY the JSON, no other text.`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: detectMediaType(base64), data: base64 } },
          { type: 'text', text: `This meal is "${recipeName}". Identify the contents and return the JSON.` },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(`[SpiceStrong] Vision API error ${res.status}:`, errBody);
    throw new Error(`API returned ${res.status}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  console.log('[SpiceStrong] Vision response:', text);

  // Extract complete JSON object by matching balanced braces
  const start = text.indexOf('{');
  if (start === -1) throw new Error('Could not parse vision response');
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error('Incomplete JSON in response');
  return JSON.parse(text.slice(start, end));
}

/**
 * Step 2: Full analysis pipeline.
 * - Nutrition label → Claude reads exact values (done)
 * - Food photo → Claude identifies ingredients → Edamam returns accurate macros
 */
async function analyzeFoodPhoto(base64: string, recipeName: string): Promise<{ calories: number; proteinG: number; carbsG: number; fatG: number }> {
  const result = await identifyFoodImage(base64, recipeName);

  if (result.type === 'label' && result.macros) {
    console.log('[SpiceStrong] Nutrition label detected, using exact values');
    return {
      calories: Math.round(Number(result.macros.calories) || 0),
      proteinG: Math.round(Number(result.macros.proteinG) || 0),
      carbsG: Math.round(Number(result.macros.carbsG) || 0),
      fatG: Math.round(Number(result.macros.fatG) || 0),
    };
  }

  if (result.type === 'food' && result.ingredients?.length) {
    console.log('[SpiceStrong] Food photo detected, ingredients:', result.ingredients);

    // Feed identified ingredients to Edamam for accurate nutrition
    const edamamIngredients = result.ingredients.map((s) => ({ name: s, quantity: '' }));
    const edamamResult = await analyzeNutrition(edamamIngredients, 1);

    if (edamamResult) {
      console.log('[SpiceStrong] Edamam nutrition result:', edamamResult);
      return {
        calories: Math.round(edamamResult.calories),
        proteinG: Math.round(edamamResult.proteinG),
        carbsG: Math.round(edamamResult.carbsG),
        fatG: Math.round(edamamResult.fatG),
      };
    }
    console.warn('[SpiceStrong] Edamam failed, falling back to Claude estimation');
  }

  // Fallback: ask Claude to estimate directly
  console.log('[SpiceStrong] Using Claude estimation fallback');
  if (!ANTHROPIC_KEY) throw new Error('No API key');
  const fallback = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: detectMediaType(base64), data: base64 } },
          { type: 'text', text: `Estimate macros for this "${recipeName}" portion. Return ONLY: {"calories": number, "proteinG": number, "carbsG": number, "fatG": number}` },
        ],
      }],
    }),
  });
  if (!fallback.ok) throw new Error(`Fallback API returned ${fallback.status}`);
  const fbData = await fallback.json();
  const fbText = fbData.content?.[0]?.text || '';
  const fbStart = fbText.indexOf('{');
  if (fbStart === -1) throw new Error('Could not parse nutrition');
  let fbDepth = 0, fbEnd = -1;
  for (let i = fbStart; i < fbText.length; i++) {
    if (fbText[i] === '{') fbDepth++;
    if (fbText[i] === '}') { fbDepth--; if (fbDepth === 0) { fbEnd = i + 1; break; } }
  }
  if (fbEnd === -1) throw new Error('Incomplete nutrition JSON');
  const parsed = JSON.parse(fbText.slice(fbStart, fbEnd));
  return {
    calories: Math.round(Number(parsed.calories) || 0),
    proteinG: Math.round(Number(parsed.proteinG) || 0),
    carbsG: Math.round(Number(parsed.carbsG) || 0),
    fatG: Math.round(Number(parsed.fatG) || 0),
  };
}

const ORANGE = '#E85D26';
const BG = '#0F0F0F';
const SURFACE = '#1A1A1A';
const BORDER = 'rgba(255,255,255,0.10)';
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

interface EnrichedEntry extends MealPlanEntry {
  recipe: SavedRecipe | null;
  imageUri: string | null;
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
    const builtin = getRecipeCardImage(recipe);
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

  // Macro correction modal state
  const [correctEntry, setCorrectEntry] = useState<EnrichedEntry | null>(null);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [correcting, setCorrecting] = useState(false);
  const [correctedMacros, setCorrectedMacros] = useState<{ calories: number; proteinG: number; carbsG: number; fatG: number } | null>(null);
  const [correctionPhoto, setCorrectionPhoto] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualCal, setManualCal] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');

  const openCorrectMacros = (entry: EnrichedEntry) => {
    setCorrectEntry(entry);
    setCorrectedMacros(null);
    setCorrectionPhoto(null);
    setCorrecting(false);
    setManualMode(false);
    setManualCal(''); setManualProtein(''); setManualCarbs(''); setManualFat('');
  };

  const closeCorrectMacros = () => {
    setCorrectEntry(null);
    setCorrectedMacros(null);
    setCorrectionPhoto(null);
    setCorrecting(false);
    setManualMode(false);
  };

  const pickPhoto = async (useCamera: boolean) => {
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
    const tempUri = asset.uri;

    // Grab base64 from picker BEFORE moving the file
    let base64 = asset.base64 ?? '';
    if (!base64) {
      try {
        const raw = new File(tempUri).base64();
        base64 = typeof raw === 'string' ? raw : '';
      } catch (e) {
        console.warn('[SpiceStrong] Could not read base64:', e);
      }
    }

    // Strip data URI prefix if present (e.g. "data:image/jpeg;base64,...")
    if (base64.includes(',')) {
      base64 = base64.split(',')[1];
    }

    if (!base64 || typeof base64 !== 'string' || base64.length < 100) {
      Alert.alert('Photo Error', 'Could not read the image. Try a different photo.');
      return;
    }

    console.log(`[SpiceStrong] Photo base64 length: ${base64.length} (${Math.round(base64.length / 1024)}KB), starts with: ${base64.substring(0, 10)}`);

    // Copy to permanent location so the image survives app restarts
    let permanentUri = tempUri;
    try {
      const dir = new Directory(Paths.document, 'meal_photos');
      if (!dir.exists) dir.create();
      const filename = `meal_${correctEntry?.id ?? Date.now()}.jpg`;
      const dest = new File(dir, filename);
      if (dest.exists) dest.delete();
      const src = new File(tempUri);
      src.move(dest);
      permanentUri = dest.uri;
    } catch (e) {
      console.warn('[SpiceStrong] Could not save photo permanently:', e);
    }

    setCorrectionPhoto(permanentUri);
    setCorrecting(true);

    try {
      const macros = await analyzeFoodPhoto(base64, correctEntry?.recipeName ?? 'meal');
      console.log('[SpiceStrong] Macro analysis result:', macros);
      setCorrectedMacros(macros);
    } catch (err: any) {
      console.error('[SpiceStrong] Macro correction failed:', err?.message ?? err, err);
      setCorrecting(false);
      Alert.alert(
        'Could not scan this photo',
        'The image may be unclear or the service is temporarily unavailable. You can try a different photo or enter the macros manually.',
        [
          { text: 'Try Again', onPress: () => setCorrectionPhoto(null) },
          { text: 'Enter Manually', onPress: () => {
            setCorrectionPhoto(null);
            setManualMode(true);
            // Pre-fill with current values
            setManualCal(String(correctEntry?.calories ?? ''));
            setManualProtein(String(correctEntry?.proteinG ?? ''));
            setManualCarbs(String(correctEntry?.carbsG ?? ''));
            setManualFat(String(correctEntry?.fatG ?? ''));
          }},
        ],
      );
      return;
    } finally {
      setCorrecting(false);
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
    const override: MacroOverride = { ...macros, photoUri: '' };
    await AsyncStorage.setItem(`${MACRO_OVERRIDE_PREFIX}${correctEntry.id}`, JSON.stringify(override));
    setEnriched((prev) =>
      prev.map((e) =>
        e.id === correctEntry.id
          ? { ...e, ...macros }
          : e
      )
    );
    closeCorrectMacros();
  };

  const applyCorrection = async () => {
    if (!correctEntry || !correctedMacros || !correctionPhoto) return;
    const override: MacroOverride = { ...correctedMacros, photoUri: correctionPhoto };
    await AsyncStorage.setItem(`${MACRO_OVERRIDE_PREFIX}${correctEntry.id}`, JSON.stringify(override));
    // Update enriched list in-place — macros + hero image
    setEnriched((prev) =>
      prev.map((e) =>
        e.id === correctEntry.id
          ? { ...e, calories: correctedMacros.calories, proteinG: correctedMacros.proteinG, carbsG: correctedMacros.carbsG, fatG: correctedMacros.fatG, imageUri: correctionPhoto }
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
  const [quickAddScanning, setQuickAddScanning] = useState(false);
  const [quickAddMacros, setQuickAddMacros] = useState<{ calories: string; proteinG: string; carbsG: string; fatG: string }>({ calories: '', proteinG: '', carbsG: '', fatG: '' });

  const openQuickAdd = (slot: MealSlot) => {
    setQuickAddSlot(slot);
    setQuickAddName('');
    setQuickAddPhoto(null);
    setQuickAddBase64('');
    setQuickAddScanning(false);
    setQuickAddMacros({ calories: '', proteinG: '', carbsG: '', fatG: '' });
    setQuickAddOpen(true);
  };

  const closeQuickAdd = () => {
    Keyboard.dismiss();
    setQuickAddOpen(false);
  };

  const pickQuickAddPhoto = async (useCamera: boolean) => {
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
    let b64 = asset.base64 ?? '';
    if (b64.includes(',')) b64 = b64.split(',')[1];

    // Save to permanent location
    let permanentUri = asset.uri;
    try {
      const dir = new Directory(Paths.document, 'meal_photos');
      if (!dir.exists) dir.create();
      const fname = `quick_${Date.now()}.jpg`;
      const dest = new File(dir, fname);
      if (dest.exists) dest.delete();
      new File(asset.uri).move(dest);
      permanentUri = dest.uri;
    } catch {}

    setQuickAddPhoto(permanentUri);
    setQuickAddBase64(b64);

    // Auto-scan if we have base64
    if (b64 && b64.length > 100) {
      setQuickAddScanning(true);
      try {
        const macros = await analyzeFoodPhoto(b64, quickAddName || 'meal');
        setQuickAddMacros({
          calories: String(macros.calories),
          proteinG: String(macros.proteinG),
          carbsG: String(macros.carbsG),
          fatG: String(macros.fatG),
        });
      } catch (err: any) {
        console.warn('[SpiceStrong] Quick add scan failed:', err);
        // Silent — user can enter manually
      } finally {
        setQuickAddScanning(false);
      }
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
    const override: MacroOverride = { ...macros, photoUri: quickAddPhoto ?? '' };
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
          let calories = 0, proteinG = 0, carbsG = 0, fatG = 0;
          try {
            const overrideStr = await AsyncStorage.getItem(`${MACRO_OVERRIDE_PREFIX}${entry.id}`);
            if (overrideStr) {
              const o: MacroOverride = JSON.parse(overrideStr);
              calories = o.calories; proteinG = o.proteinG; carbsG = o.carbsG; fatG = o.fatG;
              if (o.photoUri) imageUri = o.photoUri;
            }
          } catch {}
          return { ...entry, recipe: null, imageUri, builtinImage: null, calories, proteinG, carbsG, fatG, isQuickAdd: true };
        }

        // Autoplan placeholders — target macros stored in aiNutrition on local recipe
        if (isAutoplan) {
          const recipe = await getRecipeById(entry.recipeId);
          let imageUri = await resolveImage(entry.recipeId, recipe);
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
            }
          } catch {}
          return { ...entry, recipe, imageUri, builtinImage: null, calories, proteinG, carbsG, fatG };
        }

        const recipe = await getRecipeById(entry.recipeId);
        let imageUri = await resolveImage(entry.recipeId, recipe);
        const builtinImage = recipe ? getRecipeCardImage(recipe) : null;
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
          }
        } catch {}
        return { ...entry, recipe, imageUri, builtinImage, calories, proteinG, carbsG, fatG };
      })
    );

    setEnriched(enrichedEntries);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    loadEntries(currentDate);
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
          model: 'claude-sonnet-4-20250514',
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meal Calendar</Text>
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
          {/* Daily macro summary — per serving, always visible */}
          <View style={styles.macroBar}>
            <Text style={styles.macroBarTitle}>Your Daily Total</Text>
              <View style={styles.macroRow}>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{totals.calories}</Text>
                  <Text style={styles.macroLabel}>kcal</Text>
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroItem}>
                  <Text style={[styles.macroValue, styles.macroProtein]}>{totals.proteinG}g</Text>
                  <Text style={styles.macroLabel}>Protein</Text>
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{totals.carbsG}g</Text>
                  <Text style={styles.macroLabel}>Carbs</Text>
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{totals.fatG}g</Text>
                  <Text style={styles.macroLabel}>Fat</Text>
                </View>
              </View>
          </View>

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
                              <TouchableOpacity style={styles.correctBtnOverlay} onPress={(e) => { e.stopPropagation(); openCorrectMacros(entry); }} activeOpacity={0.75}>
                                <Text style={styles.correctBtnOverlayText}>📸 Macros</Text>
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
                        { text: 'Browse Recipes', onPress: () => router.push('/screens/ProteinSelectionScreen') },
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

      {/* Quick Add Meal Modal */}
      <Modal visible={quickAddOpen} transparent animationType="fade" onRequestClose={() => { Keyboard.dismiss(); closeQuickAdd(); }} statusBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.cmBackdrop} onPress={() => { Keyboard.dismiss(); closeQuickAdd(); }}>
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

            {/* Photo section */}
            {!quickAddPhoto ? (
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
                <Image source={{ uri: quickAddPhoto }} style={styles.qaPhotoThumb} contentFit="cover" />
                <TouchableOpacity onPress={() => { setQuickAddPhoto(null); setQuickAddBase64(''); }} activeOpacity={0.7}>
                  <Text style={styles.qaPhotoChange}>Change</Text>
                </TouchableOpacity>
                {quickAddScanning && <ActivityIndicator color={ORANGE} size="small" style={{ marginLeft: 8 }} />}
              </View>
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
              <Text style={styles.cmApplyBtnText}>Add to Meal Plan</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Correct Macros Modal — Two options: Upload Picture OR Enter Manually */}
      <Modal visible={!!correctEntry} transparent animationType="fade" onRequestClose={() => { Keyboard.dismiss(); closeCorrectMacros(); }} statusBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.cmBackdrop} onPress={() => { Keyboard.dismiss(); closeCorrectMacros(); }}>
          <Pressable style={styles.cmSheet} onPress={() => Keyboard.dismiss()}>
            <View style={styles.cmHandle} />
            <Text style={styles.cmTitle}>Correct Macros</Text>
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

            {/* Option selection — only when no mode is active */}
            {!manualMode && !correctionPhoto && !correcting && (
              <View style={styles.cmOptions}>
                <TouchableOpacity style={styles.cmOptionCard} onPress={() => pickPhoto(true)} activeOpacity={0.75}>
                  <Text style={styles.cmOptionEmoji}>📷</Text>
                  <Text style={styles.cmOptionLabel}>Upload Picture</Text>
                  <Text style={styles.cmOptionDesc}>Snap your meal or nutrition label</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cmOptionCard} onPress={() => {
                  setManualMode(true);
                  setManualCal(String(correctEntry?.calories ?? ''));
                  setManualProtein(String(correctEntry?.proteinG ?? ''));
                  setManualCarbs(String(correctEntry?.carbsG ?? ''));
                  setManualFat(String(correctEntry?.fatG ?? ''));
                }} activeOpacity={0.75}>
                  <Text style={styles.cmOptionEmoji}>✏️</Text>
                  <Text style={styles.cmOptionLabel}>Enter Manually</Text>
                  <Text style={styles.cmOptionDesc}>Type in calories & macros</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Manual entry */}
            {manualMode && (
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
              </View>
            )}

            {/* Analyzing */}
            {correcting && (
              <View style={styles.cmAnalyzing}>
                <ActivityIndicator color={ORANGE} size="small" />
                <Text style={styles.cmAnalyzingText}>Analyzing your meal...</Text>
              </View>
            )}

            {/* Photo results */}
            {correctionPhoto && !correcting && !manualMode && (
              <View style={styles.cmResultWrap}>
                <Image source={{ uri: correctionPhoto }} style={styles.cmPhotoPreview} contentFit="cover" />
                {correctedMacros && (
                  <>
                    <View style={styles.cmMacroRow}>
                      <Text style={[styles.cmMacroVal, styles.cmMacroNew]}>{correctedMacros.calories} kcal</Text>
                      <Text style={styles.cmMacroDot}>·</Text>
                      <Text style={[styles.cmMacroVal, { color: ORANGE }]}>{correctedMacros.proteinG}g P</Text>
                      <Text style={styles.cmMacroDot}>·</Text>
                      <Text style={[styles.cmMacroVal, styles.cmMacroNew]}>{correctedMacros.carbsG}g C</Text>
                      <Text style={styles.cmMacroDot}>·</Text>
                      <Text style={[styles.cmMacroVal, styles.cmMacroNew]}>{correctedMacros.fatG}g F</Text>
                    </View>
                    <View style={styles.cmBtnRow}>
                      <TouchableOpacity style={styles.cmApplyBtn} onPress={applyCorrection} activeOpacity={0.8}>
                        <Text style={styles.cmApplyBtnText}>Apply</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.cmRetryBtn} onPress={() => { setCorrectionPhoto(null); setCorrectedMacros(null); }} activeOpacity={0.75}>
                        <Text style={styles.cmRetryBtnText}>Retake</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  back: { fontSize: 24, color: '#FFFFFF', fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', fontFamily: PLAYFAIR },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  autoPlanBtn: {
    backgroundColor: 'rgba(232,93,38,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.35)',
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
    borderBottomColor: BORDER,
  },
  navArrow: { fontSize: 34, color: ORANGE, fontWeight: '700', lineHeight: 38 },
  dayCenter: { alignItems: 'center', gap: 6 },
  dayLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  calendarHint: { fontSize: 12, color: ORANGE, marginTop: 2 },
  todayPill: {
    backgroundColor: 'rgba(232,93,38,0.20)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.45)',
  },
  todayPillText: { fontSize: 10, fontWeight: '800', color: ORANGE, letterSpacing: 1 },

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
    backgroundColor: 'rgba(232,93,38,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.35)',
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
  macroBar: {
    backgroundColor: SURFACE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 24,
  },
  macroBarTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    textAlign: 'center',
  },
  macroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  macroItem: { alignItems: 'center', flex: 1 },
  macroValue: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  macroProtein: { color: ORANGE },
  macroLabel: { fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 2 },
  macroDivider: { width: 1, height: 36, backgroundColor: BORDER },

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
    borderColor: 'rgba(232,93,38,0.25)',
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
    backgroundColor: 'rgba(232,93,38,0.55)',
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
  correctBtnOverlay: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  correctBtnOverlayText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
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
    backgroundColor: 'rgba(232,93,38,0.20)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.40)',
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

  cmManualLink: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.40)',
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
