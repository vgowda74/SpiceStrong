import { useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import { getRecipeById, getCompletionStats, SavedRecipe, BUILTIN_INGREDIENT_GROUPS, type CookingStep } from '../../src/store/recipes';
import { showTimerVolumeWarningOnce } from '../../src/utils/timerWarning';
import { getRatings, setRating, getFavourites, setFavourites } from '../../src/store/ratingsFavourites';
import { submitReview, submitRating as submitCommunityRating } from '../../services/ratingsService';
import ShareableRecipeCard from '../../components/ShareableRecipeCard';
import { getRecipeStepImage } from '../../src/data/recipeImages';


function getIngredientsForStep(recipe: SavedRecipe, stepIndex: number): string[] {
  const recipeGroups = recipe.id ? BUILTIN_INGREDIENT_GROUPS[recipe.id] : undefined;
  const groups = recipeGroups ? Object.values(recipeGroups as Record<string, { items: { name: string }[] }[]>)[0] : undefined;
  const flat = groups
    ? groups.flatMap((g) => g.items.map((i) => i.name))
    : (recipe.ingredients['2-3 servings'] ?? recipe.ingredients['1lb' as keyof typeof recipe.ingredients] ?? []).filter((i) => i.name.trim()).map((i) => i.name);
  if (flat.length === 0) return [];
  const step = recipe.steps[stepIndex];
  const title = (step?.title ?? '').toLowerCase();
  if (stepIndex === 0) {
    const protein = flat.find((n) => n.toLowerCase().includes(recipe.proteinName?.toLowerCase() ?? ''));
    const marinade = flat.filter((n) => /yogurt|marinade|lemon|oil/.test(n.toLowerCase()));
    return [protein, ...marinade].filter(Boolean).slice(0, 3);
  }
  if (stepIndex === 1) {
    const oil = flat.find((n) => /oil|butter|ghee/.test(n.toLowerCase()));
    const aromatics = flat.filter((n) => /onion|garlic|ginger|tomato/.test(n.toLowerCase()));
    return [oil, ...aromatics].filter(Boolean).slice(0, 3);
  }
  if (stepIndex === 2) {
    const spices = flat.filter((n) => /spice|masala|chili|turmeric|cumin|garam|pepper|salt/.test(n.toLowerCase()));
    return spices.slice(0, 3);
  }
  return flat.slice(-3);
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

const FOREST_GREEN = '#1B4A2E';
const DARK_CARD_GREEN = '#2D5A3D';
const ORANGE_ACCENT = '#E85D26';
const STAR_GREY = '#888888';
const STAR_YELLOW = '#FFD700';
const SERIF_FONT = Platform.OS === 'ios' ? 'Georgia' : 'serif';


const TIMER_MAX_MINUTES = 30;
const ORANGE = '#E85D26';
const HEADER_BG = '#2A1005';
const CARD_BG = '#1A0A00';
const IMAGE_BG = '#3D1A0A';
const DARK_GREY = '#333333';

export default function CookingModeScreen() {
  const router = useRouter();
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const [recipe, setRecipe] = useState<SavedRecipe | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [initialTimerSeconds, setInitialTimerSeconds] = useState(0);
  const [done, setDone] = useState(false);
  const [starRating, setStarRating] = useState(5);
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

  useEffect(() => {
    if (!recipeId) return;
    getRecipeById(recipeId).then(setRecipe);
  }, [recipeId]);

  useEffect(() => {
    if (!recipeId || !done) return;
    getRatings().then((map) => {
      const r = map[recipeId];
      if (r != null && r >= 1) setStarRating(r);
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
      backgroundColor: 'rgba(0,0,0,0.55)',
    }} />
  );

  if (!recipe) {
    return (
      <ImageBackground
        source={require('../../assets/images/splash-bg.png')}
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
    if (currentStep < totalSteps - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      setDone(true);
    }
  };

  const goPrev = () => {
    Linking.openURL('clock-timer://stop').catch(() => null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimerRunning(false);
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

  const displayName = recipe.name.toUpperCase();
  const stepNum = currentStep + 1;
  const stepLabel = `STEP ${String(stepNum).padStart(2, '0')}`;
  const stepEmoji = step?.emoji ?? '🍳';
  const tipText = step?.tip ?? recipe.chefTip;
  const showTipBox = Boolean(tipText?.trim());
  const atMin = timerSeconds === 0;
  const atMax = timerSeconds >= TIMER_MAX_MINUTES * 60;

  if (done && recipe) {
    const stats = getCompletionStats(recipe);
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
    const handleSendFeedback = () => {
      router.push({
        pathname: '/screens/FeedbackScreen',
        params: { recipeId: recipe.id, recipeName: recipe.name, starRating: String(starRating) },
      });
    };
    const RATING_LABELS: Record<number, string> = {
      1: 'Needs work',
      2: 'It was okay',
      3: 'Pretty good!',
      4: 'Really tasty!',
      5: 'Perfect dish! 🏆',
    };
    return (
      <ImageBackground
        source={require('../../assets/images/splash-bg.png')}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(27,74,46,0.85)' }]} />
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
                <Text style={styles.nutritionBoxValue}>🔥 {stats.calories} kcal</Text>
                <Text style={styles.nutritionBoxDot}>•</Text>
                <Text style={styles.nutritionBoxValue}>💪 {stats.proteinG}g protein</Text>
              </View>
              <Text style={styles.nutritionBoxArrow}>{showNutritionDetails ? '▲' : '▼'}</Text>
            </View>
            <Text style={styles.nutritionBoxHint}>per serving  •  {showNutritionDetails ? 'tap to collapse' : 'tap for full nutrition'}</Text>

            {showNutritionDetails && (
              <View style={styles.nutritionDetailsGrid}>
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Calories</Text>
                  <Text style={styles.nutritionDetailVal}>{stats.calories} kcal</Text>
                </View>
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Protein</Text>
                  <Text style={styles.nutritionDetailVal}>{stats.proteinG}g</Text>
                </View>
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Carbs</Text>
                  <Text style={styles.nutritionDetailVal}>{stats.carbsG}g</Text>
                </View>
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Fat</Text>
                  <Text style={styles.nutritionDetailVal}>{stats.fatG}g</Text>
                </View>
                {stats.saturatedFatG > 0 && (
                  <View style={styles.nutritionDetailRow}>
                    <Text style={styles.nutritionDetailLabelIndent}>Saturated Fat</Text>
                    <Text style={styles.nutritionDetailVal}>{stats.saturatedFatG}g</Text>
                  </View>
                )}
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Fiber</Text>
                  <Text style={styles.nutritionDetailVal}>{stats.fiberG}g</Text>
                </View>
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Sugar</Text>
                  <Text style={styles.nutritionDetailVal}>{stats.sugarG}g</Text>
                </View>
                <View style={styles.nutritionDivider} />
                {stats.cholesterolMg > 0 && (
                  <View style={styles.nutritionDetailRow}>
                    <Text style={styles.nutritionDetailLabel}>Cholesterol</Text>
                    <Text style={styles.nutritionDetailVal}>{stats.cholesterolMg}mg</Text>
                  </View>
                )}
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Sodium</Text>
                  <Text style={styles.nutritionDetailVal}>{stats.sodiumMg}mg</Text>
                </View>
                {stats.ironMg > 0 && (
                  <View style={styles.nutritionDetailRow}>
                    <Text style={styles.nutritionDetailLabel}>Iron</Text>
                    <Text style={styles.nutritionDetailVal}>{stats.ironMg}mg</Text>
                  </View>
                )}
                {stats.calciumMg > 0 && (
                  <View style={styles.nutritionDetailRow}>
                    <Text style={styles.nutritionDetailLabel}>Calcium</Text>
                    <Text style={styles.nutritionDetailVal}>{stats.calciumMg}mg</Text>
                  </View>
                )}
                <View style={styles.nutritionDivider} />
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Servings</Text>
                  <Text style={styles.nutritionDetailVal}>{stats.servings}</Text>
                </View>
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Total Calories</Text>
                  <Text style={styles.nutritionDetailVal}>{stats.calories * stats.servings} kcal</Text>
                </View>
                <View style={styles.nutritionDetailRow}>
                  <Text style={styles.nutritionDetailLabel}>Total Protein</Text>
                  <Text style={styles.nutritionDetailVal}>{stats.proteinG * stats.servings}g</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.rateLabel}>Rate this recipe</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <TouchableOpacity
                key={i}
                onPress={() => {
                  if (Platform.OS === 'ios' || Platform.OS === 'android') {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  }
                  setStarRating(i);
                  if (recipe?.id) {
                    setRating(recipe.id, i);
                    submitCommunityRating(recipe.id, i).catch(() => {});
                  }
                }}
                style={styles.starTouch}
                activeOpacity={0.8}
              >
                <Text style={[styles.star, i <= starRating ? styles.starSelected : styles.starUnselected]}>
                  {i <= starRating ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.ratingLabelText}>{RATING_LABELS[starRating] ?? ''}</Text>

          {/* Community Review Section */}
          {!reviewSubmitted ? (
            <View style={styles.reviewSection}>
              <Text style={styles.reviewSectionTitle}>💬 Share your experience</Text>
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
                      await submitReview(recipe.id, starRating, reviewComment || RATING_LABELS[starRating] || 'Great recipe!');
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
                  {reviewSubmitting ? '⏳ Submitting...' : '📤 Submit Review'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.reviewSubmittedBox}>
              <Text style={styles.reviewSubmittedText}>✅ Thanks for your review!</Text>
            </View>
          )}

          <TouchableOpacity style={styles.btnCookAnother} onPress={handleCookAnother} activeOpacity={0.8}>
            <Text style={styles.btnCookAnotherText}>🏠 Cook Another</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnOutline} onPress={handleSendFeedback} activeOpacity={0.8}>
            <Text style={styles.btnOutlineText}>✉️ Send Feedback</Text>
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
            <ShareableRecipeCard recipe={recipe} stats={stats} />
          </ViewShot>
        </View>
      </ImageBackground>
    );
  }

  if (!step) {
    return (
      <ImageBackground
        source={require('../../assets/images/splash-bg.png')}
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
      source={require('../../assets/images/splash-bg.png')}
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
        <View style={{ width: 32 }} />
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
        <Text style={styles.stepLabel}>STEP {stepNum} of {totalSteps}</Text>
        <Text style={styles.stepTitle}>{step.title}</Text>

        {/* Step description */}
        <Text style={styles.stepDescription}>{step.description}</Text>

        {/* Ingredient pills */}
        {stepIngredients.length > 0 && (
          <View style={styles.ingredientsRow}>
            <Text style={styles.ingredientsLabel}>You'll need:</Text>
            <View style={styles.ingredientsPillsRow}>
              {stepIngredients.map((name, i) => (
                <View key={i} style={styles.ingredientPill}>
                  <Text style={styles.ingredientPillText}>{name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Step image or emoji */}
        <View style={styles.imageAreaWrapper}>
          {getRecipeStepImage(recipe.id, currentStep) ? (
            <Image
              source={getRecipeStepImage(recipe.id, currentStep)!}
              style={styles.stepImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.imageArea}>
              <Text style={styles.stepEmoji}>{stepEmoji}</Text>
            </View>
          )}
        </View>

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

        {/* Navigation row */}
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
      </ScrollView>
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
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  headerBack: { padding: 4, width: 32 },
  headerBackText: { color: '#FFFFFF', fontSize: 24 },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
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
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  progressSegmentBg: {
    flex: 1,
    height: 4,
    backgroundColor: DARK_GREY,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressSegmentFill: {
    height: '100%',
    borderRadius: 2,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16 },
  stepLabel: {
    color: ORANGE,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  stepTitle: {
    color: '#FFFFFF',
    fontSize: 30,
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
  stepImage: {
    width: '100%',
    height: 260,
    borderRadius: 14,
  },
  stepEmoji: { fontSize: 80 },
  stepDescription: {
    color: '#E8D8C8',
    fontSize: 17,
    lineHeight: 28,
    marginBottom: 14,
  },
  // Ingredient pills — compact horizontal row
  ingredientsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 6,
  },
  ingredientsLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '500',
    marginRight: 2,
  },
  ingredientsPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ingredientPill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  ingredientPillText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
  },
  // Chef's Tip — cream/beige card like reference
  tipCard: {
    backgroundColor: '#FFF8ED',
    borderRadius: 14,
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
    backgroundColor: '#2A1005',
    borderWidth: 2,
    borderColor: ORANGE,
    borderRadius: 14,
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
    color: 'rgba(255,255,255,0.4)',
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
    backgroundColor: '#E85D26',
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
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerStartBtnDisabled: { backgroundColor: DARK_GREY, opacity: 0.6 },
  timerStartBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  navRow: { flexDirection: 'row', gap: 12 },
  navPrevBtn: {
    flex: 0.4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  navBtnDisabled: { opacity: 0.3 },
  navPrevBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  navNextBtn: {
    flex: 0.6,
    backgroundColor: ORANGE,
    borderRadius: 14,
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
    fontFamily: Platform.OS === 'ios' || Platform.OS === 'android' ? 'PlayfairDisplay_700Bold' : SERIF_FONT,
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
  ratingLabelText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', marginBottom: 20 },

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
    backgroundColor: 'rgba(232,93,38,0.9)',
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
    backgroundColor: 'rgba(76,175,80,0.15)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.25)',
  },
  reviewSubmittedText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '700',
  },

  btnCookAnother: {
    backgroundColor: ORANGE_ACCENT,
    borderRadius: 14,
    paddingVertical: 18,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  btnCookAnotherText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  btnOutline: {
    borderWidth: 2,
    borderColor: DARK_CARD_GREEN,
    borderRadius: 14,
    paddingVertical: 18,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  btnOutlineText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});
