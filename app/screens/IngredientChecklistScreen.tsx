import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
  ImageBackground,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
const ORANGE = '#E85D26';
const ORANGE_LIGHT = 'rgba(232, 93, 38, 0.35)';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BG_CHECKED = 'rgba(232, 93, 38, 0.12)';
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

export default function IngredientChecklistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ recipeId: string; quantityTier?: string }>();
  const recipeId = typeof params.recipeId === 'string' ? params.recipeId : Array.isArray(params.recipeId) ? params.recipeId[0] : undefined;
  const quantityTierParam = typeof params.quantityTier === 'string' ? params.quantityTier : Array.isArray(params.quantityTier) ? params.quantityTier[0] : undefined;
  const initialTier = (quantityTierParam && (QUANTITY_TIERS as readonly string[]).includes(quantityTierParam)) ? quantityTierParam as QuantityTier : '2-3 servings';

  // AI-generated ingredient images (loaded from AsyncStorage)
  const [aiImages, setAiImages] = useState<RecipeImageResults | null>(null);

  const [recipe, setRecipe] = useState<SavedRecipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<QuantityTier>(initialTier);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

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
      pathname: '/screens/CookingStartScreen',
      params: navParams,
    });
  };

  const overlay = (
    <View style={{
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.35)',
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
  const effectiveTier = availableTiers.includes(selectedTier) ? selectedTier : availableTiers[0] ?? '2-3 servings';

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
    return (
      <TouchableOpacity
        style={[styles.ingredientCard, isChecked && styles.ingredientCardChecked]}
        onPress={() => toggleChecked(item.flatIndex)}
        activeOpacity={0.7}
      >
        {/* Radio button on the left */}
        <View style={[styles.radioBtn, isChecked && styles.radioBtnChecked]}>
          {isChecked ? <View style={styles.radioBtnInner} /> : null}
        </View>
        {/* Ingredient image: AI image > static image > emoji fallback */}
        <View style={[styles.ingredientIcon, isChecked && styles.ingredientIconChecked]}>
          {aiImgUrl ? (
            <Image source={{ uri: aiImgUrl }} style={styles.ingredientIconImage} />
          ) : ingredientImg ? (
            <Image source={ingredientImg} style={styles.ingredientIconImage} />
          ) : (
            <Text style={styles.ingredientIconEmoji}>{emoji}</Text>
          )}
        </View>
        {/* Name & subtitle */}
        <View style={styles.ingredientInfo}>
          <Text style={[styles.ingredientName, isChecked && styles.ingredientNameChecked]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.ingredientSubtitle, isChecked && styles.ingredientSubtitleChecked]} numberOfLines={1}>
            {item.quantity}
          </Text>
        </View>
        {/* Quantity on the right */}
        <Text style={[styles.ingredientQtyRight, isChecked && styles.ingredientQtyRightChecked]}>
          {item.quantity}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <>
      {/* Recipe name — indented to clear back arrow */}
      <View style={styles.nameSection}>
        <Text style={styles.recipeName}>{recipe.name}</Text>
        <Text style={styles.recipeSubtitle}>
          {isSingleServing ? '1 Serving' : effectiveTier} • {totalCount} ingredients
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
          <Text style={styles.progressPct}>{progressPct}%</Text>
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
                <View style={[styles.sectionCheckbox, allSectionChecked && styles.sectionCheckboxChecked]}>
                  {allSectionChecked ? <Text style={styles.sectionCheckmark}>✓</Text> : null}
                </View>
                <Text style={styles.sectionEmoji}>{section.emoji}</Text>
                <Text style={styles.sectionTitle}>{section.category}</Text>
                <View style={styles.sectionLine} />
              </TouchableOpacity>
            );
          }}
          renderItem={renderIngredientRow}
        />

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.startBtn, !allChecked && styles.startBtnNotReady]}
            onPress={handleStartCooking}
            activeOpacity={0.8}
            disabled={!allChecked}
          >
            <Text style={styles.startBtnText}>
              {allChecked ? '🧑‍🍳 Start Cooking' : `🧂 ${totalCount - checkedCount} ingredients remaining`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingBottom: 4,
  },
  // Controls — full width
  controlsSection: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  recipeName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  recipeSubtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    marginBottom: 14,
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
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
  },
  tierOptionSelected: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  tierOptionText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tierOptionTextSelected: {
    color: '#FFFFFF',
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
    color: 'rgba(255,255,255,0.5)',
  },
  progressPct: {
    fontSize: 13,
    color: ORANGE,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
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
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.5,
    marginRight: 12,
  },
  sectionCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
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
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  // List
  listContent: {
    paddingBottom: 24,
  },
  // Ingredient cards — bordered rows with radio on left
  ingredientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(80, 40, 20, 0.55)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  ingredientCardChecked: {
    backgroundColor: 'rgba(232, 93, 38, 0.18)',
    borderColor: 'rgba(232, 93, 38, 0.35)',
  },
  // Radio button on the left
  radioBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  ingredientIconChecked: {
    opacity: 0.4,
  },
  ingredientIconImage: {
    width: 52,
    height: 52,
    borderRadius: 10,
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
    color: 'rgba(255,255,255,0.55)',
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
  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 36,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  startBtn: {
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startBtnNotReady: {
    backgroundColor: ORANGE_LIGHT,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
});
