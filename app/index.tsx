import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ImageBackground,
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Index() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../assets/images/splash-bg.png')}
        style={styles.background}
        resizeMode="cover"
      >
        <View style={styles.overlay} />
        {/* Logo block centered at 52% from top */}
        <View style={styles.logoBlock} pointerEvents="none">
          <Text style={styles.titleRow}>
            <Text style={styles.titleSpice}>Spice</Text>
            <Text style={styles.titleStrong}>Strong</Text>
          </Text>
          <Text style={styles.subtitle}>GUIDED HIGH-PROTEIN COOKING</Text>
        </View>
        {/* Bottom 40%: dots + button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 48 }]}>
          <View style={styles.dots}>
            <View style={[styles.dot, styles.dotActive]} />
            <View style={[styles.dot, styles.dotInactive]} />
            <View style={[styles.dot, styles.dotInactive]} />
          </View>
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
              <Text style={styles.buttonText}>Get Started</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  logoBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '52%',
    alignItems: 'center',
    transform: [{ translateY: -45 }],
  },
  titleRow: {
    fontFamily: Platform.select({
      ios: 'PlayfairDisplay_700Bold',
      android: 'PlayfairDisplay_700Bold',
      default: 'serif',
    }),
    fontSize: 58,
  },
  titleSpice: {
    fontFamily: Platform.select({
      ios: 'PlayfairDisplay_700Bold',
      android: 'PlayfairDisplay_700Bold',
      default: 'serif',
    }),
    fontSize: 58,
    color: '#E85D26',
  },
  titleStrong: {
    fontFamily: Platform.select({
      ios: 'PlayfairDisplay_700Bold',
      android: 'PlayfairDisplay_700Bold',
      default: 'serif',
    }),
    fontSize: 58,
    color: '#F5ECD7',
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.80)',
    letterSpacing: 3.5,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: '#E85D26',
  },
  dotInactive: {
    width: 8,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  buttonWrapper: {
    width: '100%',
    marginHorizontal: 24,
    marginBottom: 0,
    shadowColor: '#E85D26',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    ...(Platform.OS === 'android' && {
      elevation: 8,
    }),
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
