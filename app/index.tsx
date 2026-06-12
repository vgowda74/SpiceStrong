import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ImageBackground,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDietPreference, setDietPreference, DIET_PREFERENCE_KEY, type DietPreference } from '../src/utils/dietPreference';

const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'PlayfairDisplay_700Bold',
  default: 'serif',
});

const FEATURES = [
  { emoji: '🍗', label: 'High-Protein Meals with Full Nutrition Breakdown', soon: false },
  { emoji: '🤖', label: 'Create Recipes for Your Exact Macro Needs', soon: false },
  { emoji: '📸', label: 'Turn Any Food Photo or Screenshot into a Recipe', soon: false },
  { emoji: '📅', label: 'Meal Plans Tailored to Your Fitness Goals', soon: false },
  { emoji: '🛒', label: 'Smart Grocery & Pantry Management', soon: false },
  { emoji: '📊', label: 'Track Calories by Snapping Your Meal or Label', soon: false },
  { emoji: '💪', label: 'Fitness Profile with AI Body Composition Scan', soon: false },
];

const DISCLAIMER_KEY = 'spicestrong_disclaimer_accepted';
const DIETARY_RESTRICTIONS_KEY = 'spicestrong_dietary_restrictions';

export default function Index() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [selectedPreference, setSelectedPreference] = useState<DietPreference | null>(null);
  const [savedPreference, setSavedPreference] = useState<DietPreference | null>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(DISCLAIMER_KEY),
      getDietPreference(),
    ]).then(([disclaimer, pref]) => {
      if (disclaimer === 'true') setDisclaimerAccepted(true);
      if (pref) {
        setSavedPreference(pref);
        setShowReturnModal(true);
      }
    });
  }, []);

  const handleContinue = () => {
    setShowReturnModal(false);
    router.push('/screens/ProteinSelectionScreen');
  };

  const handleResetDiet = async () => {
    await AsyncStorage.multiRemove([DIET_PREFERENCE_KEY, DIETARY_RESTRICTIONS_KEY]);
    setSavedPreference(null);
    setShowReturnModal(false);
  };

  const handleDietSelect = async (preference: DietPreference) => {
    setSelectedPreference(preference);
    await setDietPreference(preference);
    if (disclaimerAccepted) {
      router.push('/screens/ProteinSelectionScreen');
    } else {
      setShowDisclaimer(true);
    }
  };

  const handleAccept = async () => {
    await AsyncStorage.setItem(DISCLAIMER_KEY, 'true');
    await setDietPreference(selectedPreference ?? 'nonveg');
    setDisclaimerAccepted(true);
    setShowDisclaimer(false);
    router.push('/screens/ProteinSelectionScreen');
  };

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

        {/* Sticky footer CTA — only shown on first launch or after a reset */}
        {!savedPreference && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
            <Pressable
              style={styles.buttonWrapper}
              onPress={() => handleDietSelect('veg')}
            >
              <LinearGradient
                colors={['#2F8A45', '#155A2B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.button}
              >
                <Text style={styles.buttonText}>Vegetarian</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              style={styles.buttonWrapper}
              onPress={() => handleDietSelect('nonveg')}
            >
              <LinearGradient
                colors={['#A94724', '#742B17']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.button}
              >
                <Text style={styles.buttonText}>Non-Vegetarian</Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </ImageBackground>

      {/* Returning user modal */}
      <Modal visible={showReturnModal} transparent animationType="slide" onRequestClose={handleContinue}>
        <View style={styles.returnOverlay}>
          <View style={[styles.returnCard, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.returnHandle} />
            <Text style={styles.returnEmoji}>
              {savedPreference === 'veg' ? '🥦' : '🍗'}
            </Text>
            <Text style={styles.returnTitle}>Welcome back!</Text>
            <Text style={styles.returnSubtitle}>
              You're on the{' '}
              <Text style={styles.returnHighlight}>
                {savedPreference === 'veg' ? 'Vegetarian' : 'Non-Vegetarian'}
              </Text>
              {' '}plan with your dietary preferences saved.
            </Text>

            <TouchableOpacity
              style={styles.continueBtn}
              onPress={handleContinue}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={savedPreference === 'veg' ? ['#2F8A45', '#155A2B'] : ['#A94724', '#742B17']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.continueBtnGradient}
              >
                <Text style={styles.continueBtnText}>Continue</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resetBtn}
              onPress={handleResetDiet}
              activeOpacity={0.78}
            >
              <Text style={styles.resetBtnText}>Reset Dietary Choices</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Disclaimer Modal */}
      <Modal visible={showDisclaimer} transparent animationType="slide" onRequestClose={() => setShowDisclaimer(false)}>
        <View style={styles.disclaimerOverlay}>
          <View style={styles.disclaimerCard}>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '80%' }}>
              <Text style={styles.disclaimerEmoji}>🛡️</Text>
              <Text style={styles.disclaimerTitle}>Before You Start</Text>

              <Text style={styles.disclaimerHeading}>Health & Fitness Disclaimer</Text>
              <Text style={styles.disclaimerText}>
                SpiceStrong provides nutritional information and recipe suggestions for educational purposes only. This app is not a substitute for professional medical advice, diagnosis, or treatment. Always consult your physician, dietitian, or qualified healthcare provider before starting any new diet, exercise program, or making changes to your nutrition plan.
              </Text>

              <Text style={styles.disclaimerHeading}>Nutrition Data</Text>
              <Text style={styles.disclaimerText}>
                Nutritional values displayed in the app are estimates derived from third-party databases and AI analysis. Actual values may vary based on ingredients, portion sizes, cooking methods, and product formulations. SpiceStrong does not guarantee the accuracy of any nutritional information.
              </Text>

              <Text style={styles.disclaimerHeading}>Allergens & Dietary Needs</Text>
              <Text style={styles.disclaimerText}>
                While we flag common allergens, we cannot guarantee all allergens are identified. If you have food allergies or intolerances, always verify ingredients carefully. SpiceStrong is not responsible for allergic reactions or adverse health effects.
              </Text>

              <Text style={styles.disclaimerHeading}>AI-Generated Content</Text>
              <Text style={styles.disclaimerText}>
                Recipes, meal plans, and nutritional assessments may be generated using artificial intelligence. AI-generated content should be reviewed for accuracy before use. SpiceStrong is not liable for errors in AI-generated recommendations.
              </Text>

              <Text style={styles.disclaimerHeading}>Your Responsibility</Text>
              <Text style={styles.disclaimerText}>
                By using SpiceStrong, you acknowledge that you are solely responsible for your dietary choices and health decisions. Use all information at your own risk.
              </Text>

              {/* Terms checkbox */}
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setTermsChecked(!termsChecked)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, termsChecked && styles.checkboxChecked]}>
                  {termsChecked && <Text style={styles.checkboxMark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>
                  I have read and agree to the{' '}
                  <Text
                    style={styles.linkText}
                    onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}
                  >
                    Terms of Service
                  </Text>
                  {' '}and{' '}
                  <Text
                    style={styles.linkText}
                    onPress={() => Linking.openURL('https://www.spicestrong.app/privacy.html')}
                  >
                    Privacy Policy
                  </Text>
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Accept button */}
            <TouchableOpacity
              style={[styles.acceptBtn, !termsChecked && styles.acceptBtnDisabled]}
              onPress={handleAccept}
              disabled={!termsChecked}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={termsChecked ? ['#A94724', '#742B17'] : ['#555', '#444']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.acceptBtnGradient}
              >
                <Text style={styles.acceptBtnText}>I Agree & Continue</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDisclaimer(false)} activeOpacity={0.75}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    color: '#8F3A1F',
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
    backgroundColor: 'rgba(143,58,31,0.14)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.30)',
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
    color: '#8F3A1F',
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
    backgroundColor: 'rgba(143,58,31,0.25)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.5)',
  },
  soonText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8F3A1F',
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
    gap: 10,
  },
  buttonWrapper: {
    shadowColor: '#8F3A1F',
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

  // Disclaimer Modal
  disclaimerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  disclaimerCard: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 30,
    maxHeight: '90%',
  },
  disclaimerEmoji: { fontSize: 40, textAlign: 'center', marginBottom: 8 },
  disclaimerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    fontFamily: PLAYFAIR,
    marginBottom: 20,
  },
  disclaimerHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8F3A1F',
    marginTop: 16,
    marginBottom: 6,
  },
  disclaimerText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.70)',
    lineHeight: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 24,
    marginBottom: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.40)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#8F3A1F',
    borderColor: '#8F3A1F',
  },
  checkboxMark: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.70)',
    lineHeight: 20,
  },
  linkText: {
    color: '#8F3A1F',
    textDecorationLine: 'underline' as const,
    fontWeight: '700',
  },
  acceptBtn: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  acceptBtnDisabled: {
    opacity: 0.5,
  },
  acceptBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 16,
  },
  acceptBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: '600' },

  // Returning user modal
  returnOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.70)',
    justifyContent: 'flex-end',
  },
  returnCard: {
    backgroundColor: '#1A1209',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(143,58,31,0.30)',
    alignItems: 'center',
  },
  returnHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 20,
  },
  returnEmoji: {
    fontSize: 52,
    marginBottom: 12,
  },
  returnTitle: {
    fontFamily: PLAYFAIR,
    fontSize: 28,
    fontWeight: '800',
    color: '#F5ECD7',
    marginBottom: 10,
    textAlign: 'center',
  },
  returnSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  returnHighlight: {
    color: '#E8A87C',
    fontWeight: '800',
  },
  continueBtn: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#8F3A1F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
  },
  continueBtnGradient: {
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  resetBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  resetBtnText: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 14,
    fontWeight: '600',
  },
});
