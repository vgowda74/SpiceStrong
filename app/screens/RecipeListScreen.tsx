import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const screenWidth = Dimensions.get('window').width;

import RecipeCard, { type RecipeDifficulty, type CardNutrition } from '../../components/RecipeCard';
import { CommunityReviewsModal } from '../../components/CommunityReviewsModal';
import { getAllRecipesForProteinWithRefresh, getAllRecipesForProtein, getCompletionStats, SavedRecipe, QUANTITY_TIERS, type QuantityTier, type MealType, SERVINGS_PER_TIER } from '../../src/store/recipes';
import { type NutritionInfo, BUILTIN_RECIPES } from '../../src/data/builtInRecipes';
import { getRecipeImageUrls, deleteAIRecipe } from '../../services/recipeService';
import { getDietaryRestrictions, applyDietaryFilter } from '../../services/dietaryService';
import { getPantryIngredientNames } from '../../services/pantryService';
import {
  addToMealPlan,
  getMealPlanForDate,
  SLOT_LABELS,
  SLOT_LIMITS,
  type MealSlot,
} from '../../services/mealPlanService';
import { isAdmin } from '../../services/adminService';
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
import { ProfileMenu } from '../../components/ProfileMenu';
import { getRecipeRatings, type RecipeRatings } from '../../services/ratingsService';
import { submitRecipeForReview } from '../../services/recipeReviewService';
import { saveRecipe as saveLocalRecipe } from '../../src/store/recipes';
// AsyncStorage no longer needed — deleteAIRecipe handles all cleanup

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
  const params = useLocalSearchParams<{
    proteinId: string;
    proteinName: string;
    proteinEmoji: string;
    // Filter params returned from RecipeFilterScreen
    filterApplied?: string;
    f_fitnessGoal?: string;
    f_proteinRange?: string;
    f_carbsRange?: string;
    f_fatRange?: string;
    f_spiceLevel?: string;
    f_cookingTime?: string;
    f_difficulty?: string;
    f_meatType?: string;
    f_cookingMethod?: string;
    f_cuisine?: string;
    f_calorieRange?: string;
    f_mealPrep?: string;
  }>();
  const { proteinId, proteinName, proteinEmoji } = params;

  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const [isAdminUser, setIsAdminUser] = useState(false);
  useEffect(() => { isAdmin().then(setIsAdminUser); }, []);
  const [selectedTierByRecipeId, setSelectedTierByRecipeId] = useState<Record<string, QuantityTier>>({});
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [pantryNames, setPantryNames] = useState<string[]>([]);
  const [pantryFilterOn, setPantryFilterOn] = useState(false);
  // ── Advanced filter state (set via RecipeFilterScreen) ──
  const [filterFitnessGoal, setFilterFitnessGoal] = useState<string | null>(null);
  const [filterProteinRange, setFilterProteinRange] = useState<string | null>(null);
  const [filterCarbsRange, setFilterCarbsRange] = useState<string | null>(null);
  const [filterFatRange, setFilterFatRange] = useState<string | null>(null);
  const [filterSpice, setFilterSpice] = useState<string | null>(null);
  const [filterTime, setFilterTime] = useState<string | null>(null);
  const [filterDifficulty, setFilterDifficulty] = useState<string | null>(null);
  const [filterMeatType, setFilterMeatType] = useState<string | null>(null);
  const [filterCookingMethod, setFilterCookingMethod] = useState<string | null>(null);
  const [filterCuisine, setFilterCuisine] = useState<string | null>(null);
  const [filterCalorieRange, setFilterCalorieRange] = useState<string | null>(null);
  const [filterMealPrep, setFilterMealPrep] = useState<string[]>([]);

  // ── Meal Plan modal state ──
  const [mealPlanRecipe, setMealPlanRecipe] = useState<SavedRecipe | null>(null);
  const [mealPlanOpen, setMealPlanOpen] = useState(false);
  const [mpSelectedDate, setMpSelectedDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [mpCalMonth, setMpCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [mpSelectedSlot, setMpSelectedSlot] = useState<MealSlot | null>(null);
  const [mpSlotCounts, setMpSlotCounts] = useState<Record<MealSlot, number>>({ breakfast: 0, lunch_dinner: 0, snack_dessert: 0 });
  const [mpAdding, setMpAdding] = useState(false);
  const mpSlideAnim = useRef(new Animated.Value(300)).current;

  const mpToday = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const MP_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  useEffect(() => {
    if (!mealPlanOpen) return;
    getMealPlanForDate(mpSelectedDate).then((entries) => {
      const counts: Record<MealSlot, number> = { breakfast: 0, lunch_dinner: 0, snack_dessert: 0 };
      entries.forEach((e) => { counts[e.slot] = (counts[e.slot] ?? 0) + 1; });
      setMpSlotCounts(counts);
    });
  }, [mpSelectedDate, mealPlanOpen]);

  const mpCalendarDays = useMemo(() => {
    const { year, month } = mpCalMonth;
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const days: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return days;
  }, [mpCalMonth]);

  const openMealPlan = (recipe: SavedRecipe) => {
    setMealPlanRecipe(recipe);
    setMpSelectedSlot((recipe.mealType as MealSlot) ?? null);
    setMealPlanOpen(true);
    Animated.spring(mpSlideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const closeMealPlan = () => {
    Animated.timing(mpSlideAnim, { toValue: 300, duration: 220, useNativeDriver: true }).start(() => {
      setMealPlanOpen(false);
      setMealPlanRecipe(null);
    });
  };

  const handleAddToMealPlan = async () => {
    if (!mealPlanRecipe || !mpSelectedSlot) return;
    setMpAdding(true);
    const result = await addToMealPlan(mpSelectedDate, mpSelectedSlot, {
      id: mealPlanRecipe.id,
      name: mealPlanRecipe.name,
      proteinName: mealPlanRecipe.proteinName,
      proteinEmoji: mealPlanRecipe.proteinEmoji,
      mealType: mealPlanRecipe.mealType,
    });
    setMpAdding(false);
    if (result.success) {
      closeMealPlan();
      Alert.alert('Added!', `${mealPlanRecipe.name} added to your meal plan.`);
    } else {
      Alert.alert('Slot Full', result.error ?? 'Could not add to meal plan.');
    }
  };

  // Pick up filter params returned from RecipeFilterScreen
  useEffect(() => {
    if (params.filterApplied !== 'true') return;
    const str = (v?: string) => (v && v.length > 0) ? v : null;
    const arr = (v?: string): string[] => {
      if (!v || v === '[]') return [];
      try { return JSON.parse(v); } catch { return []; }
    };
    setFilterFitnessGoal(str(params.f_fitnessGoal));
    setFilterProteinRange(str(params.f_proteinRange));
    setFilterCarbsRange(str(params.f_carbsRange));
    setFilterFatRange(str(params.f_fatRange));
    setFilterSpice(str(params.f_spiceLevel));
    setFilterTime(str(params.f_cookingTime));
    setFilterDifficulty(str(params.f_difficulty));
    setFilterMeatType(str(params.f_meatType));
    setFilterCookingMethod(str(params.f_cookingMethod));
    setFilterCuisine(str(params.f_cuisine));
    setFilterCalorieRange(str(params.f_calorieRange));
    setFilterMealPrep(arr(params.f_mealPrep));
    console.log('[SpiceStrong] Filters applied:', {
      fitnessGoal: str(params.f_fitnessGoal),
      difficulty: str(params.f_difficulty),
      spice: str(params.f_spiceLevel),
      time: str(params.f_cookingTime),
    });
  }, [params.filterApplied, params.f_fitnessGoal, params.f_proteinRange, params.f_carbsRange, params.f_fatRange, params.f_spiceLevel, params.f_cookingTime, params.f_difficulty, params.f_meatType, params.f_cookingMethod, params.f_cuisine, params.f_calorieRange, params.f_mealPrep]);

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
        const [result, ratingsMap, favouritesList, cookCountsMap, dietary, pantryNamesArr] = await Promise.all([
          getAllRecipesForProteinWithRefresh(proteinId),
          getRatings(),
          getFavourites(),
          getCookCounts(),
          getDietaryRestrictions(),
          getPantryIngredientNames(),
        ]);
        setPantryNames(pantryNamesArr);

        if (cancelled) return;
        // Filter out deleted, stuck building recipes (>10min old), + apply dietary restrictions
        const tenMinAgo = Date.now() - 10 * 60 * 1000;
        const filtered_initial = applyDietaryFilter(
          result.recipes.filter(r =>
            !deletedIdsRef.current.has(r.id) &&
            !(r.status === 'building' && r.createdAt < tenMinAgo)
          ),
          dietary
        );
        setRecipes(filtered_initial);
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
          const nativeRecipes = allRecipes.filter((r) => builtInIds.has(r.id) || r.id.startsWith('spicestrong-') || r.id.startsWith('curated-'));
          await Promise.all(nativeRecipes.map((r) => trySupabaseHero(r.id)));

          // AI recipes: AI-generated → Supabase Storage → emoji
          const aiRecipes = allRecipes.filter((r) => !builtInIds.has(r.id) && !r.id.startsWith('spicestrong-') && !r.id.startsWith('curated-'));
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
          // Filter out deleted, stuck building recipes, + apply dietary restrictions
          const filtered_fresh = applyDietaryFilter(
            fresh.filter(r =>
              !deletedIdsRef.current.has(r.id) &&
              !(r.status === 'building' && r.createdAt < tenMinAgo)
            ),
            dietary
          );
          setRecipes(filtered_fresh);
          await loadDishImages(filtered_fresh);
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
              const success = await deleteAIRecipe(recipe.id, recipe.proteinId);
              if (success) {
                // Track deleted ID so background refresh can't bring it back
                deletedIdsRef.current.add(recipe.id);
                setRecipes((prev) => prev.filter((r) => r.id !== recipe.id));
              }
            } catch (e) {
              console.error('Delete failed', e);
            }
          },
        },
      ]
    );
  };

  const handleToggleFavourite = useCallback(async (recipeId: string, e?: { stopPropagation: () => void }) => {
    e?.stopPropagation();
    const nowFav = await toggleFavourite(recipeId);
    setFavourites((prev) =>
      nowFav ? [...prev, recipeId] : prev.filter((id) => id !== recipeId)
    );
  }, []);

  const handleLongPress = (item: SavedRecipe) => {
    const isCurated = item.source === 'curated' || item.id.startsWith('spicestrong-') || item.id.startsWith('curated-');
    const isOwn = item.source === 'user' || item.source === 'ai';

    const isApproved = item.reviewResult?.approved === true;

    const isFav = favourites.includes(item.id);

    const options: { text: string; onPress?: () => void; style?: 'destructive' | 'cancel' }[] = [
      // Favorite
      {
        text: isFav ? '★ Remove from Favourites' : '☆ Add to Favourites',
        onPress: () => handleToggleFavourite(item.id),
      },
      // Add to Meal Plan
      {
        text: '📅 Add to Meal Plan',
        onPress: () => openMealPlan(item),
      },
      // Edit
      {
        text: isCurated ? '✏️ Edit as Copy' : '✏️ Edit',
        onPress: () => {
          if (isCurated) {
            const copyId = `copy-${Date.now()}`;
            router.push({
              pathname: '/screens/AddRecipeScreen',
              params: {
                proteinId: item.proteinId,
                proteinName: item.proteinName,
                proteinEmoji: item.proteinEmoji,
                editRecipeId: item.id,
                copyAsNew: 'true',
                copyId,
              },
            });
          } else {
            router.push({
              pathname: '/screens/AddRecipeScreen',
              params: {
                proteinId: item.proteinId,
                proteinName: item.proteinName,
                proteinEmoji: item.proteinEmoji,
                editRecipeId: item.id,
              },
            });
          }
        },
      },
    ];

    // ── Delete logic ──
    // Admin: can delete ANY recipe (curated via Supabase soft-delete, own via local)
    // Regular users: can only delete their own recipes (user/ai source)
    if (isAdminUser || isOwn) {
      options.push({
        text: '🗑 Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete Recipe', `Delete "${item.name}"?${isCurated ? '\n\nThis will remove it for all users.' : ''}`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  // Curated recipes: soft-delete from Supabase (admin only)
                  if (isCurated && isAdminUser) {
                    const serviceKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
                    const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/recipes?id=eq.${item.id}`;
                    const res = await fetch(url, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        'apikey': serviceKey!,
                        'Authorization': `Bearer ${serviceKey}`,
                        'Prefer': 'return=minimal',
                      },
                      body: JSON.stringify({ is_active: false }),
                    });
                    if (!res.ok) {
                      const errText = await res.text().catch(() => '');
                      throw new Error(errText || `HTTP ${res.status}`);
                    }
                  }
                  // All deletes: add to local blocklist + remove from UI
                  deletedIdsRef.current.add(item.id);
                  setRecipes((prev) => prev.filter((r) => r.id !== item.id));
                  try {
                    await AsyncStorage.setItem('spicestrong_deleted_recipes',
                      JSON.stringify(Array.from(deletedIdsRef.current)));
                  } catch {}
                  // Clear recipe caches
                  try {
                    const allKeys = await AsyncStorage.getAllKeys();
                    const cacheKeys = allKeys.filter(k => k.startsWith('spicestrong_recipe_cache_'));
                    if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys);
                  } catch {}
                  Alert.alert('Deleted', `"${item.name}" removed.`);
                } catch (e: any) {
                  Alert.alert('Error', e?.message || 'Could not delete.');
                }
              },
            },
          ]);
        },
      });
    }

    // ── Publish (admin only) ──
    // Admin can publish any recipe as curated (visible to all users)
    if (isAdminUser && isOwn) {
      options.push({
        text: '🚀 Publish for Everyone',
        onPress: () => {
          Alert.alert('Publish Recipe', `Make "${item.name}" visible to all users?`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Publish',
              onPress: async () => {
                try {
                  const { saveAIRecipe, classifyAndEnrichRecipe, uploadRecipeHeroImage } = require('../../services/recipeService');
                  (item as any).source = 'curated';
                  await saveAIRecipe(item);
                  try { await classifyAndEnrichRecipe(item); } catch {}
                  Alert.alert('Published!', `"${item.name}" is now live for all users.`);
                } catch (e: any) {
                  Alert.alert('Publish Failed', e?.message || 'Could not publish.');
                }
              },
            },
          ]);
        },
      });
    }

    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(item.name, 'What would you like to do?', options);
  };

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
    const isNativeRecipe = builtInIds.has(item.id) || item.id.startsWith('spicestrong-') || item.id.startsWith('curated-');
    // Native recipes: Supabase Storage → built-in static → emoji
    // AI recipes: AI-generated → Supabase Storage → emoji
    const cardImage = isNativeRecipe
      ? (supabaseHeroUri ? { uri: supabaseHeroUri } : builtInImage)
      : (aiDishUri ? { uri: aiDishUri } : supabaseHeroUri ? { uri: supabaseHeroUri } : null);
    // All nutrition displayed as PER SERVING using getCompletionStats
    const stats = getCompletionStats(item, '2-3 servings');
    // Pipeline per-serving values (from Edamam via classification pipeline) — already per-serving
    const pCal = item.pipelineCalories;
    const pPro = item.pipelineProteinG;
    const pFat = item.pipelineFatG;
    const pCarb = item.pipelineCarbsG;

    const cardNutrition: CardNutrition | undefined = (pCal || pPro) ? {
      calories: pCal ?? 0,
      proteinG: pPro ?? 0,
      fatG: pFat ?? 0,
      carbsG: pCarb ?? 0,
      fiberG: 0,
      sugarG: 0,
      sodiumMg: 0,
    } : stats.calories > 0 ? {
      calories: stats.calories,
      proteinG: stats.proteinG,
      fatG: stats.fatG,
      carbsG: stats.carbsG,
      fiberG: stats.fiberG,
      sugarG: stats.sugarG,
      sodiumMg: stats.sodiumMg,
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
        protein={stats.proteinG > 0 ? `${stats.proteinG}g protein` : '—'}
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
        onLongPress={() => handleLongPress(item)}
        onRatingPress={() => handleRatingPress(item.id, item.name)}
        accentColors={gradient}
        nutrition={cardNutrition}
        isBuilding={item.status === 'building'}
      />
    );
  };

  const activeFilterCount = [
    filterFitnessGoal, filterProteinRange, filterCarbsRange, filterFatRange,
    filterSpice, filterTime, filterDifficulty, filterMeatType,
    filterCookingMethod, filterCuisine, filterCalorieRange,
  ].filter(Boolean).length + filterMealPrep.length;

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

    // ── Pantry filter (checkbox, applied on top of any tab) ──
    if (pantryFilterOn && pantryNames.length > 0) {
      filtered = filtered.filter((r) => {
        const recipeIngs = (r.ingredients?.['2-3 servings'] ?? []).map((i) => i.name.toLowerCase());
        if (recipeIngs.length === 0) return false;
        const matched = recipeIngs.filter((ing) =>
          pantryNames.some((pn) => ing.includes(pn) || pn.includes(ing))
        );
        return matched.length >= recipeIngs.length * 0.5;
      });
    }

    // ── Apply advanced filters ──
    // Helper: get per-serving nutrition (pipeline values first, then getCompletionStats)
    const perServing = (r: SavedRecipe) => {
      const s = getCompletionStats(r, '2-3 servings');
      return {
        protein: r.pipelineProteinG ?? s.proteinG,
        carbs: r.pipelineCarbsG ?? s.carbsG,
        fat: r.pipelineFatG ?? s.fatG,
        calories: r.pipelineCalories ?? s.calories,
      };
    };

    // Difficulty
    if (filterDifficulty) {
      filtered = filtered.filter(r => r.difficulty?.toLowerCase() === filterDifficulty.toLowerCase());
    }
    // Spice level
    if (filterSpice) {
      filtered = filtered.filter(r => {
        const sl = r.spiceLevel || '';
        return sl.toLowerCase() === filterSpice.toLowerCase();
      });
    }
    // Cooking time
    if (filterTime) {
      filtered = filtered.filter(r => {
        const t = r.timeMinutes ?? 0;
        if (filterTime === 'under15') return t > 0 && t <= 15;
        if (filterTime === '15to30') return t > 15 && t <= 30;
        if (filterTime === '30to60') return t > 30 && t <= 60;
        if (filterTime === '60plus') return t > 60;
        return true;
      });
    }
    // Protein range (per serving)
    if (filterProteinRange) {
      filtered = filtered.filter(r => {
        const pg = perServing(r).protein;
        if (pg === 0) return false; // no data = skip
        if (filterProteinRange === 'Under 20g') return pg < 20;
        if (filterProteinRange === '20-29g') return pg >= 20 && pg < 30;
        if (filterProteinRange === '30-39g') return pg >= 30 && pg < 40;
        if (filterProteinRange === '40g+') return pg >= 40;
        return true;
      });
    }
    // Carbs range (per serving)
    if (filterCarbsRange) {
      filtered = filtered.filter(r => {
        const cg = perServing(r).carbs;
        if (filterCarbsRange === 'Under 20g') return cg < 20;
        if (filterCarbsRange === '20-50g') return cg >= 20 && cg <= 50;
        if (filterCarbsRange === '50g+') return cg > 50;
        return true;
      });
    }
    // Fat range (per serving)
    if (filterFatRange) {
      filtered = filtered.filter(r => {
        const fg = perServing(r).fat;
        if (filterFatRange === 'Under 10g') return fg < 10;
        if (filterFatRange === '10-19g') return fg >= 10 && fg < 20;
        if (filterFatRange === '20g+') return fg >= 20;
        return true;
      });
    }
    // Calorie range (per serving)
    if (filterCalorieRange) {
      filtered = filtered.filter(r => {
        const cal = perServing(r).calories;
        if (cal === 0) return false;
        if (filterCalorieRange === 'under300') return cal < 300;
        if (filterCalorieRange === '300to500') return cal >= 300 && cal <= 500;
        if (filterCalorieRange === '500to700') return cal > 500 && cal <= 700;
        if (filterCalorieRange === '700plus') return cal > 700;
        return true;
      });
    }
    // Cuisine (check both cuisine and cuisineType fields)
    if (filterCuisine) {
      filtered = filtered.filter(r => {
        const c = r.cuisineType || r.cuisine || '';
        return c.toLowerCase().includes(filterCuisine.toLowerCase());
      });
    }
    // Cooking method
    if (filterCookingMethod) {
      filtered = filtered.filter(r => {
        const m = r.cookingMethod || '';
        return m.toLowerCase().includes(filterCookingMethod.toLowerCase());
      });
    }
    // Meal prep / storage tags
    if (filterMealPrep.length > 0) {
      filtered = filtered.filter(r => {
        const tags = (r.storageTags || []).map((t: string) => t.toLowerCase());
        return filterMealPrep.every(m => tags.some(t => t.includes(m.toLowerCase())));
      });
    }

    return filtered;
  }, [recipes, activeFilter, ratings, favourites, pantryNames, pantryFilterOn,
    filterDifficulty, filterSpice, filterTime, filterFitnessGoal,
    filterProteinRange, filterCarbsRange, filterFatRange, filterMeatType,
    filterCookingMethod, filterCuisine,
    filterCalorieRange, filterMealPrep]);

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
            {/* Advanced filter icon */}
            <TouchableOpacity
              style={[styles.filterIconBtn, activeFilterCount > 0 && styles.filterIconBtnActive]}
              onPress={() => router.push({
                pathname: '/screens/RecipeFilterScreen',
                params: {
                  proteinId,
                  proteinName,
                  proteinEmoji,
                  fitnessGoal: filterFitnessGoal || '',
                  proteinRange: filterProteinRange || '',
                  carbsRange: filterCarbsRange || '',
                  fatRange: filterFatRange || '',
                  spiceLevel: filterSpice || '',
                  cookingTime: filterTime || '',
                  difficulty: filterDifficulty || '',
                  meatType: filterMeatType || '',
                  cookingMethod: filterCookingMethod || '',
                  cuisine: filterCuisine || '',
                  calorieRange: filterCalorieRange || '',
                  mealPrep: JSON.stringify(filterMealPrep),
                },
              })}
              activeOpacity={0.85}
            >
              <View style={styles.filterSliderIcon}>
                <View style={styles.filterSliderRow}>
                  <View style={styles.filterSliderBar} />
                  <View style={[styles.filterSliderDot, { left: '65%' }]} />
                </View>
                <View style={styles.filterSliderRow}>
                  <View style={styles.filterSliderBar} />
                  <View style={[styles.filterSliderDot, { left: '30%' }]} />
                </View>
                <View style={styles.filterSliderRow}>
                  <View style={styles.filterSliderBar} />
                  <View style={[styles.filterSliderDot, { left: '55%' }]} />
                </View>
              </View>
              {activeFilterCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
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

        {/* Pantry filter checkbox */}
        {pantryNames.length > 0 && (
          <TouchableOpacity
            style={[styles.pantryCheckRow, pantryFilterOn && styles.pantryCheckRowOn]}
            onPress={() => setPantryFilterOn(!pantryFilterOn)}
            activeOpacity={0.75}
          >
            {/* Vegetable emoji background */}
            <Text style={styles.pantryBgText}>🥬🥕🍅🥦🌽🫑🧅🥑</Text>
            <View style={styles.pantryCheckContent}>
              <View style={[styles.pantryCheckBox, pantryFilterOn && styles.pantryCheckBoxOn]}>
                {pantryFilterOn && <Text style={styles.pantryCheckMark}>✓</Text>}
              </View>
              <View style={styles.pantryCheckTextBlock}>
                <Text style={[styles.pantryCheckLabel, pantryFilterOn && styles.pantryCheckLabelOn]}>
                  Cook with my pantry only
                </Text>
                <Text style={styles.pantryItemCount}>{pantryNames.length} items in your pantry</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Filter modal removed — now using full-screen RecipeFilterScreen */}


      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
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
      {/* Meal Plan Modal */}
      <Modal visible={mealPlanOpen} transparent animationType="none" onRequestClose={closeMealPlan} statusBarTranslucent>
        <Pressable style={styles.mpBackdrop} onPress={closeMealPlan}>
          <Animated.View style={[styles.mpSheet, { transform: [{ translateY: mpSlideAnim }] }]}>
            <Pressable onPress={() => {}}>
              <View style={styles.mpHandle} />
              <Text style={styles.mpTitle}>
                {mealPlanRecipe ? `Add "${mealPlanRecipe.name.replace(/^High-Protein\s+/i, '')}"` : 'Add to Meal Plan'}
              </Text>

              {/* Month navigator */}
              <View style={styles.mpMonthRow}>
                <TouchableOpacity
                  onPress={() => setMpCalMonth(({ year, month }) => month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 })}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.mpNavArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.mpMonthLabel}>
                  {MP_MONTH_NAMES[mpCalMonth.month - 1]} {mpCalMonth.year}
                </Text>
                <TouchableOpacity
                  onPress={() => setMpCalMonth(({ year, month }) => month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 })}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.mpNavArrow}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Day headers */}
              <View style={styles.mpDayHeaders}>
                {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => (
                  <Text key={d} style={styles.mpDayHeader}>{d}</Text>
                ))}
              </View>

              {/* Calendar grid */}
              <View style={styles.mpGrid}>
                {mpCalendarDays.map((date, idx) => {
                  if (!date) return <View key={`empty-${idx}`} style={styles.mpDayCell} />;
                  const isToday = date === mpToday;
                  const isSelected = date === mpSelectedDate;
                  const isPast = date < mpToday;
                  return (
                    <TouchableOpacity
                      key={date}
                      style={[
                        styles.mpDayCell,
                        isToday && styles.mpDayCellToday,
                        isSelected && styles.mpDayCellSelected,
                        isPast && styles.mpDayCellPast,
                      ]}
                      onPress={() => !isPast && setMpSelectedDate(date)}
                      activeOpacity={isPast ? 1 : 0.7}
                    >
                      <Text style={[
                        styles.mpDayNum,
                        isSelected && styles.mpDayNumSelected,
                        isPast && styles.mpDayNumPast,
                      ]}>
                        {parseInt(date.split('-')[2], 10)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Slot selector */}
              <Text style={styles.mpSlotLabel}>MEAL SLOT</Text>
              {(Object.keys(SLOT_LABELS) as MealSlot[]).map((slot) => {
                const count = mpSlotCounts[slot] ?? 0;
                const limit = SLOT_LIMITS[slot];
                const full = count >= limit;
                const selected = mpSelectedSlot === slot;
                const isRecommended = mealPlanRecipe?.mealType === slot;
                const notRecommended = !!mealPlanRecipe?.mealType && !isRecommended;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[
                      styles.mpSlot,
                      selected && styles.mpSlotSelected,
                      full && styles.mpSlotFull,
                      notRecommended && styles.mpSlotDimmed,
                    ]}
                    onPress={() => !full && setMpSelectedSlot(slot)}
                    activeOpacity={full ? 1 : 0.75}
                  >
                    <View style={styles.mpSlotLeft}>
                      <Text style={[styles.mpSlotText, selected && styles.mpSlotTextSelected, full && styles.mpSlotTextFull]}>
                        {SLOT_LABELS[slot]}
                      </Text>
                      {isRecommended && (
                        <View style={styles.mpSlotBadge}>
                          <Text style={styles.mpSlotBadgeText}>Recommended</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.mpSlotCount}>{count}/{limit}</Text>
                  </TouchableOpacity>
                );
              })}

              {/* Confirm */}
              <TouchableOpacity
                style={[styles.mpConfirmBtn, (!mpSelectedSlot || mpAdding) && styles.mpConfirmBtnDisabled]}
                onPress={handleAddToMealPlan}
                disabled={!mpSelectedSlot || mpAdding}
                activeOpacity={0.8}
              >
                <Text style={styles.mpConfirmText}>{mpAdding ? 'Adding…' : 'Add to Meal Plan'}</Text>
              </TouchableOpacity>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
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
  // SpiceBuilder hero card
  spiceBuilderCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    marginTop: 4,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#E85D26', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  spiceBuilderGradient: {
    borderRadius: 16,
  },
  spiceBuilderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
  },
  spiceBuilderEmoji: { fontSize: 28 },
  spiceBuilderText: { flex: 1 },
  spiceBuilderTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  spiceBuilderSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  spiceBuilderArrow: { fontSize: 24, fontWeight: '700', color: 'rgba(255,255,255,0.60)' },

  actionBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 2,
  },
  actionCard: {
    flex: 1,
    backgroundColor: 'rgba(232, 93, 38, 0.15)',
    borderRadius: 16,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 38, 0.4)',
  },
  actionCardEmoji: { fontSize: 28, marginBottom: 4 },
  actionCardIcon: { width: 36, height: 36, borderRadius: 18, marginBottom: 4 },
  actionCardTitle: { color: '#E85D26', fontWeight: '800', fontSize: 15, textAlign: 'center' },
  actionCardSub: { color: 'rgba(255,255,255,0.6)', fontWeight: '600', fontSize: 12, textAlign: 'center', marginTop: 2 },
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
  pantryCheckRow: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(34,180,70,0.35)',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(34,110,50,0.55)',
  },
  pantryCheckRowOn: {
    backgroundColor: 'rgba(34,140,60,0.70)',
    borderColor: 'rgba(80,220,100,0.70)',
  },
  pantryBgText: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    fontSize: 38,
    letterSpacing: 6,
    lineHeight: 50,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    paddingTop: 4,
    opacity: 0.25,
  },
  pantryCheckContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    zIndex: 1,
    backgroundColor: 'rgba(10,40,20,0.45)',
  },
  pantryCheckTextBlock: { flex: 1 },
  pantryCheckBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.60)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pantryCheckBoxOn: {
    backgroundColor: '#4ADE80',
    borderColor: '#4ADE80',
  },
  pantryCheckMark: { color: '#0A2814', fontSize: 14, fontWeight: '900' },
  pantryCheckLabel: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  pantryCheckLabelOn: { color: '#FFFFFF' },
  pantryItemCount: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.70)', marginTop: 2 },

  // Advanced filter icon button
  filterIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#1A0A00',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterIconBtnActive: {
    backgroundColor: 'rgba(232,93,38,0.2)',
    borderColor: 'rgba(232,93,38,0.5)',
  },
  filterSliderIcon: {
    width: 20,
    height: 16,
    justifyContent: 'space-between',
  },
  filterSliderRow: {
    height: 2,
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
  },
  filterSliderBar: {
    height: 2,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 1,
  },
  filterSliderDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    top: -2,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#E85D26',
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  // Filter modal
  /* Old filter modal styles removed — using full-screen RecipeFilterScreen */

  list: { paddingHorizontal: 0, paddingVertical: 12, paddingBottom: 80 },
  actionRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(232,93,38,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.5)',
  },
  editBtnText: { fontSize: 14 },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { fontSize: 16 },
  publishBtn: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232,93,38,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.5)',
  },
  publishBtnLive: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderColor: 'rgba(34,197,94,0.4)',
  },
  publishBtnPending: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  publishBtnRejected: {
    backgroundColor: 'rgba(232,93,38,0.2)',
    borderColor: 'rgba(232,93,38,0.5)',
  },
  publishBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  publishBtnTextLive: {
    fontSize: 12,
    fontWeight: '700',
    color: '#22C55E',
  },
  publishBtnTextPending: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  publishBtnTextRejected: {
    color: '#E85D26',
  },

  // Meal plan modal
  mpBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  mpSheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  mpHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  mpTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  mpMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  mpNavArrow: { fontSize: 28, color: '#E85D26', fontWeight: '700', lineHeight: 32 },
  mpMonthLabel: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  mpDayHeaders: { flexDirection: 'row', marginBottom: 4 },
  mpDayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.40)',
    textTransform: 'uppercase',
  },
  mpGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  mpDayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mpDayCellToday: { borderRadius: 100, borderWidth: 1.5, borderColor: '#E85D26' },
  mpDayCellSelected: { borderRadius: 100, backgroundColor: '#E85D26' },
  mpDayCellPast: { opacity: 0.30 },
  mpDayNum: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  mpDayNumSelected: { color: '#FFFFFF', fontWeight: '800' },
  mpDayNumPast: { color: 'rgba(255,255,255,0.4)' },
  mpSlotLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  mpSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#252525',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  mpSlotSelected: { borderColor: '#E85D26', backgroundColor: 'rgba(232,93,38,0.15)' },
  mpSlotFull: { opacity: 0.40 },
  mpSlotDimmed: { opacity: 0.45 },
  mpSlotLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  mpSlotText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  mpSlotTextSelected: { color: '#E85D26' },
  mpSlotTextFull: { color: 'rgba(255,255,255,0.5)' },
  mpSlotCount: { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '600' },
  mpSlotBadge: {
    backgroundColor: 'rgba(232,93,38,0.20)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.40)',
  },
  mpSlotBadgeText: { fontSize: 10, fontWeight: '800', color: '#E85D26', letterSpacing: 0.3 },
  mpConfirmBtn: {
    backgroundColor: '#E85D26',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  mpConfirmBtnDisabled: { opacity: 0.45 },
  mpConfirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

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
