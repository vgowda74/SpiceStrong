import { useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  ImageBackground,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import ViewShot from 'react-native-view-shot';
import { getRecipeById, getCompletionStats, SavedRecipe, BUILTIN_INGREDIENT_GROUPS, type CookingStep, type QuantityTier } from '../../src/store/recipes';
import { showTimerVolumeWarningOnce } from '../../src/utils/timerWarning';
import { getRatings, setRating, getFavourites, setFavourites } from '../../src/store/ratingsFavourites';
import { submitReview, submitRating as submitCommunityRating } from '../../services/ratingsService';
import ShareableRecipeCard from '../../components/ShareableRecipeCard';
import { getRecipeStepImage, getRecipeCardImage } from '../../src/data/recipeImages';
import { getIngredientImage } from '../../src/data/ingredientImages';
import { loadRecipeImages, type RecipeImageResults } from '../../services/imageGenerationService';
import { getRecipeImageUrls } from '../../services/recipeService';
import { isAdmin } from '../../services/adminService';
import { fixRecipeStepAsAdmin, type AdminRecipeFixMode } from '../../services/adminRecipeFixService';
import { trackEvent } from '../../services/analyticsService';
import { logScreenView } from '../../services/firebaseAnalytics';
import { HomeButton } from '../../components/HomeButton';
// imageCacheService no longer needed — expo-image handles caching


function getIngredientsForStep(recipe: SavedRecipe, stepIndex: number): string[] {
  const step = recipe.steps[stepIndex];
  if (!step) return [];

  // If step has explicit ingredientsUsed from the recipe template, use that directly
  if (step.ingredientsUsed) {
    return step.ingredientsUsed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Fallback: heuristic-based matching for older recipes without ingredientsUsed
  const recipeGroups = recipe.id ? BUILTIN_INGREDIENT_GROUPS[recipe.id] : undefined;
  const groups = recipeGroups ? Object.values(recipeGroups as Record<string, { items: { name: string }[] }[]>)[0] : undefined;
  const flat = groups
    ? groups.flatMap((g) => g.items.map((i) => i.name))
    : (recipe.ingredients['2-3 servings'] ?? recipe.ingredients['1lb' as keyof typeof recipe.ingredients] ?? []).filter((i) => i.name.trim()).map((i) => i.name);
  if (flat.length === 0) return [];
  if (stepIndex === 0) {
    const protein = flat.find((n) => n.toLowerCase().includes(recipe.proteinName?.toLowerCase() ?? ''));
    const marinade = flat.filter((n) => /yogurt|marinade|lemon|oil/.test(n.toLowerCase()));
    return [protein, ...marinade].filter((name): name is string => Boolean(name)).slice(0, 3);
  }
  if (stepIndex === 1) {
    const oil = flat.find((n) => /oil|butter|ghee/.test(n.toLowerCase()));
    const aromatics = flat.filter((n) => /onion|garlic|ginger|tomato/.test(n.toLowerCase()));
    return [oil, ...aromatics].filter((name): name is string => Boolean(name)).slice(0, 3);
  }
  if (stepIndex === 2) {
    const spices = flat.filter((n) => /spice|masala|chili|turmeric|cumin|garam|pepper|salt/.test(n.toLowerCase()));
    return spices.slice(0, 3);
  }
  return flat.slice(-3);
}

/** Match step ingredientsUsed against the full recipe ingredient list to get names + quantities */
function getStepIngredientsWithQty(
  recipe: SavedRecipe,
  stepIndex: number,
  tier: '2-3 servings' | '4-6 servings',
): { name: string; quantity: string }[] {
  const step = recipe.steps[stepIndex];
  if (!step?.ingredientsUsed) return [];

  const ingredientList = recipe.ingredients[tier] ?? recipe.ingredients['2-3 servings'] ?? [];
  if (ingredientList.length === 0) return [];

  const usedNames = step.ingredientsUsed.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

  const matched: { name: string; quantity: string }[] = [];
  for (const usedName of usedNames) {
    const found = ingredientList.find((ing) => {
      const ingLower = ing.name.toLowerCase();
      // Check if ingredient name contains the used name or vice versa
      return ingLower.includes(usedName) || usedName.includes(ingLower) ||
        // Also match key words (e.g. "turmeric" matches "Turmeric powder")
        usedName.split(/\s+/).some((word) => word.length > 3 && ingLower.includes(word));
    });
    if (found) {
      // Avoid duplicates
      if (!matched.some((m) => m.name === found.name)) {
        matched.push({ name: found.name, quantity: found.quantity });
      }
    }
  }
  return matched;
}

function getSuggestedTimerMinutes(step: CookingStep | undefined): number | null {
  if (!step || typeof step.timerMinutes === 'number') return null;
  const t = (step.title ?? '').toLowerCase();
  if (t.includes('marinate')) return 30;
  if (t.includes('sauté') || t.includes('onion')) return 5;
  if (t.includes('sear')) return 4;
  if (t.includes('simmer')) return 10;
  if (t.includes('pressure')) return 20;
  return 5;
}

async function playAlarmSound() {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
      { shouldPlay: true, volume: 1.0 }
    );

    await sound.playAsync();

    setTimeout(async () => {
      await sound.stopAsync();
      await sound.unloadAsync();
    }, 4000);
  } catch (error) {
    console.log('Sound error:', error);
  }
}

const CONFETTI_EMOJIS = ['🎉', '⭐', '🌟', '✨', '🏆', '👨‍🍳', '🌶️', '🔥'];

function CompletionConfetti() {
  const pieces = useRef(
    Array.from({ length: 12 }, () => ({
      emoji: CONFETTI_EMOJIS[Math.floor(Math.random() * CONFETTI_EMOJIS.length)],
      left: Math.random() * 100,
      duration: 2000 + Math.random() * 1000,
      opacity: new Animated.Value(1),
      translateY: new Animated.Value(0),
    }))
  ).current;
  useEffect(() => { logScreenView('CookingModeScreen'); }, []);
  useEffect(() => {
    pieces.forEach((p) => {
      Animated.parallel([
        Animated.timing(p.translateY, { toValue: 400, duration: p.duration, useNativeDriver: true }),
        Animated.timing(p.opacity, { toValue: 0, duration: p.duration * 0.7, useNativeDriver: true }),
      ]).start();
    });
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => (
        <Animated.Text
          key={i}
          style={[
            styles.confettiPiece,
            { left: `${p.left}%`, opacity: p.opacity, transform: [{ translateY: p.translateY }] },
          ]}
        >
          {p.emoji}
        </Animated.Text>
      ))}
    </View>
  );
}

