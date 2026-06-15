import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { handleAuthUrl } from '../../services/authService';

export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    Linking.getInitialURL()
      .then(async (url) => {
        if (url) await handleAuthUrl(url);
      })
      .finally(() => {
        router.replace('/screens/MagicLinkLoginScreen');
      });
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#E85D26" />
      <Text style={styles.text}>Signing you in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: '#0F0F0F',
  },
  text: {
    color: '#F8F1E8',
    fontSize: 15,
    fontWeight: '700',
  },
});
