import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Premium } from '../../src/theme/premium';

export default function SplashScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(13,11,9,0.25)', 'rgba(13,11,9,0.70)', Premium.color.ink]}
        style={StyleSheet.absoluteFill}
      />
      <TouchableOpacity
        style={styles.content}
        onPress={() => router.push('/screens/ProteinSelectionScreen')}
        activeOpacity={0.9}
      >
        <View style={styles.mark}>
          <Text style={styles.markText}>SS</Text>
        </View>

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>Guided High-Protein Cooking</Text>
          <Text style={styles.title}>SpiceStrong</Text>
          <Text style={styles.subtitle}>Build powerful meals with bold flavor, clean macros, and chef-guided steps.</Text>
        </View>

        <LinearGradient colors={[Premium.color.spiceSoft, Premium.color.spice]} style={styles.cta}>
          <Text style={styles.ctaText}>Get Started</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Premium.color.ink,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 92,
    paddingBottom: 44,
    justifyContent: 'space-between',
  },
  mark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Premium.color.lineStrong,
    backgroundColor: 'rgba(248,241,232,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: {
    color: Premium.color.cream,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  copy: {
    marginTop: 'auto',
    marginBottom: 34,
  },
  eyebrow: {
    color: Premium.color.brass,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    fontSize: 52,
    lineHeight: 56,
    fontWeight: '800',
    color: Premium.color.cream,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 25,
    color: Premium.color.creamMuted,
    marginTop: 16,
    maxWidth: 330,
  },
  cta: {
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Premium.color.spice,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
});
