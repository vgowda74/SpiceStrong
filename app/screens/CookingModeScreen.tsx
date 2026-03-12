import { useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ImageBackground,
  LayoutAnimation,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getRecipeById, SavedRecipe, BUILTIN_INGREDIENT_GROUPS, type CookingStep } from '../../src/store/recipes';
import { getRatings, setRating, getFavourites, setFavourites } from '../../src/store/ratingsFavourites';

const ENCOURAGEMENTS = [
  { emoji: '🎉', message: "Great start! You're on your way." },
  { emoji: '👏', message: 'Nice work! Looking good already.' },
  { emoji: '🔥', message: "You're crushing it! Keep going." },
  { emoji: '⭐', message: "Halfway there — you're doing great!" },
  { emoji: '🌟', message: 'Almost done! The hardest part is over.' },
  { emoji: '🏆', message: "Last step! You've got this, Chef!" },
];

function getStepEncouragement(recipe: SavedRecipe, stepIndex: number): { emoji: string; message: string } {
  const step = recipe.steps[stepIndex];
  const title = (step?.title ?? '').toLowerCase();
  const proteinName = recipe.proteinName ?? 'protein';
  if (title.includes('marinate') || title.includes('prep')) {
    return { emoji: '🌶️', message: `Nice! The ${proteinName} is soaking up all those flavours 🌶️` };
  }
  if (title.includes('sear') || title.includes('brown')) {
    return { emoji: '🔥', message: 'Perfect sear! That golden colour means amazing flavour 🔥' };
  }
  if (title.includes('spice') || title.includes('masala') || title.includes('garam')) {
    return { emoji: '✨', message: 'The kitchen must smell incredible right now! ✨' };
  }
  if (title.includes('sauce') || title.includes('gravy') || title.includes('simmer')) {
    return { emoji: '🍲', message: 'The sauce is coming together beautifully 🍲' };
  }
  if (stepIndex >= recipe.steps.length - 2) {
    return { emoji: '👨‍🍳', message: 'Almost there Chef! One final step 👨‍🍳' };
  }
  return ENCOURAGEMENTS[Math.min(stepIndex, ENCOURAGEMENTS.length - 1)];
}

