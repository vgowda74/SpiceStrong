import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { refreshRecipeCache, syncPendingAIRecipes } from '../services/recipeService';
import { getDeviceId } from '../services/adminService';
import { initPurchases, checkSubscription } from '../services/purchaseService';
import { trackAppOpen } from '../services/analyticsService';
import { initFirebaseAnalytics, setFirebaseUserId, setFirebaseUserProperties } from '../services/firebaseAnalytics';
import { getFitnessProfile } from '../services/fitnessProfileService';
import { getDietaryRestrictions } from '../services/dietaryService';

const isExpoGo = Constants.appOwnership === 'expo';

// Tell the OS to show notifications even when the app is foregrounded
if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export default function RootLayout() {
  useEffect(() => {
    // Log device ID on startup for admin setup
    trackAppOpen().catch(() => {});
    // Firebase Analytics — install/open tracking + user property enrichment
    initFirebaseAnalytics().catch(() => {});
    (async () => {
      try {
        const [deviceId, profile, dietary, isPremium] = await Promise.all([
          getDeviceId(),
          getFitnessProfile(),
          getDietaryRestrictions(),
          checkSubscription(),
        ]);
        setFirebaseUserId(deviceId).catch(() => {});
        setFirebaseUserProperties({
          fitness_goal: profile?.goal ?? 'unknown',
          dietary_tags: [...(dietary.allergenTags ?? []), ...(dietary.dietaryTags ?? [])].join(',') || 'none',
          subscription: isPremium ? 'premium' : 'free',
          platform: Platform.OS,
        }).catch(() => {});
      } catch {}
    })();
    // Initialize RevenueCat for IAP
    initPurchases();

    if (!isExpoGo) {
      // Request notification permissions on app start
      (async () => {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
        // Android needs a notification channel
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('timer', {
            name: 'Cooking Timer',
            importance: Notifications.AndroidImportance.MAX,
            sound: 'default',
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#8F3A1F',
          });
          await Notifications.setNotificationChannelAsync('recipe', {
            name: 'Recipe Updates',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
            lightColor: '#8F3A1F',
          });
          await Notifications.setNotificationChannelAsync('recipe-review', {
            name: 'Recipe Reviews',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
            lightColor: '#8F3A1F',
          });
        }
      })();
    } else if (__DEV__) {
      console.log('[SpiceStrong] Notifications skipped in Expo Go. Use a development build to test notifications.');
    }

    // Background recipe sync & cache management
    refreshRecipeCache().catch(() => {});
    syncPendingAIRecipes().catch(() => {});
    // Avoid Android startup filesystem work. This app previously hit Android
    // TurboModule crashes from expo-file-system during launch; do cache work
    // lazily from the feature screens instead of blocking app open.
    if (Platform.OS !== 'android') {
      import('../services/imageGenerationService')
        .then(({ generateScanInstrImages }) => generateScanInstrImages())
        .catch(() => {});
      import('../services/imageCacheService')
        .then(({ pruneImageCache }) => pruneImageCache())
        .catch(() => {});
    }
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0F0F0F' } }} />
  );
}
