import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'PlayfairDisplay_700Bold',
  default: 'serif',
});

const FEATURES = [
  { emoji: '🍗', label: 'High Protein Recipes', soon: false },
  { emoji: '🛒', label: 'Grocery Shopping', soon: false },
  { emoji: '📅', label: 'Meal Plan', soon: true },
  { emoji: '🤖', label: 'AI Recipe Builder', soon: false },
  { emoji: '✍️', label: 'Add & Publish Your Own Recipes', soon: false },
  { emoji: '📊', label: 'Nutrition Details', soon: false },
];

export default function Index() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../assets/images/splash-bg.jpg')}
        style={styles.background}
        resizeMode="cover"
      >
        <View style={styles.overlay} />

        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 140 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoBlock}>
            <Text style={styles.titleRow}>
              <Text style={styles.titleSpice}>Spice</Text>
              <Text style={styles.titleStrong}>Strong</Text>
            </Text>
            <Text style={styles.tagline}>GUIDED HIGH-PROTEIN COOKING</Text>
          </View>

          {/* Story card */}
          <View style={styles.storyCard}>
            <Text style={styles.storyHeadline}>
              Diet is{' '}
              <Text style={styles.storyHighlight}>80%</Text>
              {' '}of your health.
            </Text>
            <Text style={styles.storyBody}>
              You can train hard every day — but what you eat shapes your body, energy, and recovery far more than any workout. SpiceStrong makes it easy to eat right, every single day.
            </Text>
          </View>

          {/* Why protein section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💪 Why Protein Matters</Text>
            <View style={styles.proteinCard}>
              <View style={styles.proteinRow}>
                <Text style={styles.proteinIcon}>🏋️</Text>
                <View style={styles.proteinTextBlock}>
                  <Text style={styles.proteinLabel}>Builds Muscle</Text>
                  <Text style={styles.proteinDesc}>Protein is the raw material your muscles use to repair and grow after every workout.</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.proteinRow}>
                <Text style={styles.proteinIcon}>🔥</Text>
                <View style={styles.proteinTextBlock}>
                  <Text style={styles.proteinLabel}>Burns Fat</Text>
                  <Text style={styles.proteinDesc}>High-protein meals keep you full longer, reduce cravings, and boost your metabolism.</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.proteinRow}>
                <Text style={styles.proteinIcon}>⚡</Text>
                <View style={styles.proteinTextBlock}>
                  <Text style={styles.proteinLabel}>Sustains Energy</Text>
                  <Text style={styles.proteinDesc}>Protein stabilises blood sugar so your energy stays consistent throughout the day.</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Feature list */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{"✨ What's Inside"}</Text>
            {FEATURES.map((f) => (
              <View key={f.label} style={styles.featureRow}>
                <Text style={styles.featureEmoji}>{f.emoji}</Text>
                <Text style={styles.featureLabel}>{f.label}</Text>
                {f.soon && (
                  <View style={styles.soonBadge}>
                    <Text style={styles.soonText}>SOON</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Sticky footer CTA */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          <Pressable
            style={styles.buttonWrapper}
            onPress={() => router.push('/screens/ProteinSelectionScreen')}
          >
            <LinearGradient
              colors={['#F07030', '#C84A10']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Get Started →</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  background: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  scroll: {
    paddingHorizontal: 24,
  },

  // Logo
  logoBlock: {
    alignItems: 'center',
    marginBottom: 28,
  },
  titleRow: {
    fontFamily: PLAYFAIR,
    fontSize: 54,
  },
  titleSpice: {
    fontFamily: PLAYFAIR,
    fontSize: 54,
    color: '#E85D26',
  },
  titleStrong: {
    fontFamily: PLAYFAIR,
    fontSize: 54,
    color: '#F5ECD7',
  },
  tagline: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.70)',
    letterSpacing: 3.5,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },

  // Story card
  storyCard: {
    backgroundColor: 'rgba(232,93,38,0.14)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.30)',
    padding: 20,
    marginBottom: 28,
  },
  storyHeadline: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: PLAYFAIR,
    marginBottom: 10,
    lineHeight: 30,
  },
  storyHighlight: {
    color: '#E85D26',
    fontFamily: PLAYFAIR,
  },
  storyBody: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 22,
  },

  // Sections
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 14,
    textTransform: 'uppercase',
  },

  // Protein card
  proteinCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 18,
    paddingVertical: 4,
  },
  proteinRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    gap: 14,
  },
  proteinIcon: {
    fontSize: 28,
    marginTop: 2,
  },
  proteinTextBlock: {
    flex: 1,
  },
  proteinLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  proteinDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 19,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },

  // Feature list
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  featureEmoji: {
    fontSize: 22,
  },
  featureLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  soonBadge: {
    backgroundColor: 'rgba(232,93,38,0.25)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.5)',
  },
  soonText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E85D26',
    letterSpacing: 1,
  },

  // Footer CTA
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  buttonWrapper: {
    shadowColor: '#E85D26',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    ...(Platform.OS === 'android' && { elevation: 8 }),
  },
  button: {
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
