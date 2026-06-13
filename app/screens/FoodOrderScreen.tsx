import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
import * as Location from 'expo-location';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PremiumScreen } from '../../components/PremiumScreen';
import { HomeButton } from '../../components/HomeButton';
import { ProcessingRing } from '../../components/ProcessingRing';
import { addToMealPlan, type MealSlot } from '../../services/mealPlanService';
import { getFitnessProfile, calculateMacroTargets } from '../../services/fitnessProfileService';
import { getDietaryRestrictions } from '../../services/dietaryService';
import { generateFoodItemImage } from '../../services/imageGenerationService';
import { trackEvent } from '../../services/analyticsService';
import { logScreenView } from '../../services/firebaseAnalytics';
import { getDietPreference, hasNonVegText } from '../../src/utils/dietPreference';
import { invokeAnthropicMessages } from '../../services/anthropicService';
const MACRO_OVERRIDE_PREFIX = 'spicestrong_macro_override_';
const MIN_SPICESTRONG_PROTEIN_DENSITY = 6.4;

interface FoodOrderItem {
  id: string;
  name: string;
  description: string;
  reason: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

type FoodOrderIssue = {
  type: 'uncertain_match' | 'no_good_options';
  title: string;
  message: string;
};

const SLOT_META: Record<MealSlot, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  breakfast: { label: 'Breakfast', icon: 'sunny-outline' },
  lunch_dinner: { label: 'Lunch/Dinner', icon: 'restaurant-outline' },
  snack_dessert: { label: 'Snack', icon: 'sparkles-outline' },
  others: { label: 'Others', icon: 'grid-outline' },
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function extractFirstJsonValue(text: string): any {
  // Strip markdown code fences if present
  const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');

  const starts = [stripped.indexOf('{'), stripped.indexOf('[')]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);

  for (const start of starts) {
    const opener = stripped[start];
    const closer = opener === '{' ? '}' : ']';
    let depth = 0;
    for (let i = start; i < stripped.length; i++) {
      const ch = stripped[i];
      if (ch === opener) depth++;
      if (ch === closer) {
        depth--;
        if (depth === 0) {
          return JSON.parse(stripped.slice(start, i + 1));
        }
      }
    }
  }

  throw new Error('Could not parse menu response. Try again.');
}

function proteinDensity(item: Pick<FoodOrderItem, 'calories' | 'proteinG'>): number {
  return item.calories > 0 ? (item.proteinG / item.calories) * 100 : 0;
}

function isVegetarianSafeDish(item: Pick<FoodOrderItem, 'name' | 'description' | 'reason'>): boolean {
  return !hasNonVegText(`${item.name ?? ''} ${item.description ?? ''} ${item.reason ?? ''}`);
}

function looksVegetarianOnlyRestaurant(name: string): boolean {
  return /\b(mtr|saravana|udupi|sagar|annapurna|pure\s+veg|vegetarian|veg\b)/i.test(name);
}

