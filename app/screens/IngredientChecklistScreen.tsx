import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  ImageBackground,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getRecipeById,
  SavedRecipe,
  QUANTITY_TIERS,
  BUILTIN_INGREDIENT_GROUPS,
  type QuantityTier,
  type IngredientGroup,
} from '../../src/store/recipes';

const HEADER_BG = '#FAF7F2';
const DARK_TEXT = '#1A1A1A';
const GREY_TEXT = '#6B6B6B';
const ORANGE = '#E85D26';
const ORANGE_LIGHT = '#FFB8A0';
const CARD_WHITE = '#FFFFFF';
const CHECKBOX_GREY = '#CCCCCC';

function flattenGroups(groups: IngredientGroup[]): { name: string; quantity: string }[] {
  return groups.flatMap((g) => g.items);
}

export default function IngredientChecklistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ recipeId: string; quantityTier?: string }>();
  const recipeId = typeof params.recipeId === 'string' ? params.recipeId : Array.isArray(params.recipeId) ? params.recipeId[0] : undefined;
  const quantityTierParam = typeof params.quantityTier === 'string' ? params.quantityTier : Array.isArray(params.quantityTier) ? params.quantityTier[0] : undefined;
  const initialTier = (quantityTierParam && (QUANTITY_TIERS as readonly string[]).includes(quantityTierParam)) ? quantityTierParam as QuantityTier : '2-3 servings';

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

  const handleStartCooking = () => {
    if (!recipe) return;
    const params: Record<string, string> = { recipeId: recipe.id };
    if (effectiveTier) params.quantityTier = effectiveTier;
    router.replace({
      pathname: '/screens/CookingStartScreen',
      params,
    });
  };

  const overlay = (
    <View style={{
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    }} />
  );

  if (loading) {
    return (
      <ImageBackground
        source={require('../../assets/images/splash-bg.png')}
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
        source={require('../../assets/images/splash-bg.png')}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        {overlay}
        <View style={[styles.container, styles.headerBg]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backTextDark}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.errorTitleDark}>Recipe not found</Text>
          <Text style={styles.errorSubtitleDark}>
            This recipe may have been deleted or the link is invalid.
          </Text>
        </View>
      </ImageBackground>
    );
  }

  const ingredientsByTier = recipe.ingredients;
  const tierHasIngredients = (tier: QuantityTier) =>
    (ingredientsByTier[tier]?.filter((i) => i.name.trim()).length ?? 0) > 0;
  const availableTiers = QUANTITY_TIERS.filter(tierHasIngredients);
  const effectiveTier = availableTiers.includes(selectedTier) ? selectedTier : availableTiers[0] ?? '2-3 servings';
  const ingredientGroups = recipe.id ? BUILTIN_INGREDIENT_GROUPS[recipe.id] : undefined;
  const hasGroups = Boolean(ingredientGroups && ingredientGroups.length > 0);

  const flatIngredients = hasGroups
    ? flattenGroups(ingredientGroups!)
    : (ingredientsByTier[effectiveTier]?.filter((i) => i.name.trim()) ?? []);

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

  const displayName = recipe.id === 'builtin-chicken-butter' ? 'Butter Chicken' : recipe.name;
  const subtitle = `${displayName} · ${effectiveTier}`;

  const renderIngredientRow = (item: { name: string; quantity: string }, flatIndex: number) => {
    const isChecked = !!checked[`${effectiveTier}-${flatIndex}`];
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => toggleChecked(flatIndex)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
          {isChecked ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={[styles.ingredientName, isChecked && styles.ingredientNameChecked]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.ingredientQuantity, isChecked && styles.ingredientQuantityChecked]} numberOfLines={1}>
          {item.quantity}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <ImageBackground
      source={require('../../assets/images/splash-bg.png')}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      {overlay}
    <View style={styles.wrapper}>
      {/* Header — semi-transparent */}
      <View style={[styles.header, styles.headerBg]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backTextDark}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gather Ingredients</Text>
        <View style={styles.headerSpacer} />
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        <Text style={styles.servingLabel}>🍽️ How many servings?</Text>
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
                  {tier === '2-3 servings' ? '👨‍👩‍👦 2-3 Servings' : '👨‍👩‍👦‍👦 4-6 Servings'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.progressRow}>
          <Text style={styles.progressLeft}>{checkedCount} of {totalCount} gathered</Text>
          <Text style={styles.progressRight}>{progressPct}%</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
        </View>
      </View>

      {/* Content — scrollable list */}
      <View style={styles.content}>
        {hasGroups ? (
          <SectionList
            sections={ingredientGroups!.map((group, gIdx) => {
              let start = 0;
              for (let i = 0; i < gIdx; i++) start += ingredientGroups![i].items.length;
              return {
                key: group.category,
                emoji: group.emoji,
                category: group.category,
                data: group.items.map((item, itemIdx) => ({ ...item, flatIndex: start + itemIdx })),
              };
            })}
            keyExtractor={(item) => `${item.flatIndex}`}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={styles.sectionListContent}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.emoji} {section.category}</Text>
                <View style={styles.sectionLine} />
              </View>
            )}
            renderItem={({ item }) => renderIngredientRow({ name: item.name, quantity: item.quantity }, item.flatIndex)}
          />
        ) : (
          <FlatList
            data={flatIngredients}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => renderIngredientRow(item, index)}
          />
        )}
      </View>

      <View style={[styles.footer, styles.headerBg]}>
        <TouchableOpacity
          style={[styles.startBtn, !allChecked && styles.startBtnNotReady]}
          onPress={handleStartCooking}
          activeOpacity={0.8}
          disabled={!allChecked}
        >
          <Text style={styles.startBtnText}>🧑‍🍳 Start Cooking</Text>
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
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBg: {
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  loadingText: {
    color: DARK_TEXT,
    fontSize: 16,
  },
  errorTitleDark: {
    color: DARK_TEXT,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 12,
  },
  errorSubtitleDark: {
    color: GREY_TEXT,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    top: 56,
    zIndex: 1,
  },
  backTextDark: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  headerSpacer: { height: 0 },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 12,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLeft: {
    fontSize: 13,
    color: GREY_TEXT,
  },
  progressRight: {
    fontSize: 13,
    color: ORANGE,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E8E4DE',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: ORANGE,
  },
  servingLabel: {
    color: CARD_WHITE,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  tierSelector: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  tierOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  tierOptionSelected: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  tierOptionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '700',
  },
  tierOptionTextSelected: {
    color: CARD_WHITE,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  sectionListContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: GREY_TEXT,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionLine: {
    height: 1,
    backgroundColor: '#E0DDD8',
  },
  list: {
    paddingBottom: 24,
    paddingTop: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_WHITE,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: CHECKBOX_GREY,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  checkmark: {
    color: CARD_WHITE,
    fontSize: 14,
    fontWeight: 'bold',
  },
  ingredientName: {
    flex: 1,
    fontSize: 15,
    color: DARK_TEXT,
    fontWeight: '500',
    marginRight: 8,
  },
  ingredientNameChecked: {
    color: GREY_TEXT,
    textDecorationLine: 'line-through',
  },
  ingredientQuantity: {
    fontSize: 14,
    color: ORANGE,
    fontWeight: '600',
    minWidth: 56,
    textAlign: 'right',
  },
  ingredientQuantityChecked: {
    color: GREY_TEXT,
    textDecorationLine: 'line-through',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: '#E8E4DE',
  },
  startBtn: {
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  startBtnNotReady: {
    backgroundColor: ORANGE_LIGHT,
  },
  startBtnText: {
    color: CARD_WHITE,
    fontSize: 18,
    fontWeight: 'bold',
  },
});
