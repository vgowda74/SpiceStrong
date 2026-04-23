/**
 * ScanFridgeScreen.tsx — SpiceStrong
 * Multi-step "Scan My Grocery" flow:
 *   Step 1: Photo capture (up to 4 photos)
 *   Step 2: AI identification (loading)
 *   Step 3: Ingredient review + edit
 *   Step 4: Navigate to FridgeRecipeResultsScreen
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  identifyIngredients,
  scanReceiptOrList,
  DEFAULT_PANTRY_STAPLES,
  type ScannedIngredient,
  type IngredientCategory,
} from '../../services/fridgeScanService';
import { addPantryItemsBatch, addToGroceryList } from '../../services/pantryService';

const ORANGE = '#E85D26';
const BG = '#0F0F0F';
const SURFACE = '#1A1A1A';
const BORDER = 'rgba(255,255,255,0.10)';
const MAX_PHOTOS = 4;
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'PlayfairDisplay_700Bold',
  default: 'serif',
});

const CATEGORY_ORDER: IngredientCategory[] = ['PROTEIN', 'VEGETABLE', 'FRUIT', 'DAIRY', 'GRAIN', 'CONDIMENT', 'SPICE', 'PANTRY'];
const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  PROTEIN: '💪 Proteins',
  VEGETABLE: '🥬 Vegetables',
  FRUIT: '🍎 Fruits',
  DAIRY: '🥛 Dairy',
  GRAIN: '🌾 Grains',
  CONDIMENT: '🫙 Condiments',
  SPICE: '🧂 Spices',
  PANTRY: '🥫 Pantry',
};

type Step = 'capture' | 'scanning' | 'review';

export default function ScanFridgeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();

  // mode: 'receipt' = scan grocery receipt → add to pantry
  //        'list' = scan shopping list image → add to grocery list
  //        default = original fridge scan flow
  const scanMode = (params.mode === 'receipt' || params.mode === 'list') ? params.mode : 'fridge';

  const modeConfig = {
    fridge: { title: 'Scan My Grocery', stepTitle: 'Scan your groceries or pantry', stepHint: 'Up to 4 photos — grocery bags, fridge, pantry shelves', scanningText: 'Scanning your ingredients...', doneBtn: 'Find Recipes' },
    receipt: { title: 'Scan Receipt', stepTitle: 'Photograph your grocery receipt', stepHint: 'Take a clear photo of the receipt — we\'ll extract food items', scanningText: 'Reading your receipt...', doneBtn: 'Add to Pantry' },
    list: { title: 'Scan Shopping List', stepTitle: 'Photograph your shopping list', stepHint: 'Handwritten note, printed list, SMS screenshot, or any list image', scanningText: 'Reading your list...', doneBtn: 'Add to Shopping List' },
  }[scanMode];

  const [step, setStep] = useState<Step>('capture');
  const [photos, setPhotos] = useState<{ uri: string; base64: string }[]>([]);
  const [ingredients, setIngredients] = useState<ScannedIngredient[]>([]);
  const [pantryChecked, setPantryChecked] = useState<Set<string>>(
    new Set(DEFAULT_PANTRY_STAPLES.map((s) => s.name))
  );
  const [addingName, setAddingName] = useState('');
  const [addingCategory, setAddingCategory] = useState<IngredientCategory>('VEGETABLE');

  // ── Photo capture ──
  const takePhoto = async (useCamera: boolean) => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('Max Photos', `You can take up to ${MAX_PHOTOS} photos.`);
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
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotos((prev) => [...prev, { uri: result.assets[0].uri, base64: result.assets[0].base64 ?? '' }]);
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── AI scan ──
  const startScan = async () => {
    setStep('scanning');
    try {
      const photoData = photos.map((p) => ({ base64: p.base64, uri: p.uri }));
      const results = scanMode === 'fridge'
        ? await identifyIngredients(photoData)
        : await scanReceiptOrList(photoData, scanMode);

      // Receipt/list mode: skip review, go straight to confirmation
      if (scanMode === 'receipt' || scanMode === 'list') {
        if (results.length === 0) {
          Alert.alert('No Items Found', 'Could not identify any items from the image. Try a clearer photo.');
          setStep('capture');
          return;
        }
        const itemList = results.slice(0, 8).map((i) => `• ${i.name} (${i.quantity})`).join('\n');
        const moreText = results.length > 8 ? `\n...and ${results.length - 8} more` : '';
        const target = scanMode === 'receipt' ? 'pantry' : 'shopping list';
        Alert.alert(
          `Found ${results.length} Items`,
          `These items will be added to your ${target}:\n\n${itemList}${moreText}`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setStep('capture') },
            {
              text: `Add ${results.length} Items`,
              onPress: async () => {
                if (scanMode === 'receipt') {
                  await addPantryItemsBatch(results.map((i) => ({
                    name: i.name,
                    category: i.category,
                    quantity: i.quantity,
                    state: i.state,
                  })));
                } else {
                  for (const ing of results) {
                    await addToGroceryList({ name: ing.name, quantity: ing.quantity });
                  }
                }
                Alert.alert('Done!', `${results.length} item${results.length !== 1 ? 's' : ''} added to your ${target}.`, [
                  { text: 'OK', onPress: () => router.back() },
                ]);
              },
            },
          ],
        );
        return;
      }

      // Fridge mode: show review screen as before
      setIngredients(results);
      setStep('review');
    } catch (err: any) {
      console.error(`[SpiceStrong] ${scanMode} scan error:`, err);
      const friendly = scanMode === 'receipt'
        ? 'We had trouble reading that receipt. Try taking a clearer photo with good lighting and make sure the text is visible.'
        : scanMode === 'list'
        ? 'We had trouble reading that list. Try holding the camera steady, make sure the writing is visible, and use good lighting.'
        : 'We had trouble identifying the items. Try a clearer photo with good lighting.';
      Alert.alert('Let\'s Try Again', friendly, [
        { text: 'OK', onPress: () => setStep('capture') },
      ]);
    }
  };

  // ── Ingredient editing ──
  const removeIngredient = (name: string) => {
    setIngredients((prev) => prev.filter((i) => i.name !== name));
  };

  const addIngredient = () => {
    const name = addingName.trim().toLowerCase();
    if (!name) return;
    if (ingredients.some((i) => i.name === name)) {
      Alert.alert('Already added', `"${name}" is already in the list.`);
      return;
    }
    setIngredients((prev) => [...prev, {
      name,
      category: addingCategory,
      state: 'raw',
      quantity: 'some',
      confidence: 'high',
    }]);
    setAddingName('');
  };

  const togglePantry = (name: string) => {
    setPantryChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // ── Save items ──
  const handleDone = async () => {
    if (scanMode === 'list') {
      // Confirm before adding to shopping list
      Alert.alert(
        'Add to Shopping List',
        `${ingredients.length} item${ingredients.length !== 1 ? 's' : ''} will be added to your shopping list.\n\n${ingredients.slice(0, 5).map((i) => `• ${i.name} (${i.quantity})`).join('\n')}${ingredients.length > 5 ? `\n...and ${ingredients.length - 5} more` : ''}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: `Add ${ingredients.length} Items`,
            onPress: async () => {
              for (const ing of ingredients) {
                await addToGroceryList({ name: ing.name, quantity: ing.quantity });
              }
              Alert.alert('Added!', `${ingredients.length} item${ingredients.length !== 1 ? 's' : ''} added to your shopping list.`, [
                { text: 'OK', onPress: () => router.back() },
              ]);
            },
          },
        ],
      );
      return;
    } else if (scanMode === 'receipt') {
      // Confirm before adding to pantry
      Alert.alert(
        'Add to Pantry',
        `${ingredients.length} item${ingredients.length !== 1 ? 's' : ''} will be added to your pantry.\n\n${ingredients.slice(0, 5).map((i) => `• ${i.name} (${i.quantity})`).join('\n')}${ingredients.length > 5 ? `\n...and ${ingredients.length - 5} more` : ''}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: `Add ${ingredients.length} Items`,
            onPress: async () => {
              await addPantryItemsBatch(ingredients.map((i) => ({
                name: i.name,
                category: i.category,
                quantity: i.quantity,
                state: i.state,
              })));
              Alert.alert('Added!', `${ingredients.length} item${ingredients.length !== 1 ? 's' : ''} added to your pantry.`, [
                { text: 'OK', onPress: () => router.back() },
              ]);
            },
          },
        ],
      );
      return;
    } else {
      // Original fridge flow — find recipes
      const pantryItems = DEFAULT_PANTRY_STAPLES.filter((s) => pantryChecked.has(s.name));
      const allIngredients = [...ingredients, ...pantryItems.filter((p) => !ingredients.some((i) => i.name === p.name))];
      await addPantryItemsBatch(allIngredients.map((i) => ({
        name: i.name,
        category: i.category,
        quantity: i.quantity,
        state: i.state,
      })));
      await AsyncStorage.setItem('spicestrong_fridge_scan', JSON.stringify(allIngredients));
      router.push('/screens/FridgeRecipeResultsScreen');
    }
  };

  // ── Group ingredients by category ──
  const grouped = CATEGORY_ORDER.reduce<Record<string, ScannedIngredient[]>>((acc, cat) => {
    const items = ingredients.filter((i) => i.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{modeConfig.title}</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Step 1: Photo Capture */}
      {step === 'capture' && (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
          <Text style={styles.stepTitle}>{modeConfig.stepTitle}</Text>
          <Text style={styles.stepHint}>{modeConfig.stepHint}</Text>

          {/* Photo grid */}
          <View style={styles.photoGrid}>
            {photos.map((photo, i) => (
              <View key={i} style={styles.photoThumb}>
                <Image source={{ uri: photo.uri }} style={styles.photoThumbImg} contentFit="cover" />
                <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(i)}>
                  <Text style={styles.photoRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <View style={styles.photoActions}>
                <TouchableOpacity style={styles.photoAddBtn} onPress={() => takePhoto(true)} activeOpacity={0.75}>
                  <Text style={styles.photoAddIcon}>📷</Text>
                  <Text style={styles.photoAddLabel}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoAddBtn} onPress={() => takePhoto(false)} activeOpacity={0.75}>
                  <Text style={styles.photoAddIcon}>🖼</Text>
                  <Text style={styles.photoAddLabel}>Gallery</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {photos.length > 0 && (
            <TouchableOpacity style={styles.scanBtn} onPress={startScan} activeOpacity={0.8}>
              <Text style={styles.scanBtnText}>Identify Ingredients ({photos.length} photo{photos.length > 1 ? 's' : ''})</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* Step 2: Scanning */}
      {step === 'scanning' && (
        <View style={styles.scanningWrap}>
          <ActivityIndicator color={ORANGE} size="large" />
          <Text style={styles.scanningTitle}>{modeConfig.scanningText}</Text>
          <Text style={styles.scanningHint}>AI is reading and categorizing your items</Text>
        </View>
      )}

      {/* Step 3: Review */}
      {step === 'review' && (
        <>
          <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
            <Text style={styles.stepTitle}>Found {ingredients.length} ingredients</Text>
            <Text style={styles.stepHint}>Tap to remove incorrect items, add anything missed</Text>

            {/* Grouped ingredient chips */}
            {Object.entries(grouped).map(([cat, items]) => (
              <View key={cat} style={styles.catSection}>
                <Text style={styles.catLabel}>{CATEGORY_LABELS[cat as IngredientCategory]}</Text>
                <View style={styles.chipWrap}>
                  {items.map((ing) => (
                    <TouchableOpacity
                      key={ing.name}
                      style={[styles.chip, ing.confidence === 'low' && styles.chipLow]}
                      onPress={() => removeIngredient(ing.name)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.chipText}>{ing.name}</Text>
                      {ing.quantity !== 'some' && <Text style={styles.chipQty}>{ing.quantity}</Text>}
                      {ing.state !== 'raw' && <Text style={styles.chipState}>{ing.state}</Text>}
                      <Text style={styles.chipX}>✕</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}

            {/* Add ingredient */}
            <View style={styles.addSection}>
              <Text style={styles.catLabel}>+ Add Ingredient</Text>
              <View style={styles.addRow}>
                <TextInput
                  style={styles.addInput}
                  placeholder="e.g. avocado"
                  placeholderTextColor="rgba(255,255,255,0.30)"
                  value={addingName}
                  onChangeText={setAddingName}
                  onSubmitEditing={addIngredient}
                  returnKeyType="done"
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.addCatScroll}>
                  {CATEGORY_ORDER.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.addCatPill, addingCategory === cat && styles.addCatPillActive]}
                      onPress={() => setAddingCategory(cat)}
                    >
                      <Text style={[styles.addCatPillText, addingCategory === cat && styles.addCatPillTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity style={styles.addBtn} onPress={addIngredient} activeOpacity={0.75}>
                  <Text style={styles.addBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Pantry staples — only for fridge scan mode */}
            {scanMode === 'fridge' && (
            <View style={styles.pantrySection}>
              <Text style={styles.catLabel}>🏠 Also have at home?</Text>
              <Text style={styles.pantryHint}>Common items not usually in fridge photos</Text>
              <View style={styles.chipWrap}>
                {DEFAULT_PANTRY_STAPLES.map((item) => {
                  const checked = pantryChecked.has(item.name);
                  return (
                    <TouchableOpacity
                      key={item.name}
                      style={[styles.pantryChip, checked && styles.pantryChipChecked]}
                      onPress={() => togglePantry(item.name)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.pantryChipText, checked && styles.pantryChipTextChecked]}>
                        {checked ? '✓ ' : ''}{item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            )}
          </ScrollView>

          {/* Action footer */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity style={styles.findBtn} onPress={handleDone} activeOpacity={0.8}>
              <LinearGradient colors={['#F07030', '#C84A10']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.findBtnGradient}>
                <Text style={styles.findBtnText}>{modeConfig.doneBtn}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
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

  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  stepTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  stepHint: { fontSize: 13, color: 'rgba(255,255,255,0.50)', marginBottom: 20 },

  // Photo capture
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  photoThumb: {
    width: (Dimensions.get('window').width - 64) / 2,
    height: 120,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: SURFACE,
  },
  photoThumbImg: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  photoActions: { flexDirection: 'row', gap: 12 },
  photoAddBtn: {
    width: (Dimensions.get('window').width - 64) / 2,
    height: 120,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(232,93,38,0.30)',
    borderStyle: 'dashed',
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoAddIcon: { fontSize: 28 },
  photoAddLabel: { fontSize: 12, fontWeight: '700', color: ORANGE },

  scanBtn: {
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  scanBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  // Scanning
  scanningWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  scanningTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  scanningHint: { fontSize: 13, color: 'rgba(255,255,255,0.50)' },

  // Review
  catSection: { marginBottom: 20 },
  catLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  chipLow: { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.20)' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  chipQty: { fontSize: 11, color: 'rgba(255,255,255,0.40)' },
  chipState: { fontSize: 10, fontWeight: '700', color: ORANGE, textTransform: 'uppercase' },
  chipX: { fontSize: 11, color: 'rgba(255,255,255,0.30)', marginLeft: 2 },

  // Add ingredient
  addSection: { marginBottom: 20 },
  addRow: { gap: 8 },
  addInput: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  addCatScroll: { maxHeight: 36, marginVertical: 4 },
  addCatPill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  addCatPillActive: { backgroundColor: 'rgba(232,93,38,0.20)', borderWidth: 1, borderColor: ORANGE },
  addCatPillText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase' },
  addCatPillTextActive: { color: ORANGE },
  addBtn: {
    backgroundColor: 'rgba(232,93,38,0.20)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.40)',
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: ORANGE },

  // Pantry staples
  pantrySection: { marginBottom: 20 },
  pantryHint: { fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 10, marginTop: -6 },
  pantryChip: {
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pantryChipChecked: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.40)',
  },
  pantryChipText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.50)' },
  pantryChipTextChecked: { color: '#22C55E' },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  findBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  findBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 16,
  },
  findBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
