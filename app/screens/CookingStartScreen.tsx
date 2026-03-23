import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ImageBackground,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getRecipeById, SavedRecipe } from '../../src/store/recipes';
// Instacart integration removed — awaiting Developer API approval

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

  const GLOBAL_CART_KEY = 'globalShoppingList';
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [recipe, setRecipe] = useState<SavedRecipe | null>(null);
  const [cartItems, setCartItems] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!recipeId) return;
    getRecipeById(recipeId).then((r) => setRecipe(r ?? null));
    // Load global shopping list from AsyncStorage
    AsyncStorage.getItem(GLOBAL_CART_KEY).then((stored) => {
      if (stored) setCartItems(JSON.parse(stored));
    });
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
  const cartKeys = Object.keys(cartItems);
  const hasCart = cartKeys.length > 0;

  const handleStart = () => {
    const query: Record<string, string> = { recipeId: r.id };
    if (quantityTier) query.quantityTier = quantityTier;
    router.replace({ pathname: '/screens/CookingModeScreen', params: query });
  };

  const handleShareCart = async () => {
    // Group by recipe for sharing
    const grouped: Record<string, string[]> = {};
    Object.entries(cartItems).forEach(([key, recipeName]) => {
      if (!grouped[recipeName]) grouped[recipeName] = [];
      const [name, qty] = key.split('|||');
      grouped[recipeName].push(`  • ${qty} ${name}`);
    });
    const sections = Object.entries(grouped).map(([recipeName, items]) =>
      `📌 ${recipeName}\n${items.join('\n')}`
    ).join('\n\n');
    const message = `🛒 Shopping List\n\n${sections}\n\nCooked with SpiceStrong 💪`;
    try {
      await Share.share({ message });
    } catch (_) {}
  };

  const handleClearCart = () => {
    setCartItems({});
    AsyncStorage.removeItem(GLOBAL_CART_KEY);
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

        {hasCart && (
          <View>
            <View style={styles.cartActionsRow}>
              <TouchableOpacity style={styles.shareCartBtn} onPress={handleShareCart} activeOpacity={0.8}>
                <Ionicons name="cart" size={20} color="#4CAF50" />
                <Text style={styles.shareCartText}>Share List</Text>
                <View style={styles.shareCartBadge}>
                  <Text style={styles.shareCartBadgeText}>{cartKeys.length}</Text>
                </View>
                <Ionicons name="share-outline" size={18} color="rgba(255,255,255,0.6)" style={{ marginLeft: 4 }} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.clearCartBtn} onPress={handleClearCart} activeOpacity={0.8}>
                <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                <Text style={styles.clearCartText}>Clear</Text>
              </TouchableOpacity>
            </View>

{/* Instacart button removed — awaiting Developer API approval */}
          </View>
        )}

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
  cartActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginTop: 20,
    gap: 10,
  },
  shareCartBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(76, 175, 80, 0.4)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  clearCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 107, 107, 0.3)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 6,
  },
  clearCartText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '700',
  },
  // Instacart styles removed — awaiting Developer API approval
  shareCartText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  shareCartBadge: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  shareCartBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
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
