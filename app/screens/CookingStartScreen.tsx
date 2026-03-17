import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ImageBackground,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getRecipeById, SavedRecipe } from '../../src/store/recipes';

const ORANGE = '#E85D26';
const PLAYFAIR = Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'PlayfairDisplay_700Bold', default: 'serif' });

function getCookTimeMin(recipe: SavedRecipe): number {
  const total = recipe.steps.reduce((acc, s) => acc + (s.timerMinutes ?? 0), 0);
  return total > 0 ? total : recipe.steps.length * 8;
}

export default function CookingStartScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ recipeId: string; quantityTier?: string }>();
  const recipeId = typeof params.recipeId === 'string' ? params.recipeId : Array.isArray(params.recipeId) ? params.recipeId[0] : undefined;
  const quantityTier = typeof params.quantityTier === 'string' ? params.quantityTier : Array.isArray(params.quantityTier) ? params.quantityTier?.[0] : undefined;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [recipe, setRecipe] = useState<SavedRecipe | null>(null);

  useEffect(() => {
    if (!recipeId) return;
    getRecipeById(recipeId).then((r) => setRecipe(r ?? null));
  }, [recipeId]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const r = recipe;
  if (!r) {
    return (
      <ImageBackground source={require('../../assets/images/splash-bg.jpg')} style={styles.bg} resizeMode="cover">
        <View style={styles.overlay} />
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </ImageBackground>
    );
  }

  const cookTime = getCookTimeMin(r);
  const difficulty = 'Medium';
  const handleStart = () => {
    const query: Record<string, string> = { recipeId: r.id };
    if (quantityTier) query.quantityTier = quantityTier;
    router.replace({ pathname: '/screens/CookingModeScreen', params: query });
  };

  return (
    <ImageBackground source={require('../../assets/images/splash-bg.jpg')} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay} />
      <View style={styles.container}>
        <Animated.Text style={[styles.emoji, { transform: [{ scale: pulseAnim }] }]}>👨‍🍳</Animated.Text>
        <Text style={styles.title}>Great Choice!</Text>
        <Text style={styles.subtitle}>Let's Cook Together</Text>

        <View style={styles.card}>
          <Text style={styles.recipeName}>{r.name}</Text>
          <View style={styles.pillsRow}>
            <View style={styles.pill}><Text style={styles.pillText}>🍗 {r.proteinName}</Text></View>
            <View style={styles.pill}><Text style={styles.pillText}>⏱ {cookTime} min</Text></View>
            <View style={styles.pill}><Text style={styles.pillText}>🔥 {difficulty}</Text></View>
          </View>
        </View>

        <Text style={styles.motivating}>
          Follow each step carefully and take your time — SpiceStrong will guide you through every step.
        </Text>

        <View style={styles.tipBox}>
          <Text style={styles.tipLabel}>💡 Chef Tip</Text>
          <Text style={styles.tipText}>
            Read each step once before starting the timer — it makes cooking much smoother.
          </Text>
        </View>

        <TouchableOpacity style={styles.btnWrap} onPress={handleStart} activeOpacity={0.85}>
          <LinearGradient colors={['#F07030', '#C84A10']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
            <Text style={styles.btnText}>Let's Start Cooking! 🚀</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#FFFFFF', fontSize: 16 },
  container: { flex: 1, paddingTop: 56, paddingHorizontal: 24, alignItems: 'center' },
  emoji: { fontSize: 80, marginBottom: 16 },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: PLAYFAIR,
    textAlign: 'center',
  },
  subtitle: { fontSize: 20, color: 'rgba(255,255,255,0.85)', marginBottom: 32 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 24,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  recipeName: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 16 },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    backgroundColor: 'rgba(232,93,38,0.3)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  pillText: { color: ORANGE, fontWeight: '700', fontSize: 13 },
  motivating: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginHorizontal: 24,
    marginTop: 20,
  },
  tipBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 24,
    marginTop: 16,
    borderLeftWidth: 4,
    borderLeftColor: ORANGE,
    alignSelf: 'stretch',
  },
  tipLabel: { color: ORANGE, fontWeight: '700', fontSize: 13, marginBottom: 6 },
  tipText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  btnWrap: {
    marginHorizontal: 24,
    marginBottom: 40,
    marginTop: 'auto',
    width: '100%',
    maxWidth: 400,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  btn: {
    backgroundColor: ORANGE,
    borderRadius: 16,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
});