export default function FoodOrderScreen() {
  const router = useRouter();
  useEffect(() => { logScreenView('FoodOrderScreen'); }, []);
  const insets = useSafeAreaInsets();

  const [restaurantName, setRestaurantName] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [currentLocation, setCurrentLocation] = useState('');
  const [currentLocationSearchContext, setCurrentLocationSearchContext] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [restaurantInfo, setRestaurantInfo] = useState('');
  const [menuPhotos, setMenuPhotos] = useState<{ uri: string; base64: string }[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<FoodOrderItem[] | null>(null);
  const [issue, setIssue] = useState<FoodOrderIssue | null>(null);
  const [heroImages, setHeroImages] = useState<Record<string, string>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const locationDisplay = currentLocation || manualLocation.trim();
  const locationSearchContext = currentLocationSearchContext || manualLocation.trim();
  const canSearch = restaurantName.trim().length > 1 && locationSearchContext.length > 1;

  const addMenuPhoto = () => {
    Alert.alert('Add Menu Photo', 'Choose source', [
      {
        text: 'Camera', onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) { Alert.alert('Permission needed', 'Camera access is required.'); return; }
          const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });
          if (!r.canceled && r.assets?.[0]) appendPhoto(r.assets[0].uri);
        },
      },
      {
        text: 'Gallery', onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) { Alert.alert('Permission needed', 'Gallery access is required.'); return; }
          const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });
          if (!r.canceled && r.assets?.[0]) appendPhoto(r.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const appendPhoto = async (uri: string) => {
    if (menuPhotos.length >= 3) return;
    try {
      const compressed = await manipulateAsync(uri, [{ resize: { width: 768 } }], { compress: 0.5, format: SaveFormat.JPEG, base64: true });
      let base64 = compressed.base64 ?? '';
      if (base64.includes(',')) base64 = base64.split(',')[1];
      if (!base64) return;
      setMenuPhotos((prev) => [...prev, { uri, base64 }]);
    } catch {}
  };

  const useCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setIssue({
          type: 'uncertain_match',
          title: 'Location needed',
          message: 'Location permission was not granted. Enter a city, neighborhood, country, or paste a Maps link so we can match the right restaurant.',
        });
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;
      let label = 'Current location';

      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
        label = place?.city || place?.district || place?.region || place?.country || label;
      } catch {}

      setCurrentLocation(label);
      setCurrentLocationSearchContext(`Search for restaurants within a 10 mile radius of latitude ${latitude.toFixed(5)}, longitude ${longitude.toFixed(5)}. User-facing city label: ${label}.`);
      setManualLocation('');
      setIssue(null);
    } catch (err: any) {
      setIssue({
        type: 'uncertain_match',
        title: 'Could not get current location',
        message: err?.message || 'Enter a city, neighborhood, country, or paste a Maps link so we can match the right restaurant.',
      });
    } finally {
      setLocationLoading(false);
    }
  };

  const findBestDishes = async () => {
    if (!canSearch) return;
    Keyboard.dismiss();
    setAnalyzing(true);
    setResults(null);
    setIssue(null);
    setHeroImages({});
    setSavedIds(new Set());
    setExpandedId(null);

    try {
      const [profile, dietary] = await Promise.all([
        getFitnessProfile().catch(() => null),
        getDietaryRestrictions().catch(() => ({ dietaryTags: [], allergenTags: [] })),
      ]);
      const dietPreference = await getDietPreference();
      const restaurantIsVegetarianOnly = looksVegetarianOnlyRestaurant(restaurantName);
      const macros = profile ? calculateMacroTargets(profile) : null;
      const goalDesc = profile
        ? `User fitness goal: ${profile.goal.replace(/_/g, ' ')}. Daily targets: ~${macros?.calories ?? 2000} cal, ~${macros?.proteinG ?? 150}g protein.`
        : 'User goal: general fitness and high protein intake.';

      const strictRestrictions = dietary.allergenTags.length > 0
        ? `STRICT dietary restrictions — ONLY recommend items that are safe for: ${dietary.allergenTags.join(', ')}. Do not suggest any item that violates these.`
        : '';
      const dietaryPrefs = dietary.dietaryTags.length > 0
        ? `Dietary preferences (factor into ranking): ${dietary.dietaryTags.join(', ')}.`
        : '';
      const defaultDietContext = dietPreference === 'veg'
        ? 'The user selected Vegetarian as their default dietary choice. Do not recommend meat, eggs, fish, prawns, shrimp, seafood, gelatin, or any other non-vegetarian dish.'
        : dietPreference === 'nonveg'
          ? 'The user selected Non-vegetarian as their default dietary choice. Vegetarian and non-vegetarian dishes are allowed, but do not invent non-vegetarian items at vegetarian-only restaurants.'
          : 'The user has not selected a default vegetarian/non-vegetarian dietary choice. Do not assume a preference.';
      const restaurantDietContext = restaurantIsVegetarianOnly
        ? `${restaurantName.trim()} appears to be a vegetarian-only restaurant. Recommend vegetarian dishes only. Do not recommend chicken, meat, fish, eggs, prawns, shrimp, or seafood.`
        : 'First verify the restaurant/menu context. If the restaurant is vegetarian-only or the attached menu only shows vegetarian dishes, recommend vegetarian dishes only.';
      const resolvedLocationContext = locationSearchContext;
      const extraRestaurantInfo = restaurantInfo.trim()
        ? `Additional restaurant info from user: ${restaurantInfo.trim()}`
        : 'No website, menu link, or extra restaurant info was provided.';

      const imageBlocks = menuPhotos.slice(0, 3).map((p) => ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: p.base64 },
      }));

      const data = await invokeAnthropicMessages({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: `You are a fitness nutrition expert for SpiceStrong, a high-protein cooking app.
The user is eating at a restaurant and needs the 5 best menu items for their fitness goals.
Use your knowledge of the restaurant's real menu, but do not invent dishes the restaurant is unlikely to sell.
${menuPhotos.length > 0 ? 'The user has attached menu photos — use them to refine your recommendations.' : ''}
${strictRestrictions}
${dietaryPrefs}
${defaultDietContext}
${restaurantDietContext}
${extraRestaurantInfo}

SpiceStrong minimum criteria:
- Only return dishes with proteinG / calories * 100 >= ${MIN_SPICESTRONG_PROTEIN_DENSITY}
- Estimate restaurant portions conservatively. Rice-heavy, dosa/idli/vada, sweets, fried snacks, and carb-forward dishes usually fail unless paired with enough protein.
- If fewer than 5 dishes pass, return only the dishes that pass.
- If no dishes pass, return [].

Restaurant match rules:
- If you cannot confidently identify the exact restaurant from name + location + any provided info, set "status" to "uncertain_match" and return no items.
- Treat GPS-derived locations as a nearby search area with an approximate 10 mile radius.
- Location may be GPS-derived, a neighborhood/city/country, or an international address. Do not assume this is in the United States.
- You do not have live Google Maps search. If the restaurant is not known from your data or the provided website/menu/details/photos, set "status" to "uncertain_match" and ask for a website, menu link, Google Maps/Yelp link, or menu photo.
- If the restaurant is identified but no dishes pass the SpiceStrong minimum, set "status" to "no_good_options" and return no items.
- If the restaurant is identified and qualifying dishes exist, set "status" to "matched".

IMPORTANT: Your entire response must be ONLY one raw JSON object. No explanation, no markdown, no code fences. Start with { and end with }.

{
  "status": "matched|uncertain_match|no_good_options",
  "restaurantConfidence": 0.0,
  "matchedRestaurantName": "Exact restaurant name, or empty string",
  "message": "Short user-facing explanation",
  "items": [
    {
      "name": "Exact menu item name",
      "description": "One sentence description of the dish",
      "reason": "One sentence why this fits their fitness goal",
      "calories": 650,
      "proteinG": 45,
      "carbsG": 55,
      "fatG": 18
    }
  ]
}

Rank by best protein-to-calorie ratio for their goal. Use real menu nutrition data when available. Never include an item below the SpiceStrong minimum protein density.`,
        messages: [{
          role: 'user',
          content: [
            ...imageBlocks,
            {
              type: 'text' as const,
              text: `Restaurant: ${restaurantName.trim()}
Location context: ${resolvedLocationContext}
${restaurantInfo.trim() ? `Website/menu/details: ${restaurantInfo.trim()}` : 'Website/menu/details: not provided'}
${goalDesc}
Find qualifying SpiceStrong menu options within about 10 miles of the location context when GPS coordinates are provided. If you cannot confidently match the restaurant, ask for a website, menu link, Google Maps/Yelp link, or menu photos through the JSON status/message.`,
            },
          ],
        }],
      });

      const text = data.content?.[0]?.text || '';
      const parsedResponse = extractFirstJsonValue(text);
      const parsedItems = Array.isArray(parsedResponse)
        ? parsedResponse
        : Array.isArray(parsedResponse?.items)
          ? parsedResponse.items
          : [];
      const status = Array.isArray(parsedResponse) ? 'matched' : String(parsedResponse?.status || 'matched');
      const confidence = Number(parsedResponse?.restaurantConfidence ?? 1);
      const responseMessage = String(parsedResponse?.message || '');

      if (status === 'uncertain_match' || confidence < 0.65) {
        setIssue({
          type: 'uncertain_match',
          title: 'Help us find the right restaurant',
          message: responseMessage || 'We could not confidently match this restaurant from the name and location. Add a website, menu link, Google Maps/Yelp link, or menu photos so we can make accurate recommendations.',
        });
        return;
      }

      const items: FoodOrderItem[] = parsedItems.map((item: any, i: number) => ({
        id: `fo_${Date.now()}_${i}`,
        name: String(item.name || ''),
        description: String(item.description || ''),
        reason: String(item.reason || ''),
        calories: Math.round(Number(item.calories) || 0),
        proteinG: Math.round(Number(item.proteinG) || 0),
        carbsG: Math.round(Number(item.carbsG) || 0),
        fatG: Math.round(Number(item.fatG) || 0),
      }))
        .filter((item) => {
          const passesDietChoice = dietPreference !== 'veg' || isVegetarianSafeDish(item);
          const passesRestaurantDiet = !restaurantIsVegetarianOnly || isVegetarianSafeDish(item);
          return passesDietChoice && passesRestaurantDiet && proteinDensity(item) >= MIN_SPICESTRONG_PROTEIN_DENSITY;
        })
        .sort((a, b) => proteinDensity(b) - proteinDensity(a))
        .slice(0, 5);

      if (items.length === 0) {
        setIssue({
          type: 'no_good_options',
          title: 'No strong SpiceStrong options found',
          message: responseMessage || `We do not have good high-protein options here. Nothing passed the ${MIN_SPICESTRONG_PROTEIN_DENSITY}g protein per 100 calorie minimum${dietPreference === 'veg' || restaurantIsVegetarianOnly ? ' with vegetarian-safe filtering applied' : ''}.`,
        });
        return;
      }

      setIssue(null);
      setResults(items);
      trackEvent('food_order', { screen: 'FoodOrderScreen', metadata: { restaurant: restaurantName.trim() } });
      generateHeroImages(items);
    } catch (err: any) {
      Alert.alert('Could not fetch menu', err?.message ?? 'Check the restaurant name and try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const generateHeroImages = (items: FoodOrderItem[]) => {
    items.forEach(async (item) => {
      try {
        const url = await generateFoodItemImage(item.name, item.description);
        if (url) setHeroImages((prev) => ({ ...prev, [item.id]: url }));
      } catch {}
    });
  };

  const saveItem = async (item: FoodOrderItem, slot: MealSlot) => {
    setSavingId(item.id);
    try {
      const result = await addToMealPlan(todayIso(), slot, {
        id: `food_order_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: item.name.trim() || 'Restaurant Dish',
        proteinName: 'Custom',
        proteinEmoji: '🍽️',
        mealType: slot,
      });

      if (!result.success) {
        Alert.alert('Slot Full', result.error ?? 'Could not add to tracker.');
        return;
      }

      if (result.entryId) {
        await AsyncStorage.setItem(`${MACRO_OVERRIDE_PREFIX}${result.entryId}`, JSON.stringify({
          calories: item.calories,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          description: item.description,
          components: [],
          photoUri: heroImages[item.id] ?? '',
          photoUris: [],
        }));
      }

      setSavedIds((prev) => new Set([...prev, item.id]));
      setExpandedId(null);
      trackEvent('meal_saved', { screen: 'FoodOrderScreen', metadata: { slot, restaurant: restaurantName.trim() } });
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Could not save this item.');
    } finally {
      setSavingId(null);
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
          <Text style={styles.headerTitle}>Food Order</Text>
        </View>
        <HomeButton />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 34 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Order smart 🍽️</Text>
          <Text style={styles.heroText}>Enter a restaurant and we'll find the top 5 dishes for your fitness goals — with real macros.</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.fieldLabel}>Restaurant name</Text>
          <TextInput
            style={styles.textInput}
            value={restaurantName}
            onChangeText={setRestaurantName}
            placeholder="e.g. Chipotle, Olive Garden, In-N-Out"
            placeholderTextColor="rgba(248,241,232,0.30)"
            returnKeyType="next"
          />

          <View>
            <Text style={styles.fieldLabel}>Location</Text>
            <TouchableOpacity
              style={[styles.locationBtn, currentLocation && styles.locationBtnActive]}
              onPress={useCurrentLocation}
              disabled={locationLoading}
              activeOpacity={0.84}
            >
              {locationLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="navigate-outline" size={16} color={currentLocation ? '#22C55E' : '#FFFFFF'} />
              )}
              <Text style={styles.locationBtnText}>
                {currentLocation || (locationLoading ? 'Finding your location...' : 'Use current location')}
              </Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.textInput, styles.manualLocationInput]}
              value={manualLocation}
              onChangeText={(value) => {
                setManualLocation(value);
                if (value.trim()) {
                  setCurrentLocation('');
                  setCurrentLocationSearchContext('');
                }
              }}
              placeholder="Or enter area, city, country, address, or Maps link"
              placeholderTextColor="rgba(248,241,232,0.30)"
              returnKeyType="next"
            />
          </View>

          <View style={styles.photoSection}>
            <Text style={styles.fieldLabel}>
              Menu photos <Text style={styles.optionalLabel}>(optional · up to 3)</Text>
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoScroll}>
              {menuPhotos.map((p, i) => (
                <View key={i} style={styles.photoThumbWrap}>
                  <Image source={{ uri: p.uri }} style={styles.photoThumb} contentFit="cover" />
                  <TouchableOpacity style={styles.removePhotoBtn} onPress={() => setMenuPhotos((prev) => prev.filter((_, j) => j !== i))}>
                    <Ionicons name="close-circle" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
              {menuPhotos.length < 3 && (
                <TouchableOpacity style={styles.addPhotoBtn} onPress={addMenuPhoto} activeOpacity={0.8}>
                  <Ionicons name="camera-outline" size={22} color="rgba(248,241,232,0.5)" />
                  <Text style={styles.addPhotoLabel}>Add</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>

          <View>
            <Text style={styles.fieldLabel}>Website or menu details <Text style={styles.optionalLabel}>(optional)</Text></Text>
            <TextInput
              style={[styles.textInput, styles.detailsInput]}
              value={restaurantInfo}
              onChangeText={setRestaurantInfo}
              placeholder="Paste a website, menu link, Google Maps/Yelp link, or notes"
              placeholderTextColor="rgba(248,241,232,0.30)"
              multiline
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[styles.searchBtn, (!canSearch || analyzing) && styles.searchBtnDisabled]}
            onPress={findBestDishes}
            disabled={!canSearch || analyzing}
            activeOpacity={0.86}
          >
            <Ionicons name="restaurant-outline" size={20} color={canSearch ? '#0F0D0B' : 'rgba(248,241,232,0.35)'} />
            <Text style={[styles.searchBtnText, (!canSearch || analyzing) && styles.searchBtnTextDisabled]}>
              Find Best Dishes
            </Text>
          </TouchableOpacity>
        </View>

        {analyzing && (
          <View style={styles.loadingCard}>
            <ProcessingRing
              label={`Finding best dishes at ${restaurantName}…`}
              sublabel="Personalizing for your fitness goals"
              expectedMs={10000}
            />
          </View>
        )}

        {issue && !analyzing && (
          <View style={[styles.issueCard, issue.type === 'no_good_options' && styles.noOptionsCard]}>
            <Ionicons
              name={issue.type === 'uncertain_match' ? 'search-outline' : 'alert-circle-outline'}
              size={22}
              color={issue.type === 'uncertain_match' ? '#E8A87C' : '#F59E0B'}
            />
            <View style={styles.issueTextWrap}>
              <Text style={styles.issueTitle}>{issue.title}</Text>
              <Text style={styles.issueMessage}>{issue.message}</Text>
              {issue.type === 'uncertain_match' && (
                <View style={styles.issueActions}>
                  <TouchableOpacity style={styles.issueActionBtn} onPress={addMenuPhoto} activeOpacity={0.82}>
                    <Ionicons name="camera-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.issueActionText}>Add menu photo</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}

        {results && !analyzing && (
          <View style={styles.resultsSection}>
            <Text style={styles.resultsTitle}>{results.length >= 5 ? 'Top 5 for your goals' : 'Best options found'}</Text>
            <Text style={styles.resultsSubtitle}>{restaurantName} · {locationDisplay}</Text>

            <View style={styles.disclaimerCard}>
              <Ionicons name="information-circle-outline" size={16} color="#E8A87C" />
              <Text style={styles.disclaimerText}>
                Macros are estimates. Always check with the restaurant for allergens, preparation methods, and ingredient changes.
              </Text>
            </View>

            {results.map((item, index) => {
              const isSaved = savedIds.has(item.id);
              const isExpanded = expandedId === item.id;
              const heroUri = heroImages[item.id];
              const isSaving = savingId === item.id;

              return (
                <View key={item.id} style={styles.itemCard}>
                  <View style={styles.heroImgWrap}>
                    {heroUri ? (
                      <Image source={{ uri: heroUri }} style={styles.heroImg} contentFit="cover" />
                    ) : (
                      <View style={styles.heroImgPlaceholder}>
                        <ActivityIndicator color="rgba(248,241,232,0.25)" size="small" />
                        <Text style={styles.imgLoadingText}>Generating image…</Text>
                      </View>
                    )}
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>#{index + 1}</Text>
                    </View>
                    {isSaved && (
                      <View style={styles.savedOverlay}>
                        <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                        <Text style={styles.savedOverlayText}>Saved to tracker</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.itemBody}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>

                    <View style={styles.reasonRow}>
                      <Ionicons name="fitness-outline" size={13} color="#E8A87C" />
                      <Text style={styles.reasonText} numberOfLines={2}>{item.reason}</Text>
                    </View>

                    <View style={styles.macroRow}>
                      <MacroPill icon="flame" value={item.calories} unit="cal" color="#E85D26" />
                      <MacroPill icon="barbell-outline" value={item.proteinG} unit="P" color="#EF6A6A" />
                      <MacroPill icon="leaf-outline" value={item.carbsG} unit="C" color="#E8A87C" />
                      <MacroPill icon="water-outline" value={item.fatG} unit="F" color="#60A5FA" />
                    </View>

                    {!isSaved && !isExpanded && (
                      <TouchableOpacity style={styles.addBtn} onPress={() => setExpandedId(item.id)} activeOpacity={0.82}>
                        <Ionicons name="add-circle-outline" size={17} color="#FFFFFF" />
                        <Text style={styles.addBtnText}>Add to Daily Tracker</Text>
                      </TouchableOpacity>
                    )}

                    {!isSaved && isExpanded && (
                      <View style={styles.slotPicker}>
                        <Text style={styles.slotPickerLabel}>Save to which meal?</Text>
                        <View style={styles.slotGrid}>
                          {(Object.keys(SLOT_META) as MealSlot[]).map((slot) => (
                            <TouchableOpacity
                              key={slot}
                              style={styles.slotBtn}
                              onPress={() => saveItem(item, slot)}
                              disabled={isSaving}
                              activeOpacity={0.82}
                            >
                              {isSaving ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <>
                                  <Ionicons name={SLOT_META[slot].icon} size={14} color="rgba(248,241,232,0.75)" />
                                  <Text style={styles.slotBtnText}>{SLOT_META[slot].label}</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>
                        <TouchableOpacity onPress={() => setExpandedId(null)} activeOpacity={0.7} style={styles.cancelBtn}>
                          <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {isSaved && (
                      <View style={styles.savedRow}>
                        <Ionicons name="checkmark-circle" size={15} color="#22C55E" />
                        <Text style={styles.savedRowText}>Added to your daily tracker</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </PremiumScreen>
  );
}

function MacroPill({
  icon, value, unit, color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <View style={styles.macroPill}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={styles.macroPillValue}>{value}</Text>
      <Text style={styles.macroPillUnit}>{unit}</Text>
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
  hero: {
    borderRadius: 28,
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
    padding: 18,
    marginBottom: 16,
  },
  heroTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', lineHeight: 32 },
  heroText: { color: 'rgba(248,241,232,0.58)', fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 6 },
  formCard: {
    borderRadius: 24,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  fieldLabel: { color: 'rgba(248,241,232,0.56)', fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  textInput: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(13,11,9,0.40)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  detailsInput: {
    minHeight: 82,
    paddingTop: 12,
    lineHeight: 20,
  },
  locationBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(143,58,31,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.24)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  locationBtnActive: {
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderColor: 'rgba(34,197,94,0.26)',
  },
  locationBtnText: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '800', lineHeight: 18 },
  manualLocationInput: { minHeight: 46 },
  photoSection: { gap: 0 },
  optionalLabel: { color: 'rgba(248,241,232,0.35)', fontWeight: '700', textTransform: 'none', letterSpacing: 0 },
  photoScroll: { gap: 10, paddingBottom: 4 },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 72, height: 72, borderRadius: 16, backgroundColor: 'rgba(248,241,232,0.08)' },
  removePhotoBtn: { position: 'absolute', top: -6, right: -6 },
  addPhotoBtn: {
    width: 72,
    height: 72,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(248,241,232,0.18)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(13,11,9,0.28)',
  },
  addPhotoLabel: { color: 'rgba(248,241,232,0.45)', fontSize: 11, fontWeight: '800' },
  searchBtn: {
    minHeight: 56,
    borderRadius: 22,
    backgroundColor: '#F8F1E8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
  },
  searchBtnDisabled: { backgroundColor: 'rgba(248,241,232,0.10)', borderWidth: 1, borderColor: 'rgba(248,241,232,0.12)' },
  searchBtnText: { color: '#0F0D0B', fontSize: 16, fontWeight: '900' },
  searchBtnTextDisabled: { color: 'rgba(248,241,232,0.35)' },
  loadingCard: {
    minHeight: 160,
    borderRadius: 24,
    backgroundColor: 'rgba(13,11,9,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    marginBottom: 16,
  },
  issueCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(232,168,124,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.24)',
    padding: 14,
    marginBottom: 16,
  },
  noOptionsCard: {
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderColor: 'rgba(245,158,11,0.24)',
  },
  issueTextWrap: { flex: 1 },
  issueTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', marginBottom: 5 },
  issueMessage: { color: 'rgba(248,241,232,0.64)', fontSize: 12, fontWeight: '600', lineHeight: 18 },
  issueActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  issueActionBtn: {
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(143,58,31,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.28)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  issueActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  resultsSection: { gap: 0 },
  resultsTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginBottom: 4 },
  resultsSubtitle: { color: 'rgba(248,241,232,0.46)', fontSize: 12, fontWeight: '700', marginBottom: 10 },
  disclaimerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(232,168,124,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.22)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  disclaimerText: { flex: 1, color: 'rgba(248,241,232,0.60)', fontSize: 12, fontWeight: '600', lineHeight: 17 },
  itemCard: {
    borderRadius: 24,
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.13)',
    overflow: 'hidden',
    marginBottom: 14,
  },
  heroImgWrap: { width: '100%', height: 190, position: 'relative' },
  heroImg: { width: '100%', height: '100%' },
  heroImgPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(13,11,9,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imgLoadingText: { color: 'rgba(248,241,232,0.35)', fontSize: 11, fontWeight: '700' },
  rankBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(13,11,9,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  rankText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  savedOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(13,11,9,0.72)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.45)',
  },
  savedOverlayText: { color: '#22C55E', fontSize: 12, fontWeight: '900' },
  itemBody: { padding: 16, gap: 10 },
  itemName: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', lineHeight: 25 },
  itemDesc: { color: 'rgba(248,241,232,0.60)', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  reasonText: { flex: 1, color: '#E8A87C', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  macroRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  macroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(13,11,9,0.40)',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
  },
  macroPillValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  macroPillUnit: { color: 'rgba(248,241,232,0.50)', fontSize: 11, fontWeight: '700' },
  addBtn: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: '#8F3A1F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  slotPicker: { gap: 10 },
  slotPickerLabel: { color: 'rgba(248,241,232,0.55)', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(143,58,31,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.38)',
  },
  slotBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  cancelBtn: { alignItems: 'center', paddingVertical: 4 },
  cancelText: { color: 'rgba(248,241,232,0.38)', fontSize: 12, fontWeight: '700' },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  savedRowText: { color: '#22C55E', fontSize: 13, fontWeight: '800' },
});
