import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  ImageBackground,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const screenWidth = Dimensions.get('window').width;

import RecipeCard, { type RecipeDifficulty } from './RecipeCard';
import { getRecipes, getBuiltInRecipeById, SavedRecipe, QUANTITY_TIERS, type QuantityTier } from '../../src/store/recipes';
import { getRatings, getFavourites, toggleFavourite, type RatingsMap } from '../../src/store/ratingsFavourites';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HEADER_ORANGE = '#E85D26';
const DARK_PILL = '#1A0A00';
const LIGHT_BG = '#FAF7F2';
const CARD_WHITE = '#FFFFFF';
const CREAM_LABEL = 'rgba(255,255,255,0.72)';
const WARM_CREAM = '#FDF8F3';
const TAB_INACTIVE = 'rgba(255,255,255,0.2)';
const TAB_ACTIVE_BG = '#1A0A00';

type FilterTab = 'all' | 'topRated' | 'new' | 'favourites';

interface BuiltInRecipeDisplay {
  id: string;
  proteinId: string;
  name: string;
  timeMinutes: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  proteinPer100g: number;
  emoji: string;
  gradient: [string, string];
}

const builtInRecipes: BuiltInRecipeDisplay[] = [
  { id: 'builtin-chicken-butter', proteinId: 'chicken', name: 'Butter Chicken (Murgh Makhani)', timeMinutes: 45, difficulty: 'Medium', proteinPer100g: 38, emoji: '🍛', gradient: ['#FF8C00', '#E85D26'] },
  { id: 'builtin-chicken-pepper', proteinId: 'chicken', name: "Venky's Pepper Chicken", timeMinutes: 25, difficulty: 'Medium', proteinPer100g: 42, emoji: '🌶️', gradient: ['#8B0000', '#4A0000'] },
  { id: 'builtin-chicken-tikka-bites', proteinId: 'chicken', name: 'Indian Tikka Bites', timeMinutes: 30, difficulty: 'Easy', proteinPer100g: 42, emoji: '🍢', gradient: ['#B45309', '#78350F'] },
  { id: 'builtin-paneer-stirfry', proteinId: 'paneer', name: 'Healthy Paneer Stir Fry', timeMinutes: 25, difficulty: 'Easy', proteinPer100g: 18, emoji: '🧀', gradient: ['#1B5E20', '#0A3D0A'] },
  { id: 'builtin-prawns-pepper-fry', proteinId: 'prawns', name: 'Pepper Shrimp Fry', timeMinutes: 20, difficulty: 'Easy', proteinPer100g: 24, emoji: '🦐', gradient: ['#0D47A1', '#1A237E'] },
  { id: 'builtin-tofu-fried-masala', proteinId: 'tofu', name: 'Fried Masala Tofu', timeMinutes: 15, difficulty: 'Easy', proteinPer100g: 17, emoji: '🟫', gradient: ['#0F4C5C', '#0A3040'] },
  { id: 'builtin-soy-soya-masala', proteinId: 'soy', name: 'Soya Masala', timeMinutes: 20, difficulty: 'Easy', proteinPer100g: 36, emoji: '🫘', gradient: ['#1A4A1A', '#0A2A0A'] },
  { id: 'builtin-beans-rajma-masala', proteinId: 'beans', name: 'Rajma Masala', timeMinutes: 25, difficulty: 'Easy', proteinPer100g: 20, emoji: '🫘', gradient: ['#7B1A1A', '#4A0A0A'] },
  { id: 'builtin-beans-dry-chana-masala', proteinId: 'beans', name: 'Dry Chana Masala', timeMinutes: 15, difficulty: 'Easy', proteinPer100g: 19, emoji: '🫛', gradient: ['#7A5C00', '#4A3800'] },
  { id: 'builtin-beans-masoor-dal-curry', proteinId: 'beans', name: 'Masoor Dal Curry', timeMinutes: 12, difficulty: 'Easy', proteinPer100g: 18, emoji: '🍲', gradient: ['#8B3A0F', '#5A1A05'] },
  { id: 'builtin-pork-vindaloo', proteinId: 'pork', name: 'Goan Pork Vindaloo', timeMinutes: 45, difficulty: 'Hard', proteinPer100g: 28, emoji: '🫕', gradient: ['#7B1D1D', '#4A0A0A'] },
  { id: 'builtin-pork-pepper-fry', proteinId: 'pork', name: 'Pork Pepper Fry', timeMinutes: 30, difficulty: 'Medium', proteinPer100g: 29, emoji: '🥩', gradient: ['#3D1A0A', '#1A0A00'] },
  { id: 'builtin-pork-indian-curry', proteinId: 'pork', name: 'Indian Pork Curry', timeMinutes: 40, difficulty: 'Medium', proteinPer100g: 31, emoji: '🫕', gradient: ['#6B1A1A', '#3D0A0A'] },
  { id: 'builtin-lamb-healthy-curry', proteinId: 'lamb', name: 'Healthy Lamb Curry', timeMinutes: 45, difficulty: 'Medium', proteinPer100g: 28, emoji: '🥘', gradient: ['#3B4A1A', '#1E2A0A'] },
  { id: 'builtin-goat-chops', proteinId: 'goat', name: 'Goat Chops (Mutton Chaap)', timeMinutes: 35, difficulty: 'Medium', proteinPer100g: 27, emoji: '🍖', gradient: ['#4A2010', '#2A0F05'] },
  { id: 'builtin-eggs-healthy-curry', proteinId: 'eggs', name: 'Healthy Egg Curry', timeMinutes: 25, difficulty: 'Easy', proteinPer100g: 13, emoji: '🥚', gradient: ['#7A5C00', '#3D2E00'] },
  { id: 'builtin-fish-tandoori', proteinId: 'fish', name: 'Pan-Seared Tandoori Fish', timeMinutes: 25, difficulty: 'Easy', proteinPer100g: 32, emoji: '🐟', gradient: ['#0D3B5E', '#071E30'] },
];

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'topRated', label: '⭐ Top Rated' },
  { key: 'new', label: '✨ New' },
  { key: 'favourites', label: '★ Favourites' },
];

