import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PremiumScreen } from '../../components/PremiumScreen';
import { HomeButton } from '../../components/HomeButton';
import { ProcessingRing } from '../../components/ProcessingRing';
import { addToMealPlan, type MealSlot } from '../../services/mealPlanService';
import { trackEvent } from '../../services/analyticsService';
import { logScreenView } from '../../services/firebaseAnalytics';
import { INGREDIENT_EDIT_IN, INGREDIENT_EDIT_OUT } from './EditIngredientScreen';
import { invokeAnthropicMessages } from '../../services/anthropicService';

const MACRO_OVERRIDE_PREFIX = 'spicestrong_macro_override_';

const SLOT_META: Record<MealSlot, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  breakfast: { label: 'Breakfast', icon: 'sunny-outline' },
  lunch_dinner: { label: 'Lunch/Dinner', icon: 'restaurant-outline' },
  snack_dessert: { label: 'Snack/Dessert', icon: 'sparkles-outline' },
};

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

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function detectMediaType(base64: string): string {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

function extractFirstJson(text: string): any {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON in response');
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error('Incomplete JSON');
  return JSON.parse(text.slice(start, end + 1));
}

function parseIngredientComponent(component: string): { name: string; calories: string; quantity: string; proteinG: number; carbsG: number; fatG: number } {
  const normalized = component.replace(/—/g, '|').replace(/ - /g, ' | ');
  const parts = normalized.split('|').map((part) => part.trim()).filter(Boolean);
  const name = parts[0]?.replace(/^[-•\s]+/, '') || component;
  const calories = parts.find((part) => /\bcal\b|kcal/i.test(part))?.replace(/^~\s*/, '') ?? '';
  const quantity = parts.find((part) => !/\bcal\b|kcal/i.test(part) && !/\bprotein\b/i.test(part) && !/\bcarb/i.test(part) && !/\bfat\b/i.test(part) && part !== name) ?? '';
  const proteinPart = parts.find((part) => /\bprotein\b/i.test(part));
  const carbsPart = parts.find((part) => /\bcarb/i.test(part));
  const fatPart = parts.find((part) => /\bfat\b/i.test(part));
  const proteinG = proteinPart ? Math.round(Number(proteinPart.replace(/[^\d.]/g, '')) || 0) : 0;
  const carbsG = carbsPart ? Math.round(Number(carbsPart.replace(/[^\d.]/g, '')) || 0) : 0;
  const fatG = fatPart ? Math.round(Number(fatPart.replace(/[^\d.]/g, '')) || 0) : 0;
  return { name, calories, quantity, proteinG, carbsG, fatG };
}

function getFoodAnalysisErrorMessage(err: any): string {
  const message = String(err?.message || '');
  if (/non-2xx|function|proxy|anthropic/i.test(message)) {
    return 'Food analysis is temporarily unavailable. Please try again, or use a clearer photo from your gallery.';
  }
  return message || 'Try another photo or use gallery.';
}

async function analyzeFoodPhotosDirect(photos: { base64: string }[], mealName = 'meal'): Promise<FoodPhotoAnalysis> {
  const imageBlocks = photos.slice(0, 3).map((photo) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: detectMediaType(photo.base64),
      data: photo.base64,
    },
  }));

  const data = await invokeAnthropicMessages({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: `You are a Cal AI-style nutrition estimator for SpiceStrong.

Return ONLY this JSON:
{
  "name": "short appetizing food title",
  "description": "one short useful meal description",
  "calories": 0,
  "caloriesMin": 0,
  "caloriesMax": 0,
  "proteinG": 0,
  "carbsG": 0,
  "fatG": 0,
  "confidence": "high" | "medium" | "low",
  "components": [
    "Bell pepper | 25 cal | 1/2 cup",
    "Spinach | 15 cal | 1 cup",
    "Eggs | 140 cal | 2 large"
  ],
  "isRestaurantPortion": true | false
}

Ingredient rules:
- Break visible foods into separate simple ingredients whenever possible.
- Prefer names like bell pepper, spinach, mixed vegetables, egg, cheese, rice, sauce.
- Every component must be "Ingredient name | total cal | qty | Xg protein | Xg carbs | Xg fat".
- Include estimated protein, carbs, and fat grams for each ingredient.`,
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks,
        { type: 'text', text: `Analyze this food scan: "${mealName}".` },
      ],
    }],
  });
  const parsed = extractFirstJson(data.content?.[0]?.text || '');
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

