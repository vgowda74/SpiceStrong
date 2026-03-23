import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { refreshRecipeCache, syncPendingAIRecipes } from '../services/recipeService';
// pruneImageCache disabled — expo-file-system new API causes TurboModule crash
// import { pruneImageCache } from '../services/imageCacheService';

// Tell the OS to show notifications even when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  useEffect(() => {
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
          lightColor: '#E85D26',
        });
        await Notifications.setNotificationChannelAsync('recipe', {
          name: 'Recipe Updates',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'default',
          lightColor: '#E85D26',
        });
      }
    })();

    // Background recipe sync & cache management
    refreshRecipeCache().catch(() => {});
    syncPendingAIRecipes().catch(() => {});
    // pruneImageCache disabled — causes TurboModule crash
    // pruneImageCache().catch(() => {});
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}