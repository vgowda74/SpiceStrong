import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProcessingRing } from '../../components/ProcessingRing';
import {
  Animated,
  ImageBackground,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView as RNScrollView,
  SectionList,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { getIngredientImage } from '../../src/data/ingredientImages';
import {
  getRecipeById,
  SavedRecipe,
  QUANTITY_TIERS,
  BUILTIN_INGREDIENT_GROUPS,
  isDessertRecipe,
  type QuantityTier,
  type IngredientGroup,
} from '../../src/store/recipes';
import { loadRecipeImages, type RecipeImageResults } from '../../services/imageGenerationService';
import { buildSmartShoppingList, groupByCategory, buildSmartShareMessage, openAmazonFresh } from '../../src/utils/shoppingListHelper';
import { CATEGORY_EMOJI } from '../../src/data/ingredientMapping';
import { getIngredientInfo } from '../../services/ingredientInfoService';
const ORANGE = '#8F3A1F';
const ORANGE_LIGHT = 'rgba(143, 58, 31, 0.35)';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BG_CHECKED = 'rgba(143, 58, 31, 0.12)';
const BORDER_COLOR = 'rgba(255,255,255,0.08)';

/** Map ingredient names to emojis for visual display. */
const INGREDIENT_EMOJI_MAP: [RegExp, string][] = [
  // Proteins
  [/chicken/i, '🍗'],
  [/lamb|mutton/i, '🥩'],
  [/goat/i, '🥩'],
  [/pork/i, '🥓'],
  [/fish|salmon|tuna|cod/i, '🐟'],
  [/prawn|shrimp/i, '🦐'],
  [/paneer/i, '🧀'],
  [/tofu/i, '🫘'],
  [/egg/i, '🥚'],
  // Dairy
  [/yogurt|curd|dahi/i, '🥛'],
  [/cream/i, '🥛'],
  [/butter/i, '🧈'],
  [/ghee/i, '🧈'],
  [/milk/i, '🥛'],
  [/cheese/i, '🧀'],
  // Vegetables
  [/onion/i, '🧅'],
  [/garlic/i, '🧄'],
  [/ginger/i, '🫚'],
  [/tomato/i, '🍅'],
  [/potato/i, '🥔'],
  [/carrot/i, '🥕'],
  [/bell pepper|capsicum/i, '🫑'],
  [/green chilli|green pepper/i, '🌶️'],
  [/spinach|palak/i, '🥬'],
  [/cauliflower/i, '🥦'],
  [/broccoli/i, '🥦'],
  [/mushroom/i, '🍄'],
  [/corn/i, '🌽'],
  [/pea/i, '🟢'],
  [/lettuce|salad/i, '🥗'],
  [/cucumber/i, '🥒'],
  [/avocado/i, '🥑'],
  // Fruits
  [/lemon|lime/i, '🍋'],
  [/mango/i, '🥭'],
  [/coconut/i, '🥥'],
  [/banana/i, '🍌'],
  [/apple/i, '🍎'],
  [/orange/i, '🍊'],
  [/berry|strawberry|blueberry/i, '🫐'],
  [/pineapple/i, '🍍'],
  [/tamarind/i, '🫙'],
  // Spices & seasonings
  [/pepper\b|peppercorn/i, '🫚'],
  [/cumin/i, '🫙'],
  [/turmeric|haldi/i, '🟡'],
  [/chilli|chili|red chili/i, '🌶️'],
  [/cinnamon|dalchini/i, '🫙'],
  [/cardamom|elaichi/i, '🫙'],
  [/clove|laung/i, '🫙'],
  [/mustard seed/i, '🫙'],
  [/fenugreek|methi/i, '🌿'],
  [/fennel|saunf/i, '🫙'],
  [/bay leaf|tej patta/i, '🍃'],
  [/curry leaves/i, '🍃'],
  [/coriander powder|dhania/i, '🫙'],
  [/garam masala/i, '🫙'],
  [/masala/i, '🫙'],
  [/paprika/i, '🌶️'],
  [/saffron|kesar/i, '🧡'],
  [/salt/i, '🧂'],
  // Grains & flour
  [/rice|basmati/i, '🍚'],
  [/flour|atta|maida/i, '🌾'],
  [/bread|naan|roti/i, '🫓'],
  [/pasta|noodle/i, '🍝'],
  [/oat/i, '🥣'],
  // Oils & fats
  [/oil|olive oil|coconut oil/i, '🫒'],
  // Nuts & seeds
  [/cashew|kaju/i, '🥜'],
  [/almond|badam/i, '🥜'],
  [/peanut/i, '🥜'],
  [/walnut/i, '🥜'],
  [/sesame|til/i, '🫘'],
  // Sweeteners
  [/sugar|jaggery/i, '🍬'],
  [/honey/i, '🍯'],
  // Herbs
  [/coriander|cilantro/i, '🌿'],
  [/mint|pudina/i, '🌿'],
  [/basil/i, '🌿'],
  [/parsley/i, '🌿'],
  // Liquids
  [/water/i, '💧'],
  [/broth|stock/i, '🍲'],
  [/vinegar/i, '🫗'],
  [/soy sauce/i, '🫗'],
  // Chocolate & baking
  [/chocolate|cocoa/i, '🍫'],
  [/vanilla/i, '🧁'],
  // Other
  [/whey|protein powder/i, '🏋️'],
];

function getIngredientEmoji(name: string): string {
  for (const [pattern, emoji] of INGREDIENT_EMOJI_MAP) {
    if (pattern.test(name)) return emoji;
  }
  return '🥘'; // default
}

/** Categorize ingredients for display tags */
const INGREDIENT_CATEGORIES: [RegExp, { label: string; color: string }][] = [
  [/chicken|lamb|mutton|goat|pork|fish|salmon|tuna|cod|prawn|shrimp|beef|turkey/i, { label: 'PROTEIN', color: '#8F3A1F' }],
  [/paneer|tofu|egg|whey|protein powder/i, { label: 'PROTEIN', color: '#8F3A1F' }],
  [/yogurt|curd|cream|butter|ghee|milk|cheese/i, { label: 'DAIRY', color: '#FFA726' }],
  [/oil|olive oil|coconut oil/i, { label: 'OIL', color: '#8D6E63' }],
  [/salt/i, { label: 'ESSENTIAL', color: '#78909C' }],
  [/cumin|turmeric|haldi|cinnamon|cardamom|clove|mustard seed|fenugreek|fennel|bay leaf|coriander powder|garam masala|masala|paprika|saffron|pepper\b|peppercorn/i, { label: 'SPICE', color: '#EF5350' }],
  [/chilli|chili|red chili|green chilli|kashmiri/i, { label: 'SPICE', color: '#EF5350' }],
  [/curry leaves/i, { label: 'HERB', color: '#66BB6A' }],
  [/coriander|cilantro|mint|pudina|basil|parsley/i, { label: 'HERB', color: '#66BB6A' }],
  [/onion|garlic|ginger|tomato|potato|carrot|bell pepper|capsicum|spinach|cauliflower|broccoli|mushroom|corn|pea|lettuce|cucumber|avocado/i, { label: 'VEGETABLE', color: '#66BB6A' }],
  [/lemon|lime|mango|coconut|banana|tamarind/i, { label: 'FRUIT', color: '#FFCA28' }],
  [/rice|basmati|flour|bread|naan|roti|pasta|noodle|oat/i, { label: 'GRAIN', color: '#D4A056' }],
  [/cashew|almond|peanut|walnut|sesame/i, { label: 'NUT', color: '#A1887F' }],
  [/sugar|jaggery|honey/i, { label: 'SWEETENER', color: '#CE93D8' }],
  [/water|broth|stock|vinegar|soy sauce/i, { label: 'LIQUID', color: '#4FC3F7' }],
];

function getIngredientCategory(name: string): { label: string; color: string } | null {
  for (const [pattern, cat] of INGREDIENT_CATEGORIES) {
    if (pattern.test(name)) return cat;
  }
  return null;
}

export default function IngredientChecklistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ recipeId: string; quantityTier?: string; mealPlanServings?: string }>();
  const recipeId = typeof params.recipeId === 'string' ? params.recipeId : Array.isArray(params.recipeId) ? params.recipeId[0] : undefined;
  const quantityTierParam = typeof params.quantityTier === 'string' ? params.quantityTier : Array.isArray(params.quantityTier) ? params.quantityTier[0] : undefined;
  const initialTier = (quantityTierParam && (QUANTITY_TIERS as readonly string[]).includes(quantityTierParam)) ? quantityTierParam as QuantityTier : '2-3 servings';
  // Meal plan specific serving count — when set, locks the tier and scales ingredients
  const mealPlanServings = params.mealPlanServings ? parseInt(String(params.mealPlanServings), 10) : null;

  // AI-generated ingredient images (loaded from AsyncStorage)
  const [aiImages, setAiImages] = useState<RecipeImageResults | null>(null);

  const [recipe, setRecipe] = useState<SavedRecipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<QuantityTier>(initialTier);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Global shopping list state — value is recipe name for grouping
  const GLOBAL_CART_KEY = 'globalShoppingList';
  const [cartItems, setCartItems] = useState<Record<string, string>>({});
  const [showCartSheet, setShowCartSheet] = useState(false);
  const [sheetTab, setSheetTab] = useState<'recipe' | 'smart'>('smart');
  const [showPantry, setShowPantry] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [infoText, setInfoText] = useState('');
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoItemName, setInfoItemName] = useState('');
  const cartSheetAnim = useRef(new Animated.Value(0)).current;
  const cartBounce = useRef(new Animated.Value(1)).current;

  // Load global shopping list from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(GLOBAL_CART_KEY).then((stored) => {
      if (stored) setCartItems(JSON.parse(stored));
    });
  }, []);

  // Save global shopping list to AsyncStorage
  const saveCart = useCallback((items: Record<string, string>) => {
    AsyncStorage.setItem(GLOBAL_CART_KEY, JSON.stringify(items));
  }, []);

  const toggleCartItem = (key: string) => {
    setCartItems((prev) => {
      const updated = { ...prev };
      if (updated[key]) {
        delete updated[key];
      } else {
        updated[key] = recipe?.name ?? 'Recipe';
      }
      saveCart(updated);
      // Bounce the header cart icon
      Animated.sequence([
        Animated.timing(cartBounce, { toValue: 1.3, duration: 100, useNativeDriver: true }),
        Animated.timing(cartBounce, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]).start();
      return updated;
    });
  };

  const handleIngredientInfo = async (name: string) => {
    setInfoItemName(name);
    setInfoVisible(true);
    setInfoLoading(true);
    setInfoText('');
    try {
      const text = await getIngredientInfo(name);
      setInfoText(text);
    } catch {
      setInfoText('Could not load info. Please try again.');
    } finally {
      setInfoLoading(false);
    }
  };

  const clearCart = () => {
    setCartItems({});
    AsyncStorage.removeItem(GLOBAL_CART_KEY);
    closeCartSheet();
  };

  const openCartSheet = () => {
    setShowCartSheet(true);
    Animated.timing(cartSheetAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  };

  const closeCartSheet = () => {
    Animated.timing(cartSheetAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setShowCartSheet(false);
    });
  };

  const cartCount = Object.keys(cartItems).length;

  useEffect(() => {
    setSelectedTier(initialTier);
  }, [initialTier]);

  useEffect(() => {
    if (!recipeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getRecipeById(recipeId)
      .then((found) => setRecipe(found ?? null))
      .catch(() => setRecipe(null))
      .finally(() => setLoading(false));
  }, [recipeId]);

  useEffect(() => {
    if (!recipeId) return;
    loadRecipeImages(recipeId).then(setAiImages);
  }, [recipeId]);

  const aiIngredientImages = aiImages?.ingredientImages ?? {};

  const handleStartCooking = () => {
    if (!recipe) return;
    const navParams: Record<string, string> = { recipeId: recipe.id };
    if (effectiveTier) navParams.quantityTier = effectiveTier;
    router.replace({
      pathname: '/screens/CookingModeScreen',
      params: navParams,
    });
  };

  const overlay = (
    <View style={{
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(13,11,9,0.76)',
    }} />
  );

  if (loading) {
    return (
      <ImageBackground
        source={require('../../assets/images/splash-bg.jpg')}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        {overlay}
        <View style={[styles.container, styles.loadingContainer]}>
          <Text style={styles.loadingText}>Loading recipe...</Text>
        </View>
      </ImageBackground>
    );
  }

  if (!recipeId || !recipe) {
    return (
      <ImageBackground
        source={require('../../assets/images/splash-bg.jpg')}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        {overlay}
        <View style={[styles.container, { paddingTop: 60 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.errorTitle}>Recipe not found</Text>
          <Text style={styles.errorSubtitle}>
            This recipe may have been deleted or the link is invalid.
          </Text>
        </View>
      </ImageBackground>
    );
  }

  // Check if this is a dessert/snack recipe (single-serving mode)
  const recipeMealType = (recipe as SavedRecipe & { mealType?: string }).mealType;
  const isSingleServing = isDessertRecipe(recipeMealType);

  const ingredientsByTier = recipe.ingredients;
  const tierHasIngredients = (tier: QuantityTier) =>
    (ingredientsByTier[tier]?.filter((i) => i.name.trim()).length ?? 0) > 0;
  const availableTiers = QUANTITY_TIERS.filter(tierHasIngredients);
  const effectiveTier = mealPlanServings
    ? (mealPlanServings <= 3 ? '2-3 servings' : '4-6 servings') as QuantityTier
    : (availableTiers.includes(selectedTier) ? selectedTier : availableTiers[0] ?? '2-3 servings');

  // Scale ingredient quantities for meal plan servings
  const scaleQuantity = (qty: string, fromServings: number, toServings: number): string => {
    if (fromServings === toServings) return qty;
    const ratio = toServings / fromServings;
    const numMatch = qty.match(/^([\d.\/]+)\s*(.*)/);
    if (numMatch) {
      const rawNum = numMatch[1].includes('/')
        ? numMatch[1].split('/').reduce((a, b) => parseFloat(a as any) / parseFloat(b), 0 as any)
        : parseFloat(numMatch[1]);
      const scaled = Math.round(rawNum * ratio * 10) / 10;
      return `${scaled} ${numMatch[2]}`.trim();
    }
    return qty;
  };
  const baseServings = effectiveTier === '2-3 servings' ? 2.5 : 5;
  const targetServings = mealPlanServings ?? baseServings;

  // Check for grouped ingredient data (built-in recipes) — now tier-aware
  const recipeGroups = recipeId ? BUILTIN_INGREDIENT_GROUPS[recipeId] : undefined;
  const ingredientGroups: IngredientGroup[] | undefined = recipeGroups
    ? (recipeGroups as Record<string, IngredientGroup[]>)[effectiveTier] ?? Object.values(recipeGroups as Record<string, IngredientGroup[]>)[0]
    : undefined;
  const hasGroups = !!ingredientGroups && ingredientGroups.length > 0;

  // Flat ingredients for progress tracking
  const flatIngredients = hasGroups
    ? ingredientGroups!.flatMap((g) => g.items)
    : ingredientsByTier[effectiveTier]?.filter((i) => i.name.trim()) ?? [];

  const totalCount = flatIngredients.length;
  const checkedCount = flatIngredients.reduce(
    (acc, _, i) => acc + (checked[`${effectiveTier}-${i}`] ? 1 : 0),
    0
  );
  const allChecked = totalCount > 0 && checkedCount === totalCount;
  const progressPct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const toggleChecked = (flatIndex: number) => {
    const key = `${effectiveTier}-${flatIndex}`;
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSection = (sectionData: { flatIndex: number }[]) => {
    const allSectionChecked = sectionData.every((item) => checked[`${effectiveTier}-${item.flatIndex}`]);
    setChecked((prev) => {
      const updated = { ...prev };
      sectionData.forEach((item) => {
        updated[`${effectiveTier}-${item.flatIndex}`] = !allSectionChecked;
      });
      return updated;
    });
  };

  // Build sections for SectionList
  const sections = hasGroups
    ? ingredientGroups!.map((group, gIdx) => {
        let start = 0;
        for (let i = 0; i < gIdx; i++) start += ingredientGroups![i].items.length;
        return {
          key: group.category,
          emoji: group.emoji,
          category: group.category,
          data: group.items.map((item, itemIdx) => ({ ...item, flatIndex: start + itemIdx })),
        };
      })
    : [{
        key: 'all',
        emoji: '🧂',
        category: 'INGREDIENTS',
        data: flatIngredients.map((item, i) => ({ ...item, flatIndex: i })),
      }];

  const renderIngredientRow = ({ item }: { item: { name: string; quantity: string; flatIndex: number } }) => {
    const isChecked = !!checked[`${effectiveTier}-${item.flatIndex}`];
    const emoji = getIngredientEmoji(item.name);
    const ingredientImg = getIngredientImage(item.name);
    const aiImgUrl = aiIngredientImages[item.name] ?? null;
    const category = getIngredientCategory(item.name);
    const cartKey = `${item.name}|||${item.quantity}`;
    const inCart = !!cartItems[cartKey];
    return (
      <View
        style={[styles.ingredientCard, isChecked && styles.ingredientCardChecked]}
      >
        {/* Radio button on the left */}
        <TouchableOpacity style={[styles.radioBtn, isChecked && styles.radioBtnChecked]} onPress={() => toggleChecked(item.flatIndex)} activeOpacity={0.7}>
          {isChecked ? <View style={styles.radioBtnInner} /> : null}
        </TouchableOpacity>
        {/* Ingredient image: AI image > static image > emoji fallback */}
        <TouchableOpacity style={[styles.ingredientIcon, isChecked && styles.ingredientIconChecked]} onPress={() => handleIngredientInfo(item.name)} activeOpacity={0.7}>
          {aiImgUrl ? (
            <Image source={{ uri: aiImgUrl }} style={styles.ingredientIconImage} />
          ) : ingredientImg ? (
            <Image source={ingredientImg} style={styles.ingredientIconImage} />
          ) : (
            <Text style={styles.ingredientIconEmoji}>{emoji}</Text>
          )}
        </TouchableOpacity>
        {/* Name, quantity & category tag */}
        <TouchableOpacity style={styles.ingredientInfo} onPress={() => handleIngredientInfo(item.name)} activeOpacity={0.7}>
          <Text style={[styles.ingredientName, isChecked && styles.ingredientNameChecked]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.ingredientSubtitle, isChecked && styles.ingredientSubtitleChecked]} numberOfLines={1}>
            {mealPlanServings ? scaleQuantity(item.quantity, baseServings, targetServings) : item.quantity}
          </Text>
          {category && (
            <View style={[styles.categoryTag, { backgroundColor: category.color + '20' }]}>
              <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
              <Text style={[styles.categoryText, { color: category.color }]}>{category.label}</Text>
            </View>
          )}
        </TouchableOpacity>
        {/* Cart button */}
        <TouchableOpacity
          style={[styles.cartIconBtn, inCart && styles.cartIconBtnActive]}
          onPress={(e) => {
            e.stopPropagation?.();
            toggleCartItem(cartKey);
          }}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          {inCart ? (
            <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
          ) : (
            <Ionicons name="cart" size={20} color="#FFFFFF" />
          )}
          <Text style={[styles.cartIconLabel, inCart && styles.cartIconLabelActive]}>{inCart ? 'Added' : 'Add'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderHeader = () => (
    <>
      {/* Recipe name — indented to clear back arrow */}
      <View style={styles.nameSection}>
        <Text style={styles.recipeName}>{recipe.name}</Text>
        <Text style={styles.recipeSubtitle}>
          {mealPlanServings ? `${mealPlanServings} serving${mealPlanServings > 1 ? 's' : ''} (Meal Plan)` : isSingleServing ? '1 Serving' : effectiveTier} • {totalCount} ingredients
        </Text>
      </View>

      {/* Controls section — full width */}
      <View style={styles.controlsSection}>
        {/* Serving selector */}
        {isSingleServing ? (
          <View style={styles.singleServingNote}>
            <Text style={styles.singleServingIcon}>🍰</Text>
            <Text style={styles.singleServingText}>Recipe for 1 serving. Multiply as needed.</Text>
          </View>
        ) : (
          <>
            <View style={styles.tierSelector}>
              {QUANTITY_TIERS.map((tier) => {
                const isSelected = effectiveTier === tier;
                return (
                  <TouchableOpacity
                    key={tier}
                    style={[styles.tierOption, isSelected && styles.tierOptionSelected]}
                    onPress={() => setSelectedTier(tier)}
                  >
                    <Text style={[styles.tierOptionText, isSelected && styles.tierOptionTextSelected]}>
                      {tier === '2-3 servings' ? '👥 2-3 Servings' : '👥 4-6 Servings'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Progress */}
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>{checkedCount} of {totalCount} gathered</Text>
          <Text style={styles.progressPct}>{progressPct}% Complete</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
        </View>
      </View>
    </>
  );

  return (
    <ImageBackground
      source={require('../../assets/images/splash-bg.jpg')}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      {overlay}
      <View style={styles.wrapper}>
        {/* Fixed back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        {/* Fixed home button */}
        <TouchableOpacity style={styles.homeBtn} onPress={() => router.push('/screens/ProteinSelectionScreen')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} activeOpacity={0.75}>
          <Text style={{ fontSize: 22, color: '#FFFFFF' }}>🏠</Text>
        </TouchableOpacity>

        {/* Ingredient list */}
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.flatIndex}`}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderHeader}
          renderSectionHeader={({ section }) => {
            const allSectionChecked = section.data.length > 0 && section.data.every((item: { flatIndex: number }) => checked[`${effectiveTier}-${item.flatIndex}`]);
            return (
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSection(section.data)}
                activeOpacity={0.7}
              >
                <Text style={styles.sectionEmoji}>{section.emoji}</Text>
                <Text style={styles.sectionTitle}>{section.category}</Text>
                <View style={styles.sectionLine} />
                <Text style={styles.selectAllText}>Select All</Text>
                <View style={[styles.sectionCheckbox, allSectionChecked && styles.sectionCheckboxChecked]}>
                  {allSectionChecked ? <Text style={styles.sectionCheckmark}>✓</Text> : null}
                </View>
              </TouchableOpacity>
            );
          }}
          renderItem={renderIngredientRow}
        />

        {/* Footer */}
        <View style={styles.footer}>
          {!allChecked && (
            <View style={styles.footerRow}>
              <View style={styles.footerLeft}>
                <Text style={styles.footerIcon}>🧂</Text>
                <View>
                  <Text style={styles.footerRemaining}>{totalCount - checkedCount} ingredients remaining</Text>
                  <Text style={styles.footerHint}>Tap to add to shopping cart</Text>
                </View>
              </View>
              {cartCount > 0 && (
                <TouchableOpacity style={styles.viewCartBtn} onPress={openCartSheet} activeOpacity={0.8}>
                  <Ionicons name="cart" size={18} color="#FFFFFF" style={styles.viewCartIcon} />
                  <Text style={styles.viewCartText}>View</Text>
                  <View style={styles.viewCartBadge}>
                    <Text style={styles.viewCartBadgeText}>{cartCount}</Text>
                  </View>
                  <Text style={styles.viewCartArrow}>›</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <TouchableOpacity
            style={[styles.startBtn, !allChecked && styles.startBtnPartial]}
            onPress={handleStartCooking}
            activeOpacity={0.8}
          >
            <Text style={styles.startBtnText}>🧑‍🍳 Start Cooking</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Shopping List Bottom Sheet */}
      <Modal visible={showCartSheet} transparent animationType="none" onRequestClose={closeCartSheet}>
        <Pressable style={styles.sheetOverlay} onPress={closeCartSheet}>
          <Animated.View
            style={[
              styles.sheetContainer,
              { transform: [{ translateY: cartSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [500, 0] }) }] },
            ]}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              {/* Handle bar */}
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>🛒 Shopping List</Text>

              {/* Tab Switcher */}
              <View style={styles.sheetTabs}>
                <TouchableOpacity
                  style={[styles.sheetTab, sheetTab === 'smart' && styles.sheetTabActive]}
                  onPress={() => setSheetTab('smart')}
                >
                  <Text style={[styles.sheetTabText, sheetTab === 'smart' && styles.sheetTabTextActive]}>🛍️ Smart List</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetTab, sheetTab === 'recipe' && styles.sheetTabActive]}
                  onPress={() => setSheetTab('recipe')}
                >
                  <Text style={[styles.sheetTabText, sheetTab === 'recipe' && styles.sheetTabTextActive]}>📋 Recipe Qty</Text>
                </TouchableOpacity>
              </View>

              <RNScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {sheetTab === 'recipe' ? (
                  /* ─── RECIPE QTY TAB (original view) ─── */
                  <View style={styles.sheetItems}>
                    {(() => {
                      const grouped: Record<string, string[]> = {};
                      Object.entries(cartItems).forEach(([key, recipeName]) => {
                        if (!grouped[recipeName]) grouped[recipeName] = [];
                        grouped[recipeName].push(key);
                      });
                      return Object.entries(grouped).map(([recipeName, keys]) => (
                        <View key={recipeName}>
                          <Text style={styles.sheetRecipeGroup}>{recipeName}</Text>
                          {keys.map((key) => {
                            const [name, qty] = key.split('|||');
                            return (
                              <View key={key} style={styles.sheetItem}>
                                <Text style={styles.sheetItemBullet}>•</Text>
                                <Text style={styles.sheetItemText}>{qty} {name}</Text>
                                <TouchableOpacity onPress={() => toggleCartItem(key)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                  <Text style={styles.sheetItemRemove}>✕</Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })}
                        </View>
                      ));
                    })()}
                  </View>
                ) : (
                  /* ─── SMART LIST TAB ─── */
                  <View style={styles.sheetItems}>
                    {(() => {
                      const smartItems = buildSmartShoppingList(cartItems);
                      const grouped = groupByCategory(smartItems, showPantry);
                      const categories = Object.keys(grouped);

                      if (categories.length === 0) {
                        return <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>No items to show</Text>;
                      }

                      return (
                        <>
                          {categories.map(cat => (
                            <View key={cat}>
                              <Text style={styles.sheetCategoryHeader}>
                                {CATEGORY_EMOJI[cat.toLowerCase()] || '📦'} {cat}
                              </Text>
                              {grouped[cat].map((item, i) => (
                                <View key={`${cat}-${i}`} style={styles.sheetItem}>
                                  <Text style={styles.sheetItemBullet}>•</Text>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.sheetItemText}>
                                      {item.mapped ? item.purchasableUnit : item.originalQuantity}{' '}
                                      <Text style={{ fontWeight: '700' }}>{item.originalName}</Text>
                                    </Text>
                                    {item.mapped && (
                                      <Text style={styles.sheetItemRecipeQty}>
                                        Recipe needs: {item.originalQuantity}
                                      </Text>
                                    )}
                                  </View>
                                  <Ionicons name="checkmark-circle-outline" size={18} color="rgba(255,255,255,0.3)" />
                                </View>
                              ))}
                            </View>
                          ))}

                          {/* Pantry toggle */}
                          <TouchableOpacity
                            style={styles.pantryToggle}
                            onPress={() => setShowPantry(!showPantry)}
                          >
                            <Ionicons
                              name={showPantry ? 'chevron-up' : 'chevron-down'}
                              size={16}
                              color="rgba(255,255,255,0.4)"
                            />
                            <Text style={styles.pantryToggleText}>
                              {showPantry ? 'Hide' : 'Show'} pantry staples
                            </Text>
                          </TouchableOpacity>
                        </>
                      );
                    })()}
                  </View>
                )}
              </RNScrollView>

              {/* Actions */}
              <View style={styles.sheetActions}>
                {sheetTab === 'smart' ? (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={styles.amazonFreshBtn}
                      onPress={() => openAmazonFresh(cartItems, showPantry)}
                    >
                      <Text style={styles.amazonFreshBtnText}>🛒 Amazon Fresh</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.shareBtn}
                      onPress={async () => {
                        const smartItems = buildSmartShoppingList(cartItems);
                        const message = buildSmartShareMessage(smartItems, showPantry);
                        try { await Share.share({ message }); } catch (_) {}
                      }}
                    >
                      <Text style={styles.shareBtnText}>📤</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.shareBtn}
                      onPress={async () => {
                        const grouped: Record<string, string[]> = {};
                        Object.entries(cartItems).forEach(([key, recipeName]) => {
                          if (!grouped[recipeName]) grouped[recipeName] = [];
                          const [name, qty] = key.split('|||');
                          grouped[recipeName].push(`  • ${qty} ${name}`);
                        });
                        const sections = Object.entries(grouped).map(([recipeName, items]) =>
                          `📌 ${recipeName}\n${items.join('\n')}`
                        ).join('\n\n');
                        const message = `🛒 Shopping List\n\n${sections}\n\nCooked with SpiceStrong 💪`;
                        try { await Share.share({ message }); } catch (_) {}
                      }}
                    >
                      <Text style={styles.shareBtnText}>📤 Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.clearBtn} onPress={clearCart}>
                      <Text style={styles.clearBtnText}>Clear All</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal visible={infoVisible} transparent animationType="slide" onRequestClose={() => setInfoVisible(false)}>
        <View style={styles.infoOverlay}>
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <Text style={styles.infoTitle}>Learn About {infoItemName}</Text>
              <TouchableOpacity onPress={() => setInfoVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.infoClose}>×</Text>
              </TouchableOpacity>
            </View>
            {infoLoading ? (
              <View style={styles.infoLoading}>
                <ProcessingRing label={`Looking up ${infoItemName}…`} expectedMs={5000} size={72} />
              </View>
            ) : (
              <RNScrollView style={styles.infoScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.infoBody}>{infoText}</Text>
              </RNScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 12,
  },
  errorSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  // Back button
  backBtn: {
    position: 'absolute',
    left: 16,
    top: 52,
    zIndex: 10,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(13,11,9,0.54)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  homeBtn: {
    position: 'absolute',
    right: 16,
    top: 52,
    zIndex: 10,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },
  // Recipe name — indented to clear back arrow
  nameSection: {
    paddingLeft: 64,
    paddingRight: 20,
    paddingTop: 52,
    paddingBottom: 10,
  },
  // Controls — full width
  controlsSection: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  recipeName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 6,
    letterSpacing: 0,
  },
  recipeSubtitle: {
    color: 'rgba(248,241,232,0.68)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  // Serving header
  servingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  servingHeaderIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  servingHeaderText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  // Tier selector
  tierSelector: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  tierOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 25,
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
    alignItems: 'center',
  },
  tierOptionSelected: {
    backgroundColor: '#F8F1E8',
    borderColor: '#F8F1E8',
  },
  tierOptionText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tierOptionTextSelected: {
    color: '#2A1005',
  },
  // Single-serving
  singleServingNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  singleServingIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  singleServingText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  // Progress
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressText: {
    fontSize: 13,
    color: 'rgba(248,241,232,0.58)',
  },
  progressPct: {
    fontSize: 13,
    color: ORANGE,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(248,241,232,0.1)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: ORANGE,
  },
  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  sectionEmoji: {
    fontSize: 16,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(248,241,232,0.52)',
    letterSpacing: 1.5,
    marginRight: 12,
  },
  sectionCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sectionCheckboxChecked: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  sectionCheckmark: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: -1,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(248,241,232,0.12)',
  },
  // List
  listContent: {
    paddingBottom: 24,
  },
  // Ingredient cards — bordered rows with radio on left
  ingredientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
  },
  ingredientCardChecked: {
    backgroundColor: 'rgba(143,58,31,0.22)',
    borderColor: 'rgba(143,58,31,0.42)',
  },
  // Radio button on the left
  radioBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(248,241,232,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.24)',
  },
  radioBtnChecked: {
    backgroundColor: ORANGE,
  },
  radioBtnInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  // Ingredient image/emoji circle
  ingredientIcon: {
    width: 52,
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  ingredientIconChecked: {
    opacity: 0.4,
  },
  ingredientIconImage: {
    width: 52,
    height: 52,
    borderRadius: 8,
  },
  ingredientIconEmoji: {
    fontSize: 24,
  },
  // Name + subtitle column
  ingredientInfo: {
    flex: 1,
    marginRight: 10,
  },
  ingredientName: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 3,
  },
  ingredientNameChecked: {
    color: 'rgba(255,255,255,0.35)',
    textDecorationLine: 'line-through',
  },
  ingredientSubtitle: {
    fontSize: 13,
    color: 'rgba(248,241,232,0.6)',
    fontWeight: '500',
  },
  ingredientSubtitleChecked: {
    color: 'rgba(255,255,255,0.25)',
  },
  // Quantity on the right
  ingredientQtyRight: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
    minWidth: 50,
    textAlign: 'right',
  },
  ingredientQtyRightChecked: {
    color: 'rgba(255,255,255,0.3)',
  },
  // Category tag on ingredient
  categoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 3,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  categoryText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Cart button on ingredient row
  cartIconBtn: {
    marginLeft: 8,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(34,140,60,0.70)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(76, 175, 80, 0.5)',
    ...Platform.select({
      ios: { shadowColor: '#4CAF50', shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 6 },
    }),
  },
  cartIconLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: -1,
  },
  cartIconLabelActive: {
    color: '#FFFFFF',
  },
  cartIconBtnActive: {
    backgroundColor: '#388E3C',
    borderColor: 'rgba(56, 142, 60, 0.5)',
  },
  // Select All text
  selectAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(248,241,232,0.55)',
    marginRight: 8,
  },
  // Bottom sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },
  sheetSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginBottom: 16,
  },
  sheetItems: {
    marginBottom: 20,
  },
  sheetRecipeGroup: {
    color: ORANGE,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 4,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  sheetItemBullet: {
    color: ORANGE,
    fontSize: 18,
    fontWeight: '700',
    marginRight: 10,
  },
  sheetItemText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  sheetItemRemove: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 16,
    fontWeight: '700',
    padding: 4,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 12,
  },
  shareBtn: {
    flex: 1,
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  clearBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  clearBtnText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '700',
  },
  // Sheet tabs
  sheetTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  sheetTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  sheetTabActive: {
    backgroundColor: ORANGE,
  },
  sheetTabText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '700',
  },
  sheetTabTextActive: {
    color: '#FFFFFF',
  },
  sheetCategoryHeader: {
    color: ORANGE,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  },
  sheetItemRecipeQty: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    marginTop: 2,
  },
  amazonFreshBtn: {
    flex: 2,
    backgroundColor: 'rgba(255, 153, 0, 0.12)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 153, 0, 0.4)',
  },
  amazonFreshBtnText: {
    color: '#FF9900',
    fontSize: 16,
    fontWeight: '800',
  },
  pantryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  pantryToggleText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
  },
  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 36,
    backgroundColor: 'rgba(13,11,9,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(248,241,232,0.10)',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  footerIcon: {
    fontSize: 28,
    marginRight: 10,
  },
  footerRemaining: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  footerHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  viewCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 25,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 6,
  },
  viewCartIcon: {
    marginRight: -2,
  },
  viewCartText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  viewCartBadge: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  viewCartBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  viewCartArrow: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginLeft: -2,
  },
  startBtn: {
    backgroundColor: ORANGE,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startBtnPartial: {
    backgroundColor: 'rgba(143, 58, 31, 0.55)',
    marginTop: 10,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  infoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  infoCard: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: 36,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(248,241,232,0.10)',
  },
  infoTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginRight: 12,
  },
  infoClose: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 22,
    fontWeight: '800',
  },
  infoLoading: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 14,
  },
  infoLoadingText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontWeight: '600',
  },
  infoScroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  infoBody: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 15,
    lineHeight: 24,
  },
});