async function persistMealPhotoUris(photos: { uri: string; base64: string }[], prefix: string): Promise<string[]> {
  const dirUri = `${FileSystem.documentDirectory}meal_photos/`;
  try {
    const info = await FileSystem.getInfoAsync(dirUri);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  } catch {}

  const saved: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    let uri = photos[i].uri.split('?')[0];
    if (uri.includes('/meal_photos/')) {
      saved.push(uri);
      continue;
    }
    try {
      const destUri = `${dirUri}${prefix}_${Date.now()}_${i}.jpg`;
      const destInfo = await FileSystem.getInfoAsync(destUri);
      if (destInfo.exists) await FileSystem.deleteAsync(destUri, { idempotent: true });
      await FileSystem.moveAsync({ from: uri, to: destUri });
      uri = destUri;
    } catch {}
    saved.push(uri);
  }
  return saved;
}

export default function ScanFoodScreen() {
  const router = useRouter();
  useEffect(() => { logScreenView('ScanFoodScreen'); }, []);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = typeof params.date === 'string' ? params.date : todayIso();
  const cameraRef = useRef<CameraView>(null);

  const [slot, setSlot] = useState<MealSlot | null>(null);
  const [photos, setPhotos] = useState<{ uri: string; base64: string }[]>([]);
  const [analysis, setAnalysis] = useState<FoodPhotoAnalysis | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [labelCameraOpen, setLabelCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(INGREDIENT_EDIT_OUT).then((raw) => {
      if (!raw) return;
      AsyncStorage.removeItem(INGREDIENT_EDIT_OUT).catch(() => {});
      const result = JSON.parse(raw);
      setAnalysis((prev) => {
        if (!prev) return prev;
        const components = [...prev.components];
        const current = components[result.index] ? parseIngredientComponent(components[result.index]) : null;
        if (result.deleted) {
          components.splice(result.index, 1);
          const currentCalories = current ? Number(current.calories.replace(/[^\d]/g, '')) || 0 : 0;
          return {
            ...prev,
            calories: Math.max(0, prev.calories - currentCalories),
            caloriesMin: Math.max(0, prev.caloriesMin - currentCalories),
            caloriesMax: Math.max(0, prev.caloriesMax - currentCalories),
            proteinG: Math.max(0, prev.proteinG - (current?.proteinG ?? 0)),
            carbsG: Math.max(0, prev.carbsG - (current?.carbsG ?? 0)),
            fatG: Math.max(0, prev.fatG - (current?.fatG ?? 0)),
            components,
          };
        } else {
          const macros = [
              result.proteinG ? `${result.proteinG}g protein` : '',
              result.carbsG ? `${result.carbsG}g carbs` : '',
              result.fatG ? `${result.fatG}g fat` : '',
            ].filter(Boolean).join(' | ');
            components[result.index] = [result.name, result.calories, result.quantity, macros].filter(Boolean).join(' | ');
        }
        const currentCalories = current ? Number(current.calories.replace(/[^\d]/g, '')) || 0 : 0;
        const nextCalories = Number(String(result.calories ?? '').replace(/[^\d]/g, '')) || 0;
        return {
          ...prev,
          calories: Math.max(0, prev.calories + nextCalories - currentCalories),
          caloriesMin: Math.max(0, prev.caloriesMin + nextCalories - currentCalories),
          caloriesMax: Math.max(0, prev.caloriesMax + nextCalories - currentCalories),
          proteinG: Math.max(0, prev.proteinG + Math.round(Number(result.proteinG) || 0) - (current?.proteinG ?? 0)),
          carbsG: Math.max(0, prev.carbsG + Math.round(Number(result.carbsG) || 0) - (current?.carbsG ?? 0)),
          fatG: Math.max(0, prev.fatG + Math.round(Number(result.fatG) || 0) - (current?.fatG ?? 0)),
          components,
        };
      });
    }).catch(() => {});
  }, []));

  const applyPhoto = async (uri: string) => {
    const compressed = await manipulateAsync(
      uri,
      [{ resize: { width: 768 } }],
      { compress: 0.38, format: SaveFormat.JPEG, base64: true },
    );
    let base64 = compressed.base64 ?? '';
    if (base64.includes(',')) base64 = base64.split(',')[1];
    if (!base64 || base64.length < 100) return;

    const nextPhotos = [...photos, { uri: `${uri}?t=${Date.now()}`, base64 }];
    setPhotos(nextPhotos);
    setScanning(true);
    try {
      const result = await analyzeFoodPhotosDirect(nextPhotos, analysis?.name || 'meal');
      setAnalysis(result);
      setEditMode(false);
      trackEvent('scan_food', { screen: 'ScanFoodScreen', metadata: { slot: slot ?? 'others', confidence: result.confidence } });
    } catch (err: any) {
      Alert.alert('Analysis failed', getFoodAnalysisErrorMessage(err));
    } finally {
      setScanning(false);
    }
  };

  const updateAnalysisNumber = (
    field: 'calories' | 'proteinG' | 'carbsG' | 'fatG',
    value: string,
  ) => {
    const numericValue = Math.max(0, Math.round(Number(value.replace(/[^\d]/g, '')) || 0));
    setAnalysis((prev) => prev ? { ...prev, [field]: numericValue } : prev);
  };

  const addIngredient = () => {
    setAnalysis((prev) => prev ? { ...prev, components: [...prev.components, 'Ingredient | 0 cal | qty'] } : prev);
  };

  const openIngredientEdit = async (index: number, component: string) => {
    const item = parseIngredientComponent(component);
    let { proteinG, carbsG, fatG } = item;

    // Estimate from meal totals when ingredient has no stored macros
    if (!proteinG && !carbsG && !fatG && analysis) {
      const ingCal = Number(item.calories.replace(/[^\d]/g, '')) || 0;
      const totalIngCal = analysis.components.reduce((sum, c) => {
        return sum + (Number(parseIngredientComponent(c).calories.replace(/[^\d]/g, '')) || 0);
      }, 0);
      if (totalIngCal > 0 && ingCal > 0) {
        const share = ingCal / totalIngCal;
        proteinG = Math.round(analysis.proteinG * share);
        carbsG = Math.round(analysis.carbsG * share);
        fatG = Math.round(analysis.fatG * share);
      }
    }

    await AsyncStorage.setItem(INGREDIENT_EDIT_IN, JSON.stringify({
      index, name: item.name, calories: item.calories, quantity: item.quantity,
      proteinG, carbsG, fatG,
    }));
    router.push('/screens/EditIngredientScreen');
  };

  const pickPhoto = async (useCamera: boolean) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
      allowsEditing: false,
    };
    let result: ImagePicker.ImagePickerResult;
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Camera access is required.');
        return;
      }
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Gallery access is required.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync(options);
    }
    if (result.canceled || !result.assets?.[0]) return;
    await applyPhoto(result.assets[0].uri);
  };

  const openLabelCamera = async () => {
    const perm = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera access is required.');
      return;
    }
    setCameraReady(false);
    setLabelCameraOpen(true);
  };

  const captureLabel = async () => {
    if (!cameraRef.current || !cameraReady || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.75,
        base64: true,
        skipProcessing: false,
      });
      if (photo?.uri) {
        setLabelCameraOpen(false);
        await applyPhoto(photo.uri);
      }
    } catch {
      Alert.alert('Capture failed', 'Could not capture the nutrition label.');
    } finally {
      setCapturing(false);
    }
  };

  const saveMeal = async () => {
    if (!analysis) return;
    Keyboard.dismiss();
    setSaving(true);
    try {
      const entryId = `quick_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const result = await addToMealPlan(date, slot ?? 'others', {
        id: entryId,
        name: analysis.name.trim() || 'Detected Food',
        proteinName: 'Custom',
        proteinEmoji: 'SS',
        mealType: slot,
      });
      if (!result.success) {
        Alert.alert('Slot Full', result.error ?? 'Could not add meal.');
        return;
      }

      const photoUris = await persistMealPhotoUris(photos, `quick_${Date.now()}`);
      if (result.entryId) {
        await AsyncStorage.setItem(`${MACRO_OVERRIDE_PREFIX}${result.entryId}`, JSON.stringify({
          calories: analysis.calories,
          proteinG: analysis.proteinG,
          carbsG: analysis.carbsG,
          fatG: analysis.fatG,
          description: analysis.description,
          components: analysis.components,
          photoUri: photoUris[0] ?? '',
          photoUris,
        }));
      }
      trackEvent('meal_saved', { screen: 'ScanFoodScreen', metadata: { slot: slot ?? 'others' } });
      router.back();
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Could not save this meal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEyebrow}>Daily Cal Tracker</Text>
          <Text style={styles.headerTitle}>Scan Food</Text>
        </View>
        <HomeButton />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 34 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.scanHero}>
          <Text style={styles.heroTitle}>Capture your meal</Text>
          <Text style={styles.heroText}>Scan food, choose from gallery, or frame a nutrition label.</Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity style={[styles.actionCard, styles.actionPrimary]} onPress={() => pickPhoto(true)} activeOpacity={0.86}>
              <Ionicons name="camera-outline" size={26} color="#0F0D0B" />
              <Text style={styles.actionPrimaryText}>Scan Food</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => pickPhoto(false)} activeOpacity={0.82}>
              <Ionicons name="images-outline" size={25} color="#F8F1E8" />
              <Text style={styles.actionText}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={openLabelCamera} activeOpacity={0.82}>
              <Ionicons name="reader-outline" size={25} color="#F8F1E8" />
              <Text style={styles.actionText}>Food Label</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slotRow}>
          {(Object.keys(SLOT_META) as MealSlot[]).map((item) => {
            const active = slot === item;
            return (
              <TouchableOpacity key={item} style={[styles.slotPill, active && styles.slotPillActive]} onPress={() => setSlot((prev) => prev === item ? null : item)} activeOpacity={0.82}>
                <Ionicons name={SLOT_META[item].icon} size={16} color={active ? '#FFFFFF' : 'rgba(248,241,232,0.62)'} />
                <Text style={[styles.slotText, active && styles.slotTextActive]}>{SLOT_META[item].label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
            {photos.map((photo, index) => (
              <Image key={`${photo.uri}_${index}`} source={{ uri: photo.uri }} style={styles.photoThumb} contentFit="cover" />
            ))}
          </ScrollView>
        )}

        {scanning && (
          <View style={styles.loadingCard}>
            <ProcessingRing label="Reading nutrition..." expectedMs={7000} />
          </View>
        )}

        {analysis && (
          <View style={styles.resultCard}>
            <View style={styles.resultTopRow}>
              <Text style={styles.resultTime}>Just scanned</Text>
            </View>
            <TextInput
              style={styles.resultTitle}
              value={analysis.name || 'Detected Food'}
              onChangeText={(name) => setAnalysis((prev) => prev ? { ...prev, name } : prev)}
              placeholder="Food title"
              placeholderTextColor="rgba(248,241,232,0.34)"
            />
            <TextInput
              style={styles.resultDescription}
              value={analysis.description}
              onChangeText={(description) => setAnalysis((prev) => prev ? { ...prev, description } : prev)}
              placeholder="Short description"
              placeholderTextColor="rgba(248,241,232,0.34)"
              multiline
            />

            <View style={styles.calorieCard}>
              <View style={styles.calorieIcon}>
                <Ionicons name="flame" size={25} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.metricLabel}>Calories</Text>
                {editMode ? (
                  <TextInput
                    style={styles.calorieInput}
                    value={String(analysis.calories)}
                    onChangeText={(value) => updateAnalysisNumber('calories', value)}
                    keyboardType="number-pad"
                    selectTextOnFocus
                  />
                ) : (
                  <Text style={styles.calorieValue}>{analysis.calories}</Text>
                )}
              </View>
            </View>

            <View style={styles.macroRow}>
              <MacroTile
                icon="barbell-outline"
                label="Protein"
                value={analysis.proteinG}
                color="#EF6A6A"
                editable={editMode}
                onChange={(value) => updateAnalysisNumber('proteinG', value)}
              />
              <MacroTile
                icon="leaf-outline"
                label="Carbs"
                value={analysis.carbsG}
                color="#E8A87C"
                editable={editMode}
                onChange={(value) => updateAnalysisNumber('carbsG', value)}
              />
              <MacroTile
                icon="water-outline"
                label="Fats"
                value={analysis.fatG}
                color="#60A5FA"
                editable={editMode}
                onChange={(value) => updateAnalysisNumber('fatG', value)}
              />
            </View>

            <View style={styles.ingredientsHeader}>
              <Text style={styles.ingredientsTitle}>Ingredients</Text>
              <TouchableOpacity style={styles.addIngredientBtn} onPress={addIngredient} activeOpacity={0.82}>
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.addIngredientText}>Add</Text>
              </TouchableOpacity>
            </View>
            {(analysis.components.length ? analysis.components : ['Ingredient | 0 cal | qty']).map((component, index) => {
              const item = parseIngredientComponent(component);
              const calNum = item.calories.replace(/[^\d]/g, '');
              return (
                <TouchableOpacity
                  key={`${component}_${index}`}
                  style={styles.ingredientRow}
                  onPress={() => openIngredientEdit(index, component)}
                  activeOpacity={0.76}
                >
                  <View style={styles.ingredientLeft}>
                    <Text style={styles.ingredientName} numberOfLines={1}>{item.name}</Text>
                    {calNum ? <Text style={styles.ingredientDot}>·</Text> : null}
                    {calNum ? <Text style={styles.ingredientCal}>{calNum} cal</Text> : null}
                  </View>
                  <View style={styles.ingredientRight}>
                    <Text style={styles.ingredientQty} numberOfLines={1}>{item.quantity}</Text>
                    <Ionicons name="chevron-forward" size={14} color="rgba(248,241,232,0.28)" />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {analysis && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.secondaryBtn, editMode && styles.secondaryBtnActive]}
            onPress={() => setEditMode((value) => !value)}
            activeOpacity={0.82}
          >
            <Ionicons name={editMode ? 'checkmark' : 'create-outline'} size={18} color="#F8F1E8" />
            <Text style={styles.secondaryBtnText}>{editMode ? 'Done' : 'Edit Macros'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneBtn} onPress={saveMeal} disabled={saving} activeOpacity={0.86}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.doneBtnText}>Save Meal</Text>}
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={labelCameraOpen} animationType="slide" onRequestClose={() => setLabelCameraOpen(false)}>
        <View style={styles.labelCameraWrap}>
          <CameraView ref={cameraRef} style={styles.labelCamera} facing="back" onCameraReady={() => setCameraReady(true)} />
          <View style={styles.labelCameraOverlay}>
            <View style={[styles.labelTopRow, { paddingTop: insets.top + 12 }]}>
              <TouchableOpacity style={styles.floatingBtn} onPress={() => setLabelCameraOpen(false)} activeOpacity={0.82}>
                <Ionicons name="close" size={26} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.labelBadge}>
                <Ionicons name="reader-outline" size={17} color="#FFFFFF" />
                <Text style={styles.labelBadgeText}>Nutrition Label</Text>
              </View>
            </View>
            <View style={styles.labelFrameWrap}>
              <View style={styles.labelFrame}>
                <View style={[styles.corner, styles.cornerTl]} />
                <View style={[styles.corner, styles.cornerTr]} />
                <View style={[styles.corner, styles.cornerBl]} />
                <View style={[styles.corner, styles.cornerBr]} />
                <Text style={styles.labelFrameTitle}>Cover nutrition details</Text>
                <Text style={styles.labelFrameText}>Fit the full Nutrition Facts panel inside this frame</Text>
              </View>
            </View>
            <View style={[styles.captureWrap, { paddingBottom: insets.bottom + 20 }]}>
              <TouchableOpacity
                style={[styles.captureBtn, (!cameraReady || capturing) && styles.captureBtnDisabled]}
                onPress={captureLabel}
                disabled={!cameraReady || capturing}
                activeOpacity={0.82}
              >
                <View style={styles.captureInner} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </PremiumScreen>
  );
}

function MacroTile({
  icon,
  label,
  value,
  color,
  editable = false,
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  color: string;
  editable?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <View style={styles.macroTile}>
      <Ionicons name={icon} size={19} color={color} />
      <Text style={styles.macroLabel}>{label}</Text>
      {editable ? (
        <View style={styles.macroEditRow}>
          <TextInput
            style={styles.macroInput}
            value={String(value)}
            onChangeText={onChange}
            keyboardType="number-pad"
            selectTextOnFocus
          />
          <Text style={styles.macroUnit}>g</Text>
        </View>
      ) : (
        <Text style={styles.macroValue}>{value}g</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  headerBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  headerTitleWrap: { alignItems: 'center' },
  headerEyebrow: {
    color: 'rgba(248,241,232,0.48)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginTop: 2 },
  scroll: { paddingHorizontal: 18 },
  scanHero: {
    borderRadius: 28,
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
    padding: 16,
  },
  heroTitle: { color: '#FFFFFF', fontSize: 28, lineHeight: 34, fontWeight: '900' },
  heroText: { color: 'rgba(248,241,232,0.58)', fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 6 },
  actionGrid: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionCard: {
    flex: 1,
    minHeight: 104,
    borderRadius: 22,
    backgroundColor: 'rgba(13,11,9,0.36)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 8,
  },
  actionPrimary: { backgroundColor: '#F8F1E8', borderColor: 'rgba(248,241,232,0.72)' },
  actionText: { color: '#F8F1E8', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  actionPrimaryText: { color: '#0F0D0B', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  slotRow: { gap: 10, paddingVertical: 16, alignItems: 'center' },
  slotPill: {
    minHeight: 42,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.13)',
    backgroundColor: 'rgba(248,241,232,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
  },
  slotPillActive: { backgroundColor: 'rgba(143,58,31,0.50)', borderColor: 'rgba(232,168,124,0.55)' },
  slotText: { color: 'rgba(248,241,232,0.62)', fontSize: 12, fontWeight: '900' },
  slotTextActive: { color: '#FFFFFF' },
  photoStrip: { gap: 10, paddingBottom: 14 },
  photoThumb: { width: 64, height: 64, borderRadius: 18, backgroundColor: 'rgba(248,241,232,0.08)' },
  loadingCard: {
    minHeight: 150,
    borderRadius: 20,
    backgroundColor: 'rgba(13,11,9,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  loadingText: { color: 'rgba(248,241,232,0.72)', fontSize: 13, fontWeight: '900' },
  resultCard: {
    borderRadius: 28,
    backgroundColor: 'rgba(248,241,232,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
    padding: 16,
    marginTop: 2,
  },
  resultTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  resultTime: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(13,11,9,0.30)',
    color: 'rgba(248,241,232,0.58)',
    fontSize: 12,
    fontWeight: '800',
  },
  editToggle: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
  },
  editToggleActive: {
    backgroundColor: 'rgba(143,58,31,0.48)',
    borderColor: 'rgba(232,168,124,0.50)',
  },
  editToggleText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  resultTitle: { color: '#FFFFFF', fontSize: 24, lineHeight: 30, fontWeight: '900', padding: 0, marginBottom: 8 },
  resultDescription: {
    color: 'rgba(248,241,232,0.66)',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    padding: 0,
    marginBottom: 14,
    minHeight: 38,
  },
  calorieCard: {
    minHeight: 94,
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
  calorieIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: '#8F3A1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: { color: 'rgba(248,241,232,0.56)', fontSize: 13, fontWeight: '800' },
  calorieValue: { color: '#FFFFFF', fontSize: 38, lineHeight: 42, fontWeight: '900' },
  calorieInput: {
    minWidth: 112,
    color: '#FFFFFF',
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '900',
    padding: 0,
  },
  macroRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  macroTile: {
    flex: 1,
    minHeight: 84,
    borderRadius: 18,
    backgroundColor: 'rgba(13,11,9,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.11)',
    padding: 10,
    justifyContent: 'center',
  },
  macroLabel: { color: 'rgba(248,241,232,0.58)', fontSize: 12, fontWeight: '800', marginTop: 6 },
  macroValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 3 },
  macroEditRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 2,
  },
  macroInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    padding: 0,
    minWidth: 34,
  },
  macroUnit: {
    color: 'rgba(248,241,232,0.54)',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 2,
  },
  ingredientsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  ingredientsTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  confidence: { color: 'rgba(248,241,232,0.46)', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  addIngredientBtn: {
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
  addIngredientText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  ingredientRow: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
    gap: 8,
  },
  ingredientLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, overflow: 'hidden' },
  ingredientName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  ingredientDot: { color: 'rgba(248,241,232,0.35)', fontSize: 14, fontWeight: '600', flexShrink: 0 },
  ingredientCal: { color: 'rgba(248,241,232,0.50)', fontSize: 13, fontWeight: '600', flexShrink: 0 },
  ingredientRight: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  ingredientQty: { color: 'rgba(248,241,232,0.60)', fontSize: 13, fontWeight: '600', maxWidth: 110 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: 'rgba(15,13,11,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(248,241,232,0.10)',
  },
  secondaryBtn: {
    flex: 0.9,
    minHeight: 56,
    borderRadius: 22,
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtnActive: {
    backgroundColor: 'rgba(143,58,31,0.46)',
    borderColor: 'rgba(232,168,124,0.46)',
  },
  secondaryBtnText: { color: '#F8F1E8', fontSize: 15, fontWeight: '900' },
  doneBtn: {
    flex: 1.1,
    minHeight: 56,
    borderRadius: 22,
    backgroundColor: '#8F3A1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  labelCameraWrap: { flex: 1, backgroundColor: '#000000' },
  labelCamera: { flex: 1 },
  labelCameraOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', paddingHorizontal: 10 },
  labelTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  floatingBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(13,11,9,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelBadge: {
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
  labelBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  labelFrameWrap: { flex: 1, justifyContent: 'center' },
  labelFrame: {
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
  corner: { position: 'absolute', width: 58, height: 58, borderColor: '#FFFFFF' },
  cornerTl: { top: 18, left: 18, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 18 },
  cornerTr: { top: 18, right: 18, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 18 },
  cornerBl: { bottom: 18, left: 18, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 18 },
  cornerBr: { bottom: 18, right: 18, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 18 },
  labelFrameTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  labelFrameText: {
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
  captureWrap: { alignItems: 'center' },
  captureBtn: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: 'rgba(248,241,232,0.92)',
    borderWidth: 7,
    borderColor: 'rgba(13,11,9,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnDisabled: { opacity: 0.55 },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF' },
});