function getIngredientsForStep(recipe: SavedRecipe, stepIndex: number): string[] {
  const groups = recipe.id ? BUILTIN_INGREDIENT_GROUPS[recipe.id] : undefined;
  const flat = groups
    ? groups.flatMap((g) => g.items.map((i) => i.name))
    : (recipe.ingredients['1lb'] ?? []).filter((i) => i.name.trim()).map((i) => i.name);
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

function getCompletionStats(recipe: SavedRecipe) {
  const isButterChicken = recipe.name.toLowerCase().includes('butter chicken');
  if (isButterChicken) {
    return { proteinG: 56, kcal: 480, cookTimeMin: 45 };
  }
  const isIndianPorkCurry = recipe.id === 'builtin-pork-indian-curry';
  if (isIndianPorkCurry) {
    return { proteinG: 31, kcal: 380, cookTimeMin: 40 };
  }
  const isHealthyEggCurry = recipe.id === 'builtin-eggs-healthy-curry';
  if (isHealthyEggCurry) {
    return { proteinG: 13, kcal: 280, cookTimeMin: 25 };
  }
  const proteinById: Record<string, number> = {
    chicken: 45,
    beef: 50,
    salmon: 42,
    pork: 48,
    turkey: 46,
  };
  const proteinG = proteinById[recipe.proteinId?.toLowerCase()] ?? 40;
  const cookTimeMin = recipe.steps.length * 8;
  return { proteinG, kcal: 400, cookTimeMin };
}

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [encouragement, setEncouragement] = useState<{ emoji: string; message: string } | null>(null);
  const encouragementSlide = useRef(new Animated.Value(300)).current;
  const encouragementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerReachedZeroRef = useRef(false);
  const [showTimerCompleteAlert, setShowTimerCompleteAlert] = useState(false);
  const timerCompleteSlide = useRef(new Animated.Value(300)).current;
  const timerCompleteAutoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      setTimerRunning(false);
    }
  }, [currentStep, recipe?.id]);

  useEffect(() => {
    if (timerRunning && timerSeconds > 0) {
      intervalRef.current = setInterval(() => {
        setTimerSeconds((s) => {
          if (s <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            timerReachedZeroRef.current = true;
            setTimerRunning(false);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerRunning]);

  useEffect(() => {
    return () => {
      if (encouragementTimeoutRef.current) clearTimeout(encouragementTimeoutRef.current);
      if (timerCompleteAutoDismissRef.current) clearTimeout(timerCompleteAutoDismissRef.current);
      Linking.openURL('clock-timer://stop').catch(() => null);
    };
  }, []);

  useEffect(() => {
    if (timerSeconds !== 0 || !timerReachedZeroRef.current) return;
    timerReachedZeroRef.current = false;
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

  const toggleTimer = () => {
    if (timerRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setTimerRunning(false);
    } else if (timerSeconds > 0) {
      setInitialTimerSeconds(timerSeconds);
      setTimerRunning(true);
      const minutes = Math.floor(timerSeconds / 60);
      const secs = timerSeconds % 60;
      const timeText =
        secs > 0
          ? `${minutes} minute${minutes !== 1 ? 's' : ''} and ${secs} seconds`
          : `${minutes} minute${minutes !== 1 ? 's' : ''}`;
      Linking.openURL(
        `shortcuts://run-shortcut?name=Timer&input=${encodeURIComponent(timeText)}`
      ).catch(() => {
        Linking.openURL('clock-timer://').catch(() => null);
      });
    }
  };

  const resetTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimerRunning(false);
    setTimerSeconds(stepTimerDefault);
    setInitialTimerSeconds(stepTimerDefault);
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
      const msg = recipe ? getStepEncouragement(recipe, currentStep) : ENCOURAGEMENTS[currentStep] ?? ENCOURAGEMENTS[0];
      setEncouragement(msg);
      encouragementSlide.setValue(300);
      Animated.spring(encouragementSlide, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
      if (encouragementTimeoutRef.current) clearTimeout(encouragementTimeoutRef.current);
      encouragementTimeoutRef.current = setTimeout(() => {
        encouragementTimeoutRef.current = null;
        Animated.timing(encouragementSlide, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => {
          setEncouragement(null);
          setCurrentStep((s) => s + 1);
        });
      }, 1800);
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
        await Share.share({ message: recipe.name, title: recipe.name });
      } catch (_) {}
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

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.proteinG}g</Text>
              <Text style={styles.statLabel}>PROTEIN</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.cookTimeMin}m</Text>
              <Text style={styles.statLabel}>COOK TIME</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{totalSteps}</Text>
              <Text style={styles.statLabel}>STEPS COMPLETED</Text>
            </View>
          </View>

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
                  if (recipe?.id) setRating(recipe.id, i);
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
      {encouragement ? (
        <Animated.View
          style={[
            styles.encouragementOverlay,
            { transform: [{ translateY: encouragementSlide }] },
          ]}
          pointerEvents="none"
        >
          <View style={styles.encouragementCard}>
            <Text style={styles.encouragementEmoji}>{encouragement.emoji}</Text>
            <Text style={styles.encouragementText}>{encouragement.message}</Text>
          </View>
        </Animated.View>
      ) : null}
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
      {/* Header: dark brown full width */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleExit} style={styles.headerBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.headerBackText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
        <Text style={styles.headerStepCount}>Step {stepNum} of {totalSteps}</Text>
      </View>

      {/* Segmented progress bar: one segment per step */}
      <View style={styles.progressRow}>
        {Array.from({ length: totalSteps }, (_, i) => {
          const completed = i < currentStep;
          const current = i === currentStep;
          const fill =
            completed ? 1 : current ? currentStepProgress : 0;
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
        {/* Step card */}
        <View style={styles.card}>
          <Text style={styles.stepLabel}>{stepLabel}</Text>
          <Text style={styles.stepTitle}>{step.title}</Text>
          <View style={styles.imageArea}>
            <Text style={styles.stepEmoji}>{stepEmoji}</Text>
          </View>
          <Text style={styles.stepDescription}>{step.description}</Text>
          {stepIngredients.length > 0 && (
            <>
              <Text style={styles.ingredientsHeader}>🧂 You'll need:</Text>
              <View style={styles.ingredientsPillsRow}>
                {stepIngredients.map((name, i) => (
                  <View key={i} style={styles.ingredientPill}>
                    <Text style={styles.ingredientPillText} numberOfLines={1}>{name}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
          {showTipBox && (
            <View style={styles.tipBox}>
              <Text style={styles.tipIcon}>💡</Text>
              <Text style={styles.tipText}>{tipText}</Text>
            </View>
          )}
        </View>

        {/* Timer */}
        <View style={styles.timerSection}>
          <View style={styles.timerDialRow}>
            <TouchableOpacity
              style={[styles.timerDialBtn, atMin && styles.timerDialBtnDisabled]}
              onPress={() => adjustTimerMinutes(-1)}
              disabled={atMin}
              activeOpacity={0.7}
            >
              <Text style={[styles.timerDialBtnText, atMin && styles.timerDialBtnTextDisabled]}>−</Text>
            </TouchableOpacity>

            <View style={styles.timerRectangle}>
              <Text style={styles.timerRectangleTime}>{formatTime(timerSeconds)}</Text>
            </View>

            <TouchableOpacity
              style={[styles.timerDialBtn, atMax && styles.timerDialBtnDisabled]}
              onPress={() => adjustTimerMinutes(1)}
              disabled={atMax}
              activeOpacity={0.7}
            >
              <Text style={[styles.timerDialBtnText, atMax && styles.timerDialBtnTextDisabled]}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.timerButtonsRow}>
            <TouchableOpacity
              style={[styles.timerStartBtn, atMin && styles.timerStartBtnDisabled]}
              onPress={toggleTimer}
              disabled={atMin}
              activeOpacity={0.8}
            >
              <Text style={styles.timerStartBtnText}>▶ Start Timer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.timerResetBtn}
              onPress={resetTimer}
              activeOpacity={0.8}
            >
              <Text style={styles.timerResetBtnText}>↺ Reset</Text>
            </TouchableOpacity>
          </View>
          {suggestedMin != null && (
            <Text style={styles.timerSuggestion}>💡 Suggested: {suggestedMin} min</Text>
          )}
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
              {currentStep === totalSteps - 1 ? 'Finish 🎉' : 'Next →'}
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
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  headerBack: { padding: 4 },
  headerBackText: { color: '#FFFFFF', fontSize: 24 },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  headerStepCount: { color: ORANGE, fontSize: 14, fontWeight: 'bold' },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
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
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 20 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 38, 0.15)',
  },
  stepLabel: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 3,
    marginBottom: 8,
  },
  stepTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 16,
    fontFamily: undefined,
  },
  imageArea: {
    backgroundColor: IMAGE_BG,
    borderRadius: 12,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  stepEmoji: { fontSize: 72 },
  stepDescription: {
    color: '#D4C4B0',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 16,
  },
  tipBox: {
    backgroundColor: '#4A2C1A',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  tipIcon: { fontSize: 16 },
  tipText: { color: '#D4C4B0', fontSize: 14, fontStyle: 'italic', flex: 1, lineHeight: 20 },
  ingredientsHeader: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 8,
  },
  ingredientsPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ingredientPill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  ingredientPillText: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  timerSection: { marginBottom: 24 },
  timerSuggestion: { fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 10 },
  encouragementOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 80,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  encouragementCard: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  encouragementEmoji: { fontSize: 56, marginBottom: 12 },
  encouragementText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },
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
  timerDialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 20,
  },
  timerDialBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: ORANGE,
    backgroundColor: HEADER_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerDialBtnDisabled: { opacity: 0.35, borderColor: '#555555' },
  timerDialBtnText: { color: ORANGE, fontSize: 28, fontWeight: '300', lineHeight: 32 },
  timerDialBtnTextDisabled: { color: '#666666' },
  timerRectangle: {
    backgroundColor: '#2A1005',
    borderWidth: 2,
    borderColor: '#E85D26',
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerRectangleTime: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: 'bold',
    fontFamily: SERIF_FONT,
    fontVariant: ['tabular-nums'],
  },
  timerButtonsRow: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  timerStartBtn: {
    flex: 1,
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  timerStartBtnDisabled: { backgroundColor: DARK_GREY, opacity: 0.6 },
  timerStartBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  timerResetBtn: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: DARK_GREY,
  },
  timerResetBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  navRow: { flexDirection: 'row', gap: 12 },
  navPrevBtn: {
    flex: 1,
    backgroundColor: HEADER_BG,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: DARK_GREY,
  },
  navBtnDisabled: { opacity: 0.35 },
  navPrevBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  navNextBtn: {
    flex: 1,
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  navNextBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
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
  ratingLabelText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', marginBottom: 24 },
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