const DARK_BG = '#100604';
const DARK_CARD_BORDER = '#2D1A0E';
const ORANGE_ACCENT = '#8F3A1F';
const STAR_GREY = '#888888';
const STAR_YELLOW = '#FFD700';
const SERIF_FONT = Platform.OS === 'ios' ? 'Georgia' : 'serif';


const TIMER_MAX_MINUTES = 30;
const ORANGE = '#8F3A1F';
const HEADER_BG = '#100604';
const CARD_BG = '#100604';
const IMAGE_BG = '#3D1A0A';
const DARK_GREY = '#333333';
const REVIEW_COUNT_KEY = 'spicestrong_cook_complete_count';
const NOTIFICATIONS_AVAILABLE = Constants.appOwnership !== 'expo';

export default function CookingModeScreen() {
  const router = useRouter();
  const { recipeId, quantityTier: tierParam } = useLocalSearchParams<{ recipeId: string; quantityTier?: string }>();
  const selectedTier: QuantityTier = tierParam === '4-6 servings' ? '4-6 servings' : '2-3 servings';

  // AI-generated step images (loaded from AsyncStorage)
  const [aiImages, setAiImages] = useState<RecipeImageResults | null>(null);
  const aiStepImages = aiImages?.stepImages ?? {};
  // Supabase step images (keyed by step index -> local cached URI)
  const [supabaseStepImages, setSupabaseStepImages] = useState<Record<string, string>>({});
  const [recipe, setRecipe] = useState<SavedRecipe | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [ingredientsModalVisible, setIngredientsModalVisible] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [adminFixVisible, setAdminFixVisible] = useState(false);
  const [adminFixIssue, setAdminFixIssue] = useState('');
  const [adminFixMode, setAdminFixMode] = useState<AdminRecipeFixMode>('both');
  const [adminFixSubmitting, setAdminFixSubmitting] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [initialTimerSeconds, setInitialTimerSeconds] = useState(0);
  const [done, setDone] = useState(false);
  const [appRating, setAppRating] = useState(5);
  const [appReviewRequested, setAppReviewRequested] = useState(false);
  const [recipeRating, setRecipeRating] = useState(5);
  const [showRecipeRating, setShowRecipeRating] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [showNutritionDetails, setShowNutritionDetails] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerReachedZeroRef = useRef(false);
  const [showTimerCompleteAlert, setShowTimerCompleteAlert] = useState(false);
  const timerCompleteSlide = useRef(new Animated.Value(300)).current;
  const timerCompleteAutoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerEndTimeRef = useRef<number | null>(null);
  const notificationIdRef = useRef<string | null>(null);
  const shareCardRef = useRef<ViewShot>(null);

  // Resolve images for the shareable recipe card
  const shareCardImages = useMemo(() => {
    if (!recipe) return { dishImage: null, stepImages: {}, ingredientImages: {} };
    const rid = recipe.id;

    const isNative = rid.startsWith('spicestrong-');

    // Dish image fallback:
    // Native: Supabase hero (via supabaseStepImages parent) → built-in static
    // AI: AI-generated → built-in static
    let dishImg: any = null;
    if (isNative) {
      const builtIn = getRecipeCardImage(rid);
      if (builtIn) dishImg = builtIn;
    } else {
      if (aiImages?.dishImage) {
        dishImg = { uri: aiImages.dishImage };
      } else {
        const builtIn = getRecipeCardImage(rid);
        if (builtIn) dishImg = builtIn;
      }
    }

    // Step images fallback:
    // Native: Supabase Storage → built-in static
    // AI: AI-generated → Supabase Storage
    const stepImgs: Record<number, any> = {};
    recipe.steps.forEach((_, idx) => {
      if (isNative) {
        if (supabaseStepImages[String(idx)]) {
          stepImgs[idx] = { uri: supabaseStepImages[String(idx)] };
        } else {
          const builtIn = getRecipeStepImage(rid, idx);
          if (builtIn) stepImgs[idx] = builtIn;
        }
      } else {
        if (aiImages?.stepImages?.[String(idx)]) {
          stepImgs[idx] = { uri: aiImages.stepImages[String(idx)] };
        } else if (supabaseStepImages[String(idx)]) {
          stepImgs[idx] = { uri: supabaseStepImages[String(idx)] };
        }
      }
    });

    // Ingredient images from static mappings
    const ingImgs: Record<string, any> = {};
    const t = ['2-3 servings', '4-6 servings'] as const;
    const tier = t.find((k) => recipe.ingredients[k]?.length > 0) ?? '2-3 servings';
    (recipe.ingredients[tier] ?? []).forEach((ing) => {
      const img = getIngredientImage(ing.name);
      if (img) ingImgs[ing.name] = img;
    });

    return { dishImage: dishImg, stepImages: stepImgs, ingredientImages: ingImgs };
  }, [recipe, aiImages, supabaseStepImages]);

  // Poll for background-generated images every 30s until they arrive
  useEffect(() => {
    if (!recipeId || aiImages) return;
    const poll = setInterval(() => {
      loadRecipeImages(recipeId).then((result) => {
        if (result) setAiImages(result);
      });
    }, 30000);
    return () => clearInterval(poll);
  }, [recipeId, aiImages]);

  useEffect(() => {
    if (!recipeId) return;
    getRecipeById(recipeId).then((r) => {
      setRecipe(r);
      if (r) {
        trackEvent('cooking_started', {
          screen: 'CookingModeScreen',
          recipeId,
          metadata: { recipeName: r.name, quantityTier: tierParam ?? '2-3 servings' },
        });
      }
    });
    loadRecipeImages(recipeId).then(setAiImages);
    // Load Supabase step image URLs (expo-image caches automatically)
    getRecipeImageUrls(recipeId).then((urls) => {
      if (Object.keys(urls.stepUrls).length > 0) {
        const stepImgs: Record<string, string> = {};
        for (const [idx, url] of Object.entries(urls.stepUrls)) {
          stepImgs[idx] = url;
        }
        setSupabaseStepImages(stepImgs);
      }
    }).catch(() => {});
  }, [recipeId]);

  useEffect(() => {
    isAdmin().then(setIsAdminUser).catch(() => setIsAdminUser(false));
  }, []);

  useEffect(() => {
    if (!recipeId || !done) return;
    getRatings().then((map) => {
      const r = map[recipeId];
      if (r != null && r >= 1) setRecipeRating(r);
    });
  }, [recipeId, done]);

  const totalSteps = recipe?.steps.length ?? 0;
  const step = recipe?.steps[currentStep];
  const stepTimerDefault = step && typeof step.timerMinutes === 'number' ? step.timerMinutes * 60 : 0;

  useEffect(() => {
    if (!recipe || currentStep >= recipe.steps.length) return;
    const def = stepTimerDefault;
    setTimerSeconds(def);
    setInitialTimerSeconds(def);
    timerEndTimeRef.current = null;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      setTimerRunning(false);
    }
  }, [currentStep, recipe?.id]);

  // Use end-time approach so timer survives background
  useEffect(() => {
    if (timerRunning && timerSeconds > 0) {
      if (!timerEndTimeRef.current) {
        timerEndTimeRef.current = Date.now() + timerSeconds * 1000;
      }
      intervalRef.current = setInterval(() => {
        const remaining = Math.round((timerEndTimeRef.current! - Date.now()) / 1000);
        if (remaining <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          timerEndTimeRef.current = null;
          timerReachedZeroRef.current = true;
          setTimerRunning(false);
          setTimerSeconds(0);
        } else {
          setTimerSeconds(remaining);
        }
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerRunning]);

  // Cancel any scheduled notification
  const cancelTimerNotification = async () => {
    if (!NOTIFICATIONS_AVAILABLE) return;
    if (notificationIdRef.current) {
      await Notifications.cancelScheduledNotificationAsync(notificationIdRef.current).catch(() => null);
      notificationIdRef.current = null;
    }
  };

  // Sync timer when app returns from background
  // Extract alarm trigger into a reusable function
  const triggerTimerAlarm = () => {
    Linking.openURL('clock-timer://stop').catch(() => null);
    playAlarmSound();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowTimerCompleteAlert(true);
    timerCompleteSlide.setValue(300);
    Animated.spring(timerCompleteSlide, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    if (timerCompleteAutoDismissRef.current) clearTimeout(timerCompleteAutoDismissRef.current);
    timerCompleteAutoDismissRef.current = setTimeout(() => {
      timerCompleteAutoDismissRef.current = null;
      Animated.timing(timerCompleteSlide, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => {
        setShowTimerCompleteAlert(false);
      });
    }, 5000);
  };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && timerEndTimeRef.current) {
        const remaining = Math.round((timerEndTimeRef.current - Date.now()) / 1000);
        if (remaining <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          timerEndTimeRef.current = null;
          setTimerRunning(false);
          setTimerSeconds(0);
          cancelTimerNotification();
          // Directly trigger alarm — don't rely on the effect
          triggerTimerAlarm();
        } else {
          setTimerSeconds(remaining);
        }
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    return () => {
      cancelTimerNotification();
      if (timerCompleteAutoDismissRef.current) clearTimeout(timerCompleteAutoDismissRef.current);
      Linking.openURL('clock-timer://stop').catch(() => null);
    };
  }, []);

  useEffect(() => {
    if (timerSeconds !== 0 || !timerReachedZeroRef.current) return;
    timerReachedZeroRef.current = false;
    triggerTimerAlarm();
  }, [timerSeconds]);

  const overlay = (
    <View style={{
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#100604',
    }} />
  );

  if (!recipe) {
    return (
      <ImageBackground
        source={require('../../assets/images/splash-bg.jpg')}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        {overlay}
        <View style={styles.container}>
          <Text style={styles.loadingText}>Loading recipe...</Text>
        </View>
      </ImageBackground>
    );
  }

  const progress = totalSteps > 0 ? (currentStep + 1) / totalSteps : 0;
  const currentStepProgress =
    timerRunning && initialTimerSeconds > 0 ? 1 - timerSeconds / initialTimerSeconds : 0;

  const adjustTimerMinutes = (delta: number) => {
    setTimerSeconds((s) => {
      const totalMinutes = Math.floor(s / 60) + delta;
      const clamped = Math.max(0, Math.min(TIMER_MAX_MINUTES, totalMinutes));
      return clamped * 60;
    });
  };

  const scheduleTimerNotification = async (seconds: number) => {
    if (!NOTIFICATIONS_AVAILABLE) return;
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      // Cancel any existing timer notification
      if (notificationIdRef.current) {
        await Notifications.cancelScheduledNotificationAsync(notificationIdRef.current);
      }
      notificationIdRef.current = await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Timer Complete!',
          body: 'Your cooking step is ready — head back to SpiceStrong!',
          sound: true,
          ...(Platform.OS === 'android' ? { channelId: 'timer' } : {}),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false },
      });
    } catch (e) {
      console.log('Notification schedule error:', e);
    }
  };

  const toggleTimer = async () => {
    if (timerRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Save remaining time so it can be resumed
      const remaining = timerEndTimeRef.current
        ? Math.max(0, Math.round((timerEndTimeRef.current - Date.now()) / 1000))
        : timerSeconds;
      timerEndTimeRef.current = null;
      setTimerSeconds(remaining);
      setTimerRunning(false);
      await cancelTimerNotification();
    } else if (timerSeconds > 0) {
      await showTimerVolumeWarningOnce();
      setInitialTimerSeconds(timerSeconds);
      timerEndTimeRef.current = Date.now() + timerSeconds * 1000;
      setTimerRunning(true);
      await scheduleTimerNotification(timerSeconds);
      const minutes = Math.floor(timerSeconds / 60);
      const secs = timerSeconds % 60;
      Linking.openURL(`clock-timer://?minutes=${minutes}&seconds=${secs}`).catch(() => null);
    }
  };

  const resetTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    timerEndTimeRef.current = null;
    setTimerRunning(false);
    setTimerSeconds(stepTimerDefault);
    setInitialTimerSeconds(stepTimerDefault);
    cancelTimerNotification();
    Linking.openURL('clock-timer://stop').catch(() => null);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const goNext = () => {
    Linking.openURL('clock-timer://stop').catch(() => null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimerRunning(false);
    setIngredientsModalVisible(false);
    setAdminFixVisible(false);
    if (currentStep < totalSteps - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      setDone(true);
      trackEvent('cooking_completed', {
        screen: 'CookingModeScreen',
        recipeId,
        metadata: { recipeName: recipe?.name, totalSteps },
      });
      (async () => {
        try {
          const countRaw = await AsyncStorage.getItem(REVIEW_COUNT_KEY);
          let count = countRaw ? parseInt(countRaw, 10) : 0;
          count += 1;
          await AsyncStorage.setItem(REVIEW_COUNT_KEY, String(count));
        } catch {}
      })();
    }
  };

  const goPrev = () => {
    Linking.openURL('clock-timer://stop').catch(() => null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimerRunning(false);
    setIngredientsModalVisible(false);
    setAdminFixVisible(false);
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const handleExit = () => {
    Alert.alert('Exit Cooking?', 'Your progress will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Exit',
        style: 'destructive',
        onPress: () => {
          Linking.openURL('clock-timer://stop').catch(() => null);
          router.back();
        },
      },
    ]);
  };

  const dismissTimerCompleteAlert = () => {
    if (timerCompleteAutoDismissRef.current) {
      clearTimeout(timerCompleteAutoDismissRef.current);
      timerCompleteAutoDismissRef.current = null;
    }
    Animated.timing(timerCompleteSlide, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => {
      setShowTimerCompleteAlert(false);
    });
  };

  const openAdminFix = () => {
    if (!isAdminUser || !recipe || !step) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setAdminFixIssue('');
    setAdminFixMode('both');
    setAdminFixVisible(true);
  };

  const submitAdminFix = async () => {
    if (!recipe || !step || adminFixSubmitting) return;
    try {
      setAdminFixSubmitting(true);
      const result = await fixRecipeStepAsAdmin(recipe, currentStep, adminFixIssue, adminFixMode);
      setRecipe(result.recipe);
      if (result.localImageUri) {
        setAiImages((prev) => ({
          dishImage: prev?.dishImage ?? null,
          ingredientImages: prev?.ingredientImages ?? {},
          stepImages: {
            ...(prev?.stepImages ?? {}),
            [String(currentStep)]: result.localImageUri ?? null,
          },
        }));
      }
      if (result.publicImageUrl) {
        setSupabaseStepImages((prev) => ({
          ...prev,
          [String(currentStep)]: result.publicImageUrl!,
        }));
      }
      setAdminFixVisible(false);
      setAdminFixIssue('');
      Alert.alert('Recipe step updated', 'The corrected step has been saved and uploaded.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Could not fix step', message);
    } finally {
      setAdminFixSubmitting(false);
    }
  };

  const displayName = recipe.name.toUpperCase();
  const stepNum = currentStep + 1;
  const stepLabel = `STEP ${String(stepNum).padStart(2, '0')}`;
  const stepEmoji = step?.emoji ?? '🍳';
  const tipText = step?.tip ?? recipe.chefTip;
  const showTipBox = Boolean(tipText?.trim());
  const atMin = timerSeconds === 0;
  const atMax = timerSeconds >= TIMER_MAX_MINUTES * 60;

  if (done && recipe) {
    const stats = getCompletionStats(recipe, selectedTier);
    const handleCookAnother = () => {
      router.replace('/screens/ProteinSelectionScreen');
    };
    const handleSaveFavourites = async () => {
      if (!recipe?.id) return;
      const list = await getFavourites();
      if (list.includes(recipe.id)) {
        Alert.alert('Already in Favourites');
        return;
      }
      await setFavourites([...list, recipe.id]);
      Alert.alert('Saved!', 'Added to Favourites.');
    };
    const handleShare = async () => {
      try {
        // Try to capture recipe card as image and share
        if (shareCardRef.current?.capture) {
          const uri = await shareCardRef.current.capture();
          if (uri && (await Sharing.isAvailableAsync())) {
            await Sharing.shareAsync(uri, {
              mimeType: 'image/png',
              dialogTitle: `Share ${recipe.name}`,
              UTI: 'public.png',
            });
            return;
          }
        }
        // Fallback to text share
        await Share.share({ message: recipe.name, title: recipe.name });
      } catch (_) {
        // Final fallback
        try {
          await Share.share({ message: recipe.name, title: recipe.name });
        } catch (__) {}
      }
    };
    const handleRateApp = async (stars: number) => {
      setAppRating(stars);
      if (appReviewRequested) return;
      setAppReviewRequested(true);
      try {
        const available = await StoreReview.isAvailableAsync();
        if (available) {
          await StoreReview.requestReview();
        } else {
          Alert.alert('Thank you!', 'Your rating helps us keep improving SpiceStrong.');
        }
      } catch {
        Alert.alert('Thank you!', 'Your rating helps us keep improving SpiceStrong.');
      }
    };
    const APP_RATING_LABELS: Record<number, string> = {
      1: 'Thanks for the honesty',
      2: 'We can do better',
      3: 'Thanks for cooking with us',
      4: 'Glad it helped!',
      5: 'Love to hear it!',
    };
    const RECIPE_RATING_LABELS: Record<number, string> = {
      1: 'Needs work',
      2: 'It was okay',
      3: 'Pretty good!',
      4: 'Really tasty!',
      5: 'Perfect dish! 🏆',
    };
    return (
      <ImageBackground
        source={require('../../assets/images/splash-bg.jpg')}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#100604' }]} />
        <CompletionConfetti />
        <View style={styles.completionRoot}>
        <ScrollView
          contentContainerStyle={styles.completionScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.completionEmoji}>🏆</Text>
          <Text style={styles.completionTitle}>Well Done, Chef!</Text>
          <Text style={styles.completionRecipeName}>{recipe.name}</Text>

          <TouchableOpacity
            style={styles.nutritionBox}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowNutritionDetails(!showNutritionDetails);
            }}
            activeOpacity={0.85}
          >
            <View style={styles.nutritionBoxHeader}>
              <View style={styles.nutritionBoxSummary}>
                <Text style={styles.nutritionBoxValue}>🔥 {stats.batchCalories} kcal</Text>
                <Text style={styles.nutritionBoxDot}>•</Text>
                <Text style={styles.nutritionBoxValue}>💪 {stats.batchProteinG}g protein</Text>
              </View>
              <Text style={styles.nutritionBoxArrow}>{showNutritionDetails ? '▲' : '▼'}</Text>
            </View>
            <Text style={styles.nutritionBoxHint}>total for {selectedTier}  •  {showNutritionDetails ? 'tap to collapse' : 'tap for full nutrition'}</Text>

            {showNutritionDetails && (
              <View style={styles.nutritionDetailsGrid}>
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Total Calories</Text>
                  <Text style={styles.nutritionDetailVal}>{stats.batchCalories} kcal</Text>
                </View>
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Total Protein</Text>
                  <Text style={styles.nutritionDetailVal}>{stats.batchProteinG}g</Text>
                </View>
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Total Carbs</Text>
                  <Text style={styles.nutritionDetailVal}>{Math.round(stats.carbsG * stats.servings)}g</Text>
                </View>
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Total Fat</Text>
                  <Text style={styles.nutritionDetailVal}>{Math.round(stats.fatG * stats.servings)}g</Text>
                </View>
                {stats.saturatedFatG > 0 && (
                  <View style={styles.nutritionDetailRow}>
                    <Text style={styles.nutritionDetailLabelIndent}>Saturated Fat</Text>
                    <Text style={styles.nutritionDetailVal}>{Math.round(stats.saturatedFatG * stats.servings)}g</Text>
                  </View>
                )}
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Total Fiber</Text>
                  <Text style={styles.nutritionDetailVal}>{Math.round(stats.fiberG * stats.servings)}g</Text>
                </View>
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Total Sugar</Text>
                  <Text style={styles.nutritionDetailVal}>{Math.round(stats.sugarG * stats.servings)}g</Text>
                </View>
                <View style={styles.nutritionDivider} />
                {stats.cholesterolMg > 0 && (
                  <View style={styles.nutritionDetailRow}>
                    <Text style={styles.nutritionDetailLabel}>Cholesterol</Text>
                    <Text style={styles.nutritionDetailVal}>{Math.round(stats.cholesterolMg * stats.servings)}mg</Text>
                  </View>
                )}
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Sodium</Text>
                  <Text style={styles.nutritionDetailVal}>{Math.round(stats.sodiumMg * stats.servings)}mg</Text>
                </View>
                {stats.ironMg > 0 && (
                  <View style={styles.nutritionDetailRow}>
                    <Text style={styles.nutritionDetailLabel}>Iron</Text>
                    <Text style={styles.nutritionDetailVal}>{Math.round(stats.ironMg * stats.servings)}mg</Text>
                  </View>
                )}
                {stats.calciumMg > 0 && (
                  <View style={styles.nutritionDetailRow}>
                    <Text style={styles.nutritionDetailLabel}>Calcium</Text>
                    <Text style={styles.nutritionDetailVal}>{Math.round(stats.calciumMg * stats.servings)}mg</Text>
                  </View>
                )}
                <View style={styles.nutritionDivider} />
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Serves</Text>
                  <Text style={styles.nutritionDetailVal}>{stats.servings} servings</Text>
                </View>
                <View style={styles.nutritionDivider} />
                <Text style={styles.nutritionHelpText}>
                  ℹ️ These are total values for the entire {selectedTier} batch. Calculate your intake based on how much you actually consume.
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.rateLabel}>Rate this app</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <TouchableOpacity
                key={i}
                onPress={() => {
                  if (Platform.OS === 'ios' || Platform.OS === 'android') {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  }
                  handleRateApp(i);
                }}
                style={styles.starTouch}
                activeOpacity={0.8}
              >
                <Text style={[styles.star, i <= appRating ? styles.starSelected : styles.starUnselected]}>
                  {i <= appRating ? '\u2605' : '\u2606'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.ratingLabelText}>
            {appReviewRequested ? 'Thanks for rating SpiceStrong!' : APP_RATING_LABELS[appRating] ?? ''}
          </Text>
          <TouchableOpacity
            style={[styles.appReviewSubmitBtn, appReviewRequested && styles.appReviewSubmitBtnDisabled]}
            onPress={() => handleRateApp(appRating)}
            activeOpacity={0.85}
            disabled={appReviewRequested}
          >
            <Text style={styles.appReviewSubmitBtnText}>
              {appReviewRequested ? 'Review Prompt Opened' : 'Submit Review'}
            </Text>
          </TouchableOpacity>

          {showRecipeRating && !reviewSubmitted ? (
            <View style={styles.reviewSection}>
              <Text style={styles.reviewSectionTitle}>Rate this recipe</Text>
              <View style={styles.recipeStarRow}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      if (Platform.OS === 'ios' || Platform.OS === 'android') {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      }
                      setRecipeRating(i);
                      if (recipe?.id) {
                        setRating(recipe.id, i);
                        submitCommunityRating(recipe.id, i).catch(() => {});
                      }
                    }}
                    style={styles.recipeStarTouch}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.recipeStar, i <= recipeRating ? styles.starSelected : styles.starUnselected]}>
                      {i <= recipeRating ? '\u2605' : '\u2606'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.recipeRatingLabelText}>{RECIPE_RATING_LABELS[recipeRating] ?? ''}</Text>
              <TextInput
                style={styles.reviewInput}
                placeholder="Tell others what you thought... (optional)"
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={reviewComment}
                onChangeText={setReviewComment}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />
              <Text style={styles.reviewCharCount}>{reviewComment.length}/500</Text>
              <TouchableOpacity
                style={[styles.reviewSubmitBtn, reviewSubmitting && styles.reviewSubmitBtnDisabled]}
                onPress={async () => {
                  if (reviewSubmitting) return;
                  setReviewSubmitting(true);
                  try {
                    if (recipe?.id) {
                      await submitReview(recipe.id, recipeRating, reviewComment || RECIPE_RATING_LABELS[recipeRating] || 'Great recipe!');
                    }
                    setReviewSubmitted(true);
                  } catch {
                    // silently fail
                  } finally {
                    setReviewSubmitting(false);
                  }
                }}
                activeOpacity={0.8}
                disabled={reviewSubmitting}
              >
                <Text style={styles.reviewSubmitBtnText}>
                  {reviewSubmitting ? 'Submitting...' : 'Submit Recipe Rating'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : reviewSubmitted ? (
            <View style={styles.reviewSubmittedBox}>
              <Text style={styles.reviewSubmittedText}>Thanks for rating this recipe!</Text>
            </View>
          ) : null}
          <TouchableOpacity style={styles.btnCookAnother} onPress={handleCookAnother} activeOpacity={0.8}>
            <Text style={styles.btnCookAnotherText}>🏠 Cook Another</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnOutline} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowRecipeRating((value) => !value); }} activeOpacity={0.8}>
            <Text style={styles.btnOutlineText}>{'\u2605'} Rate this recipe</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnOutline} onPress={handleSaveFavourites} activeOpacity={0.8}>
            <Text style={styles.btnOutlineText}>❤️ Save to Favourites</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnOutline} onPress={handleShare} activeOpacity={0.8}>
            <Text style={styles.btnOutlineText}>📤 Share Recipe</Text>
          </TouchableOpacity>
        </ScrollView>
        </View>

        {/* Hidden shareable card for image capture */}
        <View style={{ position: 'absolute', left: -9999, top: 0 }}>
          <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1 }}>
            <ShareableRecipeCard
              recipe={recipe}
              stats={stats}
              dishImage={shareCardImages.dishImage}
              stepImages={shareCardImages.stepImages}
              ingredientImages={shareCardImages.ingredientImages}
            />
          </ViewShot>
        </View>
      </ImageBackground>
    );
  }

  if (!step) {
    return (
      <ImageBackground
        source={require('../../assets/images/splash-bg.jpg')}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        {overlay}
        <View style={styles.container}>
          <Text style={styles.loadingText}>No steps found.</Text>
        </View>
      </ImageBackground>
    );
  }

  const stepIngredients = recipe ? getIngredientsForStep(recipe, currentStep) : [];
  const suggestedMin = getSuggestedTimerMinutes(step);

  return (
    <ImageBackground
      source={require('../../assets/images/splash-bg.jpg')}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      {overlay}
      {showTimerCompleteAlert ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={styles.timerCompleteOverlayBg} />
          <Animated.View
            style={[
              styles.timerCompleteOverlayContent,
              { transform: [{ translateY: timerCompleteSlide }] },
            ]}
          >
            <View style={styles.timerCompleteCard}>
              <Text style={styles.timerCompleteEmoji}>⏰</Text>
              <Text style={styles.timerCompleteTitle}>Timer Complete!</Text>
              <Text style={styles.timerCompleteSubtitle}>Your step is ready!</Text>
              <TouchableOpacity
                style={styles.timerCompleteDismissBtn}
                onPress={dismissTimerCompleteAlert}
                activeOpacity={0.8}
              >
                <Text style={styles.timerCompleteDismissText}>✓ Got it!</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      ) : null}
    <View style={styles.container}>
      {/* Header: back button only */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleExit} style={styles.headerBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.headerBackText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{recipe.name}</Text>
        <HomeButton />
      </View>

      {/* Segmented progress bar */}
      <View style={styles.progressRow}>
        {Array.from({ length: totalSteps }, (_, i) => {
          const completed = i < currentStep;
          const current = i === currentStep;
          const fill = completed ? 1 : current ? currentStepProgress : 0;
          return (
            <View key={i} style={styles.progressSegmentBg}>
              <View
                style={[
                  styles.progressSegmentFill,
                  {
                    width: `${fill * 100}%`,
                    backgroundColor: fill > 0 ? ORANGE : 'transparent',
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Step label & title */}
        <Pressable
          onLongPress={isAdminUser ? openAdminFix : undefined}
          delayLongPress={450}
        >
          <Text style={styles.stepLabel}>STEP {stepNum} of {totalSteps}</Text>
          <Text style={styles.stepTitle}>{step.title}</Text>

          {/* Step description */}
          <Text style={styles.stepDescription}>{step.description}</Text>
          {isAdminUser ? (
            <Text style={styles.adminFixHint}>Admin: long press step or image to correct</Text>
          ) : null}
        </Pressable>

        {/* Ingredients for this step — opens modal */}
        {stepIngredients.length > 0 && (
          <TouchableOpacity
            style={styles.ingredientsToggle}
            activeOpacity={0.7}
            onPress={() => setIngredientsModalVisible(true)}
          >
            <Text style={styles.ingredientsToggleIcon}>🧺</Text>
            <Text style={styles.ingredientsToggleText}>Ingredients for this step</Text>
            <Text style={styles.ingredientsToggleArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* Ingredients modal — tap outside to dismiss */}
        <Modal
          visible={ingredientsModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIngredientsModalVisible(false)}
        >
          <Pressable
            style={styles.ingredientModalBackdrop}
            onPress={() => setIngredientsModalVisible(false)}
          >
            <Pressable style={styles.ingredientModalContent} onPress={() => {}}>
              <View style={styles.ingredientModalHandle} />
              <Text style={styles.ingredientModalTitle}>🧺 Step {stepNum} — Ingredients</Text>
              <Text style={styles.ingredientModalSubtitle}>{step.title}</Text>
              {(() => {
                const withQty = getStepIngredientsWithQty(recipe, currentStep, selectedTier);
                if (withQty.length > 0) {
                  return withQty.map((ing, i) => (
                    <View key={i} style={styles.ingredientModalRow}>
                      <Text style={styles.ingredientModalName}>{ing.name}</Text>
                      <Text style={styles.ingredientModalQty}>{ing.quantity}</Text>
                    </View>
                  ));
                }
                // Fallback: show names only if no quantity match
                return stepIngredients.map((name, i) => (
                  <View key={i} style={styles.ingredientModalRow}>
                    <Text style={styles.ingredientModalName}>{name}</Text>
                  </View>
                ));
              })()}
              <TouchableOpacity
                style={styles.ingredientModalClose}
                onPress={() => setIngredientsModalVisible(false)}
              >
                <Text style={styles.ingredientModalCloseText}>Got it</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={adminFixVisible}
          transparent
          animationType="fade"
          onRequestClose={() => !adminFixSubmitting && setAdminFixVisible(false)}
        >
          <KeyboardAvoidingView
            style={styles.ingredientModalBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => !adminFixSubmitting && setAdminFixVisible(false)}
            />
            <View style={styles.adminFixContent}>
              <View style={styles.ingredientModalHandle} />
              <Text style={styles.adminFixTitle}>Correct step {stepNum}</Text>
              <Text style={styles.adminFixSubtitle}>{step.title}</Text>
              <View style={styles.adminFixModes}>
                {(['instructions', 'image', 'both'] as AdminRecipeFixMode[]).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.adminFixModeButton, adminFixMode === mode && styles.adminFixModeButtonActive]}
                    onPress={() => setAdminFixMode(mode)}
                    disabled={adminFixSubmitting}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.adminFixModeText, adminFixMode === mode && styles.adminFixModeTextActive]}>
                      {mode === 'instructions' ? 'Instructions' : mode === 'image' ? 'Image' : 'Both'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.adminFixInput}
                value={adminFixIssue}
                onChangeText={setAdminFixIssue}
                placeholder="What is incorrect on this step?"
                placeholderTextColor="rgba(255,255,255,0.35)"
                multiline
                editable={!adminFixSubmitting}
              />
              <View style={styles.adminFixActions}>
                <TouchableOpacity
                  style={styles.adminFixCancel}
                  onPress={() => setAdminFixVisible(false)}
                  disabled={adminFixSubmitting}
                  activeOpacity={0.8}
                >
                  <Text style={styles.adminFixCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.adminFixSubmit, (adminFixSubmitting || !adminFixIssue.trim()) && styles.adminFixSubmitDisabled]}
                  onPress={submitAdminFix}
                  disabled={adminFixSubmitting || !adminFixIssue.trim()}
                  activeOpacity={0.85}
                >
                  <Text style={styles.adminFixSubmitText}>
                    {adminFixSubmitting ? 'Fixing...' : 'Fix & upload'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Step image fallback:
            Native recipes: Supabase Storage → built-in static → emoji
            AI recipes: AI-generated → Supabase Storage → emoji */}
        <Pressable
          style={styles.imageAreaWrapper}
          onLongPress={isAdminUser ? openAdminFix : undefined}
          delayLongPress={450}
        >
          {recipe.id.startsWith('spicestrong-') ? (
            // Native recipe: Supabase Storage → built-in static → emoji
            supabaseStepImages[String(currentStep)] ? (
              <Image
                source={{ uri: supabaseStepImages[String(currentStep)] }}
                style={styles.stepImage}
                contentFit="cover" transition={200}
              />
            ) : getRecipeStepImage(recipe.id, currentStep) ? (
              <Image
                source={getRecipeStepImage(recipe.id, currentStep)!}
                style={styles.stepImage}
                contentFit="cover" transition={200}
              />
            ) : (
              <View style={styles.imageAreaCompact}>
                <Text style={styles.stepEmojiCompact}>{stepEmoji}</Text>
              </View>
            )
          ) : (
            // AI/User recipe: AI-generated → Supabase Storage → step.photoUri → emoji
            aiStepImages[String(currentStep)] ? (
              <Image
                source={{ uri: aiStepImages[String(currentStep)]! }}
                style={styles.stepImage}
                contentFit="cover" transition={200}
              />
            ) : supabaseStepImages[String(currentStep)] ? (
              <Image
                source={{ uri: supabaseStepImages[String(currentStep)] }}
                style={styles.stepImage}
                contentFit="cover" transition={200}
              />
            ) : (recipe.steps[currentStep] as any)?.photoUri ? (
              <Image
                source={{ uri: (recipe.steps[currentStep] as any).photoUri }}
                style={styles.stepImage}
                contentFit="cover" transition={200}
              />
            ) : (recipe.steps[currentStep] as any)?.photoStorageUrl ? (
              <Image
                source={{ uri: (recipe.steps[currentStep] as any).photoStorageUrl }}
                style={styles.stepImage}
                contentFit="cover" transition={200}
              />
            ) : (
              <View style={styles.imageAreaCompact}>
                <Text style={styles.stepEmojiCompact}>{stepEmoji}</Text>
              </View>
            )
          )}
        </Pressable>

        {/* Chef's Tip — cream card */}
        {showTipBox && (
          <View style={styles.tipCard}>
            <Text style={styles.tipCardHeader}>💡 Chef's Tip</Text>
            <Text style={styles.tipCardText}>{tipText}</Text>
          </View>
        )}

        {/* Timer — side by side: timer display + start button */}
        <View style={styles.timerSection}>
          <View style={styles.timerRow}>
            {/* Timer display with +/- */}
            <View style={styles.timerDisplayGroup}>
              <TouchableOpacity
                style={[styles.timerAdjustBtn, atMin && styles.timerAdjustBtnDisabled]}
                onPress={() => adjustTimerMinutes(-1)}
                disabled={atMin}
                activeOpacity={0.7}
              >
                <Text style={[styles.timerAdjustBtnText, atMin && { color: '#555' }]}>−</Text>
              </TouchableOpacity>
              <Text style={styles.timerTimeText}>{formatTime(timerSeconds)}</Text>
              <TouchableOpacity
                style={[styles.timerAdjustBtn, atMax && styles.timerAdjustBtnDisabled]}
                onPress={() => adjustTimerMinutes(1)}
                disabled={atMax}
                activeOpacity={0.7}
              >
                <Text style={[styles.timerAdjustBtnText, atMax && { color: '#555' }]}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Start button */}
            <TouchableOpacity
              style={[styles.timerStartBtn, atMin && styles.timerStartBtnDisabled]}
              onPress={toggleTimer}
              disabled={atMin}
              activeOpacity={0.8}
            >
              <Text style={styles.timerStartBtnText}>
                {timerRunning ? '⏸ Pause' : '▶ Start'}
              </Text>
            </TouchableOpacity>
          </View>
          {(step.timerMinutes || suggestedMin) ? (
            <Text style={styles.timerHint}>{step.timerMinutes ?? suggestedMin} min recommended</Text>
          ) : null}
        </View>

      </ScrollView>
      {/* Navigation row - pinned at bottom */}
      <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navPrevBtn, currentStep === 0 && styles.navBtnDisabled]}
            onPress={goPrev}
            disabled={currentStep === 0}
            activeOpacity={0.8}
          >
            <Text style={styles.navPrevBtnText}>← Prev</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navNextBtn} onPress={goNext} activeOpacity={0.8}>
            <Text style={styles.navNextBtnText}>
              {currentStep === totalSteps - 1 ? 'Finish 🎉' : 'Next Step →'}
            </Text>
          </TouchableOpacity>
        </View>
    </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingText: { color: '#FFFFFF', fontSize: 16, textAlign: 'center', marginTop: 100 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: 'transparent',
  },
  headerBack: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,11,9,0.54)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  headerBackText: { color: '#FFFFFF', fontSize: 28, lineHeight: 30, fontWeight: '900' },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  imageAreaWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    backgroundColor: 'transparent',
  },
  progressSegmentBg: {
    flex: 1,
    height: 5,
    backgroundColor: 'rgba(248,241,232,0.12)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressSegmentFill: {
    height: '100%',
    borderRadius: 2,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 14 },
  stepLabel: {
    color: ORANGE,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  stepTitle: {
    color: '#FFFFFF',
    fontSize: 29,
    fontWeight: 'bold',
    marginBottom: 14,
    lineHeight: 36,
  },
  imageArea: {
    backgroundColor: IMAGE_BG,
    borderRadius: 14,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageAreaCompact: {
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderRadius: 8,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    width: 40,
  },
  stepImage: {
    width: '100%',
    height: 260,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
  },
  stepEmoji: { fontSize: 80 },
  stepEmojiCompact: { fontSize: 20 },
  stepDescription: {
    color: 'rgba(248,241,232,0.86)',
    fontSize: 17,
    lineHeight: 28,
    marginBottom: 14,
  },
  adminFixHint: {
    color: 'rgba(143,58,31,0.85)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  // Ingredient pills — compact horizontal row
  ingredientsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
    marginBottom: 14,
  },
  ingredientsToggleIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  ingredientsToggleText: {
    color: 'rgba(248,241,232,0.75)',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  ingredientsToggleArrow: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 18,
    fontWeight: '600',
  },
  ingredientModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  ingredientModalContent: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  ingredientModalHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  ingredientModalTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  ingredientModalSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 18,
  },
  ingredientModalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  ingredientModalName: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  ingredientModalQty: {
    color: '#D4A574',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 12,
  },
  ingredientModalClose: {
    backgroundColor: 'rgba(248,241,232,0.10)',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  ingredientModalCloseText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  // Chef's Tip — cream/beige card like reference
  adminFixContent: {
    backgroundColor: '#20110B',
    borderRadius: 18,
    padding: 22,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.28)',
  },
  adminFixTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  adminFixSubtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
  },
  adminFixModes: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  adminFixModeButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  adminFixModeButtonActive: {
    backgroundColor: 'rgba(143,58,31,0.22)',
    borderColor: ORANGE,
  },
  adminFixModeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '800',
  },
  adminFixModeTextActive: {
    color: '#FFFFFF',
  },
  adminFixInput: {
    minHeight: 116,
    borderRadius: 14,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  adminFixActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  adminFixCancel: {
    flex: 0.38,
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  adminFixCancelText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  adminFixSubmit: {
    flex: 0.62,
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: ORANGE,
  },
  adminFixSubmitDisabled: {
    opacity: 0.55,
  },
  adminFixSubmitText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  tipCard: {
    backgroundColor: '#FFF8ED',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  tipCardHeader: {
    color: '#2D1A0E',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  tipCardText: {
    color: '#3D2A1A',
    fontSize: 15,
    lineHeight: 22,
  },
  timerSection: { marginBottom: 20 },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timerDisplayGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.65)',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  timerAdjustBtn: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerAdjustBtnDisabled: { opacity: 0.3 },
  timerAdjustBtnText: {
    color: ORANGE,
    fontSize: 22,
    fontWeight: '300',
  },
  timerTimeText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'] as any,
    minWidth: 90,
    textAlign: 'center',
  },
  timerHint: {
    color: 'rgba(248,241,232,0.45)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
  },
  timerCompleteOverlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  timerCompleteOverlayContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingBottom: 80,
    paddingTop: 40,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  timerCompleteCard: {
    backgroundColor: '#8F3A1F',
    borderRadius: 20,
    padding: 20,
  },
  timerCompleteEmoji: { fontSize: 48, textAlign: 'center' },
  timerCompleteTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  timerCompleteSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  timerCompleteDismissBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  timerCompleteDismissText: { color: '#FFFFFF', fontWeight: '700' },
  timerStartBtn: {
    flex: 1,
    backgroundColor: ORANGE,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerStartBtnDisabled: { backgroundColor: DARK_GREY, opacity: 0.6 },
  timerStartBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  navRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, backgroundColor: 'rgba(13,11,9,0.92)', borderTopWidth: 1, borderTopColor: 'rgba(248,241,232,0.10)' },
  navPrevBtn: {
    flex: 0.4,
    backgroundColor: 'rgba(248,241,232,0.08)',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
  },
  navBtnDisabled: { opacity: 0.3 },
  navPrevBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  navNextBtn: {
    flex: 0.6,
    backgroundColor: ORANGE,
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  navNextBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: 'bold' },
  completionRoot: {
    flex: 1,
  },
  completionScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 48,
    alignItems: 'center',
  },
  confettiPiece: {
    position: 'absolute',
    top: -30,
    fontSize: 24,
  },
  completionEmoji: { fontSize: 72, marginBottom: 16 },
  completionTitle: {
    fontFamily: Platform.OS === 'ios' ? 'PlayfairDisplay_700Bold' : SERIF_FONT,
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  completionRecipeName: {
    color: ORANGE_ACCENT,
    fontWeight: 'bold',
    fontSize: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  completionSubtitle: {
    color: '#B0B0B0',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    width: '100%',
    justifyContent: 'center',
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    maxWidth: 120,
  },
  statValue: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 24,
  },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4, letterSpacing: 1 },
  nutritionBox: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  nutritionBoxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nutritionBoxSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nutritionBoxValue: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 18,
  },
  nutritionBoxDot: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 18,
  },
  nutritionBoxArrow: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  nutritionBoxHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    marginTop: 6,
    letterSpacing: 0.5,
  },
  nutritionDetailsGrid: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    paddingTop: 12,
  },
  nutritionDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  nutritionDetailLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
  },
  nutritionDetailLabelIndent: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '400',
    paddingLeft: 12,
  },
  nutritionDetailVal: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  nutritionDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 6,
  },
  nutritionHelpText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  rateLabel: {
    color: '#999999',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 28,
    marginBottom: 8,
  },
  starRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  starTouch: { padding: 4 },
  star: { fontSize: 40 },
  starSelected: { color: STAR_YELLOW },
  starUnselected: { color: 'rgba(255,255,255,0.3)' },
  ratingLabelText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  appReviewSubmitBtn: {
    backgroundColor: ORANGE_ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    marginBottom: 20,
    ...Platform.select({
      ios: { shadowColor: ORANGE_ACCENT, shadowOpacity: 0.32, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 5 },
    }),
  },
  appReviewSubmitBtnDisabled: { opacity: 0.55 },
  appReviewSubmitBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  recipeStarRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 8 },
  recipeStarTouch: { padding: 3 },
  recipeStar: { fontSize: 34 },
  recipeRatingLabelText: { color: 'rgba(255,255,255,0.76)', fontSize: 13, textAlign: 'center', marginBottom: 14 },

  // Review section
  reviewSection: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  reviewSectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  reviewInput: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 15,
    minHeight: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    lineHeight: 22,
  },
  reviewCharCount: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 12,
  },
  reviewSubmitBtn: {
    backgroundColor: 'rgba(143,58,31,0.9)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reviewSubmitBtnDisabled: {
    opacity: 0.5,
  },
  reviewSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  reviewSubmittedBox: {
    width: '100%',
    backgroundColor: 'rgba(143,58,31,0.15)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.25)',
  },
  reviewSubmittedText: {
    color: '#8F3A1F',
    fontSize: 16,
    fontWeight: '700',
  },

  btnCookAnother: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: DARK_CARD_BORDER,
    borderRadius: 14,
    paddingVertical: 18,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  btnCookAnotherText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  btnOutline: {
    borderWidth: 2,
    borderColor: DARK_CARD_BORDER,
    borderRadius: 14,
    paddingVertical: 18,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  btnOutlineText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});
