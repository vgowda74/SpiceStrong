import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { refreshRecipeCache, syncPendingAIRecipes } from '../services/recipeService';
import { generateScanInstrImages } from '../services/imageGenerationService';
import { getDeviceId } from '../services/adminService';
import { initPurchases } from '../services/purchaseService';
import { trackAppOpen } from '../services/analyticsService';
import { initFirebaseAnalytics } from '../services/firebaseAnalytics';
// pruneImageCache disabled — expo-file-system new API causes TurboModule crash
// import { pruneImageCache } from '../services/imageCacheService';

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
    getDeviceId();
    trackAppOpen().catch(() => {});
    // Firebase Analytics — install/open tracking for Google Ads conversions
    initFirebaseAnalytics().catch(() => {});
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
    // Pre-cache body-scan instruction images from Supabase Storage so they're
    // instant the first time the user opens the body-scan instructions screen.
    generateScanInstrImages().catch(() => {});
    // pruneImageCache disabled — causes TurboModule crash
    // pruneImageCache().catch(() => {});
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0F0F0F' } }} />
  );
}
