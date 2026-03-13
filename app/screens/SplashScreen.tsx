import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

export default function SplashScreen() {
  const router = useRouter();

  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={() => router.push('/screens/ProteinSelectionScreen')}>
      <Text style={styles.emoji}>💪</Text>
      <Text style={styles.title}>SpiceStrong</Text>
      <Text style={styles.subtitle}>Guided High-Protein Cooking</Text>
      <Text style={styles.tap}>Tap to begin</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 36, fontWeight: 'bold', color: '#E85D26' },
  subtitle: { fontSize: 16, color: '#999999', marginTop: 8 },
  tap: { fontSize: 13, color: '#555555', marginTop: 40 },
});