export default function RecipeListScreen() {
  const router = useRouter();
  const { proteinId, proteinName, proteinEmoji } = useLocalSearchParams<{
    proteinId: string;
    proteinName: string;
    proteinEmoji: string;
  }>();

  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [selectedTierByRecipeId, setSelectedTierByRecipeId] = useState<Record<string, QuantityTier>>({});
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [ratings, setRatings] = useState<RatingsMap>({});
  const [favourites, setFavourites] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getRecipes(), getRatings(), getFavourites()]).then(([allRecipes, ratingsMap, favouritesList]) => {
        if (cancelled) return;
        const filtered = allRecipes.filter((r) => r.proteinId === proteinId);
        setRecipes(filtered);
        setRatings(ratingsMap);
        setFavourites(favouritesList);
      });
      return () => { cancelled = true; };
    }, [proteinId])
  );

  const builtInForProtein = useMemo(
    () => builtInRecipes.filter((r) => r.proteinId === proteinId),
    [proteinId]
  );
  const totalCount = builtInForProtein.length + recipes.length;
  const allProteinValues = useMemo(() => {
    const fromBuiltIn = builtInForProtein.map((r) => r.proteinPer100g);
    return fromBuiltIn;
  }, [builtInForProtein]);
  const minProtein = allProteinValues.length ? Math.min(...allProteinValues) : 0;
  const maxProtein = allProteinValues.length ? Math.max(...allProteinValues) : 0;
  const proteinRangeText = minProtein && maxProtein ? `${minProtein}g-${maxProtein}g` : '—';

  const handleDelete = (recipe: SavedRecipe) => {
    Alert.alert(
      'Delete Recipe',
      `Delete "${recipe.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
            const data = await AsyncStorage.getItem('spicestrong_recipes');
            const all = data ? JSON.parse(data) : [];
            const updated = all.filter((r: { id: string }) => r.id !== recipe.id);
            await AsyncStorage.setItem('spicestrong_recipes', JSON.stringify(updated));
            setRecipes((prev) => prev.filter((r) => r.id !== recipe.id));
            } catch (e) {
              console.error('Delete failed', e);
            }
          },
        },
      ]
    );
  };

  const handleToggleFavourite = useCallback(async (recipeId: string, e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    const nowFav = await toggleFavourite(recipeId);
    setFavourites((prev) =>
      nowFav ? [...prev, recipeId] : prev.filter((id) => id !== recipeId)
    );
  }, []);

  type RecipeItem = BuiltInRecipeDisplay | (SavedRecipe & { timeMinutes?: number; difficulty?: string; proteinPer100g?: number; emoji?: string; gradient?: [string, string] });

  const renderRecipeCard = (item: RecipeItem, isBuiltIn: boolean) => {
    const timeMinutes = isBuiltIn ? (item as BuiltInRecipeDisplay).timeMinutes : (item as SavedRecipe & { timeMinutes?: number }).timeMinutes ?? null;
    const difficultyRaw = isBuiltIn ? (item as BuiltInRecipeDisplay).difficulty : (item as SavedRecipe & { difficulty?: string }).difficulty ?? '—';
    const proteinPer100g = isBuiltIn ? (item as BuiltInRecipeDisplay).proteinPer100g : (item as SavedRecipe & { proteinPer100g?: number }).proteinPer100g ?? null;
    const cardDifficulty: RecipeDifficulty =
      difficultyRaw === 'Medium' ? 'Medium' : difficultyRaw === 'Hard' ? 'Hard' : 'Easy';
    const gradient: readonly [string, string] = isBuiltIn
      ? (item as BuiltInRecipeDisplay).gradient
      : (item as SavedRecipe & { gradient?: [string, string] }).gradient ?? ['#8B4513', '#5D2E0C'];
    const ratingValue = ratings[item.id];
    const ratingString = ratingValue != null && ratingValue >= 1 ? Number(ratingValue).toFixed(1) : undefined;

    const description = isBuiltIn
      ? (getBuiltInRecipeById(item.id)?.chefTip ?? '')
      : (item as SavedRecipe).chefTip ?? '';

    return (
      <RecipeCard
        name={item.name}
        description={description}
        time={timeMinutes != null ? `${timeMinutes} min` : '—'}
        protein={proteinPer100g != null ? `${proteinPer100g}g protein` : ''}
        difficulty={cardDifficulty}
        rating={ratingString}
        emoji={isBuiltIn ? (item as BuiltInRecipeDisplay).emoji : (item as SavedRecipe & { emoji?: string }).emoji ?? '🍽️'}
        isFavorite={favourites.includes(item.id)}
        onPress={() =>
          router.push({
            pathname: '/screens/IngredientChecklistScreen',
            params: { recipeId: item.id, quantityTier: (selectedTierByRecipeId[item.id] ?? '1lb') },
          })
        }
        onFavoriteToggle={(e) => handleToggleFavourite(item.id, e)}
        accentColors={gradient}
        actionRow={
          !isBuiltIn ? (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  handleDelete(item as SavedRecipe);
                }}
              >
                <Text style={styles.deleteBtnText}>🗑</Text>
              </TouchableOpacity>
            </View>
          ) : undefined
        }
      />
    );
  };

  const listData: Array<{ type: 'builtin'; item: BuiltInRecipeDisplay } | { type: 'custom'; item: SavedRecipe }> = useMemo(() => {
    const builtInItems = builtInForProtein.map((item) => ({ type: 'builtin' as const, item }));
    const customItems = recipes.map((item) => ({ type: 'custom' as const, item }));
    const allRecipeEntries = [...builtInItems, ...customItems];

    let filtered: Array<{ type: 'builtin'; item: BuiltInRecipeDisplay } | { type: 'custom'; item: SavedRecipe }>;
    if (activeFilter === 'all') {
      filtered = allRecipeEntries;
    } else if (activeFilter === 'topRated') {
      filtered = allRecipeEntries
        .filter((entry) => {
          const id = entry.type === 'builtin' ? entry.item.id : entry.item.id;
          return (ratings[id] ?? 0) >= 4;
        })
        .sort((a, b) => {
          const idA = a.type === 'builtin' ? a.item.id : a.item.id;
          const idB = b.type === 'builtin' ? b.item.id : b.item.id;
          return (ratings[idB] ?? 0) - (ratings[idA] ?? 0);
        });
    } else if (activeFilter === 'new') {
      filtered = allRecipeEntries.filter((entry) => {
        const id = entry.type === 'builtin' ? entry.item.id : entry.item.id;
        return ratings[id] == null || ratings[id] < 1;
      });
    } else {
      filtered = allRecipeEntries.filter((entry) => {
        const id = entry.type === 'builtin' ? entry.item.id : entry.item.id;
        return favourites.includes(id);
      });
    }

    return filtered;
  }, [builtInForProtein, recipes, activeFilter, ratings, favourites]);

  return (
    <ImageBackground
      source={require('../../assets/images/splash-bg.png')}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      <View style={{
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
      }} />
      <View style={styles.container}>
      <View style={styles.screenContent}>
        <View style={[styles.header, styles.headerOrange]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{proteinName} Recipes</Text>
          <View style={styles.headerHero}>
            <View style={styles.headerProteinIconWrap}>
              <LinearGradient
                colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.12)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerProteinIconShine}
              />
              <View style={styles.headerProteinIcon}>
                <Text style={styles.headerEmoji}>{proteinEmoji}</Text>
              </View>
            </View>
            <Text style={styles.headerProteinName}>{proteinName}</Text>
          </View>
          <Text style={styles.headerSubtitle}>High-protein · Non-Vegetarian</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statNumber}>{totalCount}</Text>
              <Text style={styles.statLabel}>RECIPES</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statNumber}>{proteinRangeText}</Text>
              <Text style={styles.statLabel}>PROTEIN/100G</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statNumber}>4.8★</Text>
              <Text style={styles.statLabel}>AVG RATING</Text>
            </View>
          </View>
        </View>

        <View style={styles.tabsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.tabsContent, { paddingHorizontal: 16 }]}
          >
            {FILTER_TABS.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabPill, activeFilter === tab.key && styles.tabPillActive]}
                onPress={() => setActiveFilter(tab.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabPillText, activeFilter === tab.key && styles.tabPillTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.actionBtnRow}>
          <TouchableOpacity
            style={styles.actionPill}
            onPress={() =>
              router.push({
                pathname: '/screens/AIRecipeBuilderScreen',
                params: { proteinId, proteinName, proteinEmoji },
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.actionPillText}>+ 🤖 Build with AI</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionPill}
            onPress={() =>
              router.push({
                pathname: '/screens/AddRecipeScreen',
                params: { proteinId, proteinName, proteinEmoji },
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.actionPillText}>+ 📝 Add Recipe</Text>
          </TouchableOpacity>
        </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => (item.type === 'add' ? 'add' : item.type === 'builtin' ? item.item.id : item.item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={null}
        renderItem={({ item }) => {
          if (item.type === 'builtin') {
            return renderRecipeCard(item.item, true);
          }
          return renderRecipeCard(item.item, false);
        }}
      />
      </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenContent: { flex: 1 },
  headerOrange: {
    backgroundColor: 'rgba(180,60,10,0.75)',
  },
  header: {
    backgroundColor: 'transparent',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 24,
    zIndex: 1,
  },
  backBtn: { position: 'absolute', top: 52, left: 20, zIndex: 2 },
  backText: {
    color: CARD_WHITE,
    fontSize: 30,
    fontWeight: '700',
    ...Platform.select({ ios: { textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 } }),
  },
  headerTitle: {
    color: CREAM_LABEL,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  headerHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 8,
  },
  headerProteinIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#FF8C00',
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
      },
      android: { elevation: 8 },
    }),
  },
  headerProteinIconShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  headerProteinIcon: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEmoji: { fontSize: 40 },
  headerProteinName: {
    fontSize: 32,
    color: CARD_WHITE,
    fontWeight: '800',
    letterSpacing: -0.5,
    ...Platform.select({ ios: { textShadowColor: 'rgba(0,0,0,0.15)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 } }),
  },
  headerSubtitle: {
    fontSize: 14,
    color: CREAM_LABEL,
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 0.3,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
  },
  statCol: { alignItems: 'center', minWidth: 80 },
  statNumber: {
    color: CARD_WHITE,
    fontSize: 19,
    fontWeight: '800',
    ...Platform.select({ ios: { textShadowColor: 'rgba(0,0,0,0.12)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 } }),
  },
  statLabel: { color: CREAM_LABEL, fontSize: 10, marginTop: 3, letterSpacing: 1, fontWeight: '600' },

  tabsWrap: { backgroundColor: 'transparent', paddingVertical: 14 },
  tabsContent: { flexDirection: 'row', gap: 10 },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 18,
    marginBottom: 4,
  },
  actionPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  actionPillText: { color: CARD_WHITE, fontWeight: '600', fontSize: 12 },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 28,
    backgroundColor: TAB_INACTIVE,
    borderWidth: 0,
  },
  tabPillActive: {
    backgroundColor: TAB_ACTIVE_BG,
  },
  tabPillText: { fontSize: 14, color: 'white', fontWeight: '600' },
  tabPillTextActive: { color: 'white', fontWeight: '700' },

  list: { paddingHorizontal: 0, paddingVertical: 12, paddingBottom: 44 },
  actionRow: { flexDirection: 'row', gap: 10 },
  deleteBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { fontSize: 14, color: '#fff' },

  // Add card styles removed — replaced by compact pill buttons
});
