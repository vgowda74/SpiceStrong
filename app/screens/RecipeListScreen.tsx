import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Image } from 'expo-image';

const screenWidth = Dimensions.get('window').width;

import RecipeCard, { type RecipeDifficulty, type CardNutrition } from '../../components/RecipeCard';
import { CommunityReviewsModal } from '../../components/CommunityReviewsModal';
import { getAllRecipesForProteinWithRefresh, SavedRecipe, QUANTITY_TIERS, type QuantityTier, type MealType, SERVINGS_PER_TIER } from '../../src/store/recipes';
import { type NutritionInfo, BUILTIN_RECIPES } from '../../src/data/builtInRecipes';
import { getRecipeImageUrls } from '../../services/recipeService';
// imageCacheService no longer needed — expo-image handles caching

const builtInIds = new Set(BUILTIN_RECIPES.map((r) => r.id));
import { getRecipeCardImage } from '../../src/data/recipeImages';
import { loadRecipeImages } from '../../services/imageGenerationService';
import type { ImageSourcePropType } from 'react-native';

/** Protein header images — keyed by protein ID */
const PROTEIN_HEADER_IMAGES: Record<string, ImageSourcePropType> = {
  chicken: require('../../assets/images/Protein/Chicken.jpg'),
  beef: require('../../assets/images/Protein/Beef.jpg'),
  lamb: require('../../assets/images/Protein/Lamb.jpg'),
  goat: require('../../assets/images/Protein/goat.jpg'),
  pork: require('../../assets/images/Protein/Pork.jpg'),
  fish: require('../../assets/images/Protein/Fish.jpg'),
  prawns: require('../../assets/images/Protein/Prawn.jpg'),
  eggs: require('../../assets/images/Protein/Egg.jpg'),
  paneer: require('../../assets/images/Protein/paneer.png'),
  tofu: require('../../assets/images/Protein/Tofu.jpg'),
  soy: require('../../assets/images/Protein/Soy.jpg'),
  beans: require('../../assets/images/Protein/Beans.jpg'),
  milk: require('../../assets/images/Protein/Dairy.jpg'),
  whey: require('../../assets/images/Protein/ProteinPowder.jpg'),
};
import { getRatings, getFavourites, toggleFavourite, getCookCounts, type RatingsMap, type CookCountMap } from '../../src/store/ratingsFavourites';
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
  const [cookCounts, setCookCounts] = useState<CookCountMap>({});

  // AI dish images for recipe cards (keyed by recipeId -> local URI)
  const [aiDishImages, setAiDishImages] = useState<Record<string, string>>({});

  // Supabase hero image URIs (keyed by recipeId -> local cached URI)
  const [supabaseHeroImages, setSupabaseHeroImages] = useState<Record<string, string>>({});

  // Loading state for skeleton
  const [hasLoaded, setHasLoaded] = useState(false);

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
      const load = async () => {
        const [result, ratingsMap, favouritesList, cookCountsMap] = await Promise.all([
          getAllRecipesForProteinWithRefresh(proteinId),
          getRatings(),
          getFavourites(),
          getCookCounts(),
        ]);

        if (cancelled) return;
        setRecipes(result.recipes);
        setRatings(ratingsMap);
        setFavourites(favouritesList);
        setCookCounts(cookCountsMap);
        setHasLoaded(true);

        // Load recipe images with type-aware fallback chains:
        // Native recipes (curated): Supabase Storage → built-in static → emoji
        // AI recipes (user-generated): AI-generated → Supabase Storage → emoji
        const loadDishImages = async (allRecipes: SavedRecipe[]) => {
          const dishImgs: Record<string, string> = {};
          const heroImgs: Record<string, string> = {};

          // Helper: try loading Supabase hero image URL (expo-image caches automatically)
          const trySupabaseHero = async (id: string) => {
            try {
              const urls = await getRecipeImageUrls(id);
              if (urls.heroUrl) {
                heroImgs[id] = urls.heroUrl;
              }
            } catch { /* skip */ }
          };

          // Native/curated recipes: Supabase Storage → built-in static → emoji
          const nativeRecipes = allRecipes.filter((r) => builtInIds.has(r.id) || r.id.startsWith('spicestrong-'));
          await Promise.all(nativeRecipes.map((r) => trySupabaseHero(r.id)));

          // AI recipes: AI-generated → Supabase Storage → emoji
          const aiRecipes = allRecipes.filter((r) => !builtInIds.has(r.id) && !r.id.startsWith('spicestrong-'));
          await Promise.all(aiRecipes.map(async (r) => {
            const imgs = await loadRecipeImages(r.id);
            if (imgs?.dishImage) {
              dishImgs[r.id] = imgs.dishImage;
            } else {
              await trySupabaseHero(r.id);
            }
          }));

          if (!cancelled) {
            setAiDishImages(dishImgs);
            setSupabaseHeroImages(heroImgs);
          }
        };

        await loadDishImages(result.recipes);

        // Background refresh from Supabase (stale-while-revalidate)
        result.refresh.then(async (fresh) => {
          if (cancelled || !fresh) return;
          setRecipes(fresh);
          await loadDishImages(fresh);
        });
      };
      load();
      return () => { cancelled = true; };
    }, [proteinId])
  );

  // Poll for building recipes — refresh when they become ready
  useEffect(() => {
    const hasBuilding = recipes.some((r) => r.status === 'building');
    if (!hasBuilding) return;

    const interval = setInterval(async () => {
      const allRecipes = await getAllRecipesForProtein(proteinId);
      const stillBuilding = allRecipes.some((r) => r.status === 'building');
      setRecipes(allRecipes);

      // Reload AI dish images when recipes finish building
      if (!stillBuilding) {
        const aiRecipes = allRecipes.filter((r) => !builtInIds.has(r.id));
        const dishImgs: Record<string, string> = {};
        await Promise.all(aiRecipes.map(async (r) => {
          const imgs = await loadRecipeImages(r.id);
          if (imgs?.dishImage) dishImgs[r.id] = imgs.dishImage;
        }));
        setAiDishImages(dishImgs);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [recipes, proteinId]);

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

  // Clear cache and re-fetch community ratings every time screen gains focus
  useFocusEffect(
    useCallback(() => {
      // Clear cache so fresh data is fetched (e.g., after user submits a review)
      communityRatingsCache.current = {};
      setCommunityRatings({});
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
    const builtInImage = getRecipeCardImage(item.id);
    const aiDishUri = aiDishImages[item.id];
    const supabaseHeroUri = supabaseHeroImages[item.id];
    const isNativeRecipe = builtInIds.has(item.id) || item.id.startsWith('spicestrong-');
    // Native recipes: Supabase Storage → built-in static → emoji
    // AI recipes: AI-generated → Supabase Storage → emoji
    const cardImage = isNativeRecipe
      ? (supabaseHeroUri ? { uri: supabaseHeroUri } : builtInImage)
      : (aiDishUri ? { uri: aiDishUri } : supabaseHeroUri ? { uri: supabaseHeroUri } : null);
    // Nutrition is stored as whole "2-3 servings" batch — divide by 2.5 for per-serving card display
    // Nutrition is stored as whole "2-3 servings" batch — show batch values on card
    const nutritionData = (item as SavedRecipe & { nutrition?: NutritionInfo }).nutrition ?? null;
    const batchProteinG = nutritionData?.proteinG ?? item.aiNutrition?.proteinG ?? null;
    const cardNutrition: CardNutrition | undefined = nutritionData ? {
      calories: nutritionData.calories,
      proteinG: nutritionData.proteinG,
      fatG: nutritionData.fatG,
      carbsG: nutritionData.carbsG,
      fiberG: nutritionData.fiberG,
      sugarG: nutritionData.sugarG,
      sodiumMg: nutritionData.sodiumMg,
    } : undefined;
    // Use community rating if available, fall back to personal rating
    const community = communityRatings[item.id];
    const ratingValue = community?.averageRating ?? ratings[item.id];
    const ratingString = ratingValue != null && ratingValue >= 1 ? Number(ratingValue).toFixed(1) : undefined;
    const ratingCount = community?.totalCount;
    const isLoading = communityLoading[item.id] ?? false;
    const description = item.description ?? item.chefTip ?? '';

    return (
      <RecipeCard
        name={item.name}
        description={description}
        time={timeMinutes != null ? `${timeMinutes} min` : '—'}
        protein={batchProteinG != null ? `${batchProteinG}g protein` : ''}
        difficulty={cardDifficulty}
        rating={ratingString}
        communityCount={ratingCount}
        communityLoading={isLoading}
        cookCount={item.communityCookCount || cookCounts[item.id] || 0}
        emoji={item.proteinEmoji ?? '🍽️'}
        imageSource={cardImage}
        isFavorite={favourites.includes(item.id)}
        onPress={() =>
          router.push({
            pathname: '/screens/RecipeOverviewScreen',
            params: { recipeId: item.id, quantityTier: (selectedTierByRecipeId[item.id] ?? '2-3 servings') },
          })
        }
        onFavoriteToggle={(e) => handleToggleFavourite(item.id, e)}
        onRatingPress={() => handleRatingPress(item.id, item.name)}
        accentColors={gradient}
        nutrition={cardNutrition}
        isBuilding={item.status === 'building'}
        actionRow={
          !builtInIds.has(item.id) && !item.id.startsWith('spicestrong-') ? (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={(e) => {
                e.stopPropagation();
                handleDelete(item);
              }}
            >
              <Text style={styles.deleteBtnText}>🗑</Text>
            </TouchableOpacity>
          ) : undefined
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
      source={require('../../assets/images/splash-bg.jpg')}
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
          <View style={styles.headerHero}>
            <View style={styles.headerProteinIconWrap}>
              <LinearGradient
                colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.12)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerProteinIconShine}
              />
              <View style={styles.headerProteinIcon}>
                {proteinId && PROTEIN_HEADER_IMAGES[proteinId] ? (
                  <Image source={PROTEIN_HEADER_IMAGES[proteinId]} style={styles.headerProteinImage} />
                ) : (
                  <Text style={styles.headerEmoji}>{proteinEmoji}</Text>
                )}
              </View>
            </View>
            <Text style={styles.headerProteinName}>{proteinName}</Text>
          </View>
          <Text style={styles.headerSubtitle}>High-protein recipes</Text>
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
            <Image source={require('../../assets/images/icon.png')} style={styles.actionCardIcon} />
            <Text style={styles.actionCardTitle}>Build with SpiceBuilder</Text>
            <Text style={styles.actionCardSub}>Generate a custom recipe</Text>
          </TouchableOpacity>
        </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !hasLoaded ? (
            <View style={styles.skeletonWrap}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={styles.skeletonCard}>
                  <View style={styles.skeletonImage} />
                  <View style={styles.skeletonLines}>
                    <View style={[styles.skeletonLine, { width: '70%' }]} />
                    <View style={[styles.skeletonLine, { width: '50%' }]} />
                    <View style={[styles.skeletonLine, { width: '40%' }]} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>🍽️</Text>
              <Text style={styles.emptyTitle}>No recipes yet</Text>
              <Text style={styles.emptySub}>Use "Build with SpiceBuilder" to create your first {proteinName} recipe!</Text>
            </View>
          )
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
    paddingBottom: 10,
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
  headerProteinImage: {
    width: 72,
    height: 72,
    borderRadius: 20,
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
    fontSize: 20,
    color: CREAM_LABEL,
    textAlign: 'center',
    marginBottom: 4,
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
    backgroundColor: 'rgba(232, 93, 38, 0.85)',
    borderRadius: 16,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,1)',
    borderLeftColor: 'rgba(255,255,255,0.9)',
    borderBottomColor: 'rgba(180,120,60,0.3)',
    borderRightColor: 'rgba(180,120,60,0.2)',
    ...Platform.select({
      ios: { shadowColor: 'rgba(100,40,0,0.9)', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 10 },
    }),
  },
  actionCardEmoji: { fontSize: 28, marginBottom: 4 },
  actionCardIcon: { width: 36, height: 36, borderRadius: 18, marginBottom: 4 },
  actionCardTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 17, textAlign: 'center' },
  actionCardSub: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 13, textAlign: 'center', marginTop: 2 },
  tabPill: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 28,
    backgroundColor: TAB_INACTIVE,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    borderTopColor: 'rgba(255,255,255,0.5)',
    borderLeftColor: 'rgba(255,255,255,0.4)',
    borderBottomColor: 'rgba(255,255,255,0.15)',
    borderRightColor: 'rgba(255,255,255,0.2)',
  },
  tabPillActive: {
    backgroundColor: TAB_ACTIVE_BG,
    borderColor: 'rgba(232,93,38,0.5)',
    borderTopColor: 'rgba(255,255,255,0.4)',
    borderLeftColor: 'rgba(255,255,255,0.3)',
    borderBottomColor: 'rgba(232,93,38,0.3)',
    borderRightColor: 'rgba(232,93,38,0.4)',
  },
  tabPillText: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  tabPillTextActive: { color: '#FFFFFF', fontWeight: '700' },

  list: { paddingHorizontal: 0, paddingVertical: 12, paddingBottom: 44 },
  actionRow: { flexDirection: 'row', gap: 10 },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { fontSize: 16 },

  // Loading skeleton
  skeletonWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  skeletonCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 14,
    gap: 14,
  },
  skeletonImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  skeletonLines: {
    flex: 1,
    justifyContent: 'center',
    gap: 10,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

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
