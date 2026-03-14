import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useRef, useState } from 'react';
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

import RecipeCard, { type RecipeDifficulty } from '../../components/RecipeCard';
import { CommunityReviewsModal } from '../../components/CommunityReviewsModal';
import { getAllRecipesForProtein, SavedRecipe, QUANTITY_TIERS, type QuantityTier, type MealType } from '../../src/store/recipes';
import { getRecipeCardImage } from '../../src/data/recipeImages';
import { getRatings, getFavourites, toggleFavourite, type RatingsMap } from '../../src/store/ratingsFavourites';
import { getRecipeRatings, type RecipeRatings } from '../../services/ratingsService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HEADER_ORANGE = '#E85D26';
const DARK_PILL = '#1A0A00';
const LIGHT_BG = '#FAF7F2';
const CARD_WHITE = '#FFFFFF';
const CREAM_LABEL = 'rgba(255,255,255,0.72)';
const WARM_CREAM = '#FDF8F3';
const TAB_INACTIVE = 'rgba(255,255,255,0.2)';
const TAB_ACTIVE_BG = '#1A0A00';

type FilterTab = 'all' | 'breakfast' | 'lunch_dinner' | 'snack_dessert' | 'favourites';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'breakfast', label: '🌅 Breakfast' },
  { key: 'lunch_dinner', label: '🍽️ Lunch/Dinner' },
  { key: 'snack_dessert', label: '🥜 Snack/Dessert' },
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

  // Community ratings cache (persists across re-renders, fetched once per recipeId)
  const communityRatingsCache = useRef<Record<string, RecipeRatings>>({});
  const [communityRatings, setCommunityRatings] = useState<Record<string, RecipeRatings>>({});
  const [communityLoading, setCommunityLoading] = useState<Record<string, boolean>>({});

  // Modal state
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewModalRecipeId, setReviewModalRecipeId] = useState<string>('');
  const [reviewModalRecipeName, setReviewModalRecipeName] = useState<string>('');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getAllRecipesForProtein(proteinId), getRatings(), getFavourites()]).then(([allRecipes, ratingsMap, favouritesList]) => {
        if (cancelled) return;
        const filtered = allRecipes;
        setRecipes(filtered);
        setRatings(ratingsMap);
        setFavourites(favouritesList);
      });
      return () => { cancelled = true; };
    }, [proteinId])
  );

  // Fetch community ratings for visible recipes (cached per recipeId)
  const fetchCommunityRating = useCallback(async (recipeId: string) => {
    if (communityRatingsCache.current[recipeId]) return; // already cached
    setCommunityLoading((prev) => ({ ...prev, [recipeId]: true }));
    try {
      const data = await getRecipeRatings(recipeId);
      communityRatingsCache.current[recipeId] = data;
      setCommunityRatings((prev) => ({ ...prev, [recipeId]: data }));
    } catch {
      // silently fail
    } finally {
      setCommunityLoading((prev) => ({ ...prev, [recipeId]: false }));
    }
  }, []);

  // Fetch ratings for all loaded recipes
  useFocusEffect(
    useCallback(() => {
      recipes.forEach((r) => fetchCommunityRating(r.id));
    }, [recipes, fetchCommunityRating])
  );

  const handleRatingPress = useCallback((recipeId: string, recipeName: string) => {
    const data = communityRatings[recipeId];
    if (data) {
      setReviewModalRecipeId(recipeId);
      setReviewModalRecipeName(recipeName);
      setReviewModalVisible(true);
    }
  }, [communityRatings]);

  const totalCount = recipes.length;

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

  const renderRecipeCard = (item: SavedRecipe) => {
    const timeMinutes = (item as SavedRecipe & { timeMinutes?: number }).timeMinutes ?? null;
    const difficultyRaw = (item as SavedRecipe & { difficulty?: string }).difficulty ?? '—';
    const proteinPer100g = (item as SavedRecipe & { proteinPer100g?: number }).proteinPer100g ?? null;
    const cardDifficulty: RecipeDifficulty =
      difficultyRaw === 'Medium' ? 'Medium' : difficultyRaw === 'Hard' ? 'Hard' : 'Easy';
    const gradient: readonly [string, string] = (item as SavedRecipe & { gradient?: [string, string] }).gradient ?? ['#8B4513', '#5D2E0C'];
    const cardImage = getRecipeCardImage(item.id);
    // Use community rating if available, fall back to personal rating
    const community = communityRatings[item.id];
    const ratingValue = community?.averageRating ?? ratings[item.id];
    const ratingString = ratingValue != null && ratingValue >= 1 ? Number(ratingValue).toFixed(1) : undefined;
    const ratingCount = community?.totalCount;
    const isLoading = communityLoading[item.id] ?? false;
    const description = item.chefTip ?? item.description ?? '';

    return (
      <RecipeCard
        name={item.name}
        description={description}
        time={timeMinutes != null ? `${timeMinutes} min` : '—'}
        protein={proteinPer100g != null ? `${proteinPer100g}g protein` : ''}
        difficulty={cardDifficulty}
        rating={ratingString}
        communityCount={ratingCount}
        communityLoading={isLoading}
        emoji={item.proteinEmoji ?? '🍽️'}
        imageSource={cardImage}
        isFavorite={favourites.includes(item.id)}
        onPress={() =>
          router.push({
            pathname: '/screens/IngredientChecklistScreen',
            params: { recipeId: item.id, quantityTier: (selectedTierByRecipeId[item.id] ?? '2-3 servings') },
          })
        }
        onFavoriteToggle={(e) => handleToggleFavourite(item.id, e)}
        onRatingPress={() => handleRatingPress(item.id, item.name)}
        accentColors={gradient}
        actionRow={
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={(e) => {
                e.stopPropagation();
                handleDelete(item);
              }}
            >
              <Text style={styles.deleteBtnText}>🗑</Text>
            </TouchableOpacity>
          </View>
        }
      />
    );
  };

  const listData = useMemo(() => {
    let filtered: SavedRecipe[];
    if (activeFilter === 'all') {
      filtered = recipes;
    } else if (activeFilter === 'breakfast' || activeFilter === 'lunch_dinner' || activeFilter === 'snack_dessert') {
      filtered = recipes.filter((r) => {
        const mt = (r as SavedRecipe & { mealType?: string }).mealType;
        if (mt) return mt === activeFilter;
        // Default to lunch_dinner if no mealType set
        return activeFilter === 'lunch_dinner';
      });
    } else {
      // favourites
      filtered = recipes.filter((r) => favourites.includes(r.id));
    }
    return filtered;
  }, [recipes, activeFilter, ratings, favourites]);

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
          <Text style={styles.headerSubtitle}>High-protein recipes</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statNumber}>{totalCount}</Text>
              <Text style={styles.statLabel}>RECIPES</Text>
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
            style={styles.actionCard}
            onPress={() =>
              router.push({
                pathname: '/screens/AIRecipeBuilderScreen',
                params: { proteinId, proteinName, proteinEmoji },
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.actionCardEmoji}>🤖</Text>
            <Text style={styles.actionCardTitle}>Build with AI</Text>
            <Text style={styles.actionCardSub}>Generate a custom recipe</Text>
          </TouchableOpacity>
        </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🍽️</Text>
            <Text style={styles.emptyTitle}>No recipes yet</Text>
            <Text style={styles.emptySub}>Use "Build with AI" to create your first {proteinName} recipe!</Text>
          </View>
        }
        renderItem={({ item }) => renderRecipeCard(item)}
      />
      </View>
      </View>
      {/* Community Reviews Modal */}
      <CommunityReviewsModal
        visible={reviewModalVisible}
        onClose={() => setReviewModalVisible(false)}
        recipeName={reviewModalRecipeName}
        ratings={communityRatings[reviewModalRecipeId] ?? {
          averageRating: 0,
          totalCount: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          reviews: [],
        }}
      />
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
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
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 2,
  },
  actionCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    ...Platform.select({
      ios: { shadowColor: 'rgba(100,40,0,0.9)', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 8 },
    }),
  },
  actionCardEmoji: { fontSize: 28, marginBottom: 4 },
  actionCardTitle: { color: '#1a1a1a', fontWeight: '800', fontSize: 14, textAlign: 'center' },
  actionCardSub: { color: '#888', fontWeight: '500', fontSize: 11, textAlign: 'center', marginTop: 1 },
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

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
