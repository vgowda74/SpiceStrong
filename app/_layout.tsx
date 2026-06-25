import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

export default function RootLayout() {
  useEffect(() => {
    const startupTimer = setTimeout(() => {
      // Keep first paint free of native-module startup work on Android.
      // Every task is lazy-imported and isolated so a failed integration cannot
      // crash the splash-to-landing transition.
      import('../services/analyticsService')
        .then(({ trackAppOpen }) => trackAppOpen())
        .catch(() => {});

      import('../services/inAppEventNotificationService')
        .then(({ initializeInAppEventNotifications }) => initializeInAppEventNotifications())
        .catch(() => {});

      import('../services/recipeService')
        .then(({ refreshRecipeCache, syncPendingAIRecipes }) => {
          refreshRecipeCache().catch(() => {});
          syncPendingAIRecipes().catch(() => {});
        })
        .catch(() => {});

      import('../services/firebaseAnalytics')
        .then(({ initFirebaseAnalytics, setFirebaseUserId, setFirebaseUserProperties }) => {
          initFirebaseAnalytics().catch(() => {});
          Promise.all([
            import('../services/adminService').then(({ getDeviceId }) => getDeviceId()),
            import('../services/fitnessProfileService').then(({ getFitnessProfile }) => getFitnessProfile()),
            import('../services/dietaryService').then(({ getDietaryRestrictions }) => getDietaryRestrictions()),
            import('../services/subscriptionService').then(({ isPremium }) => isPremium()),
          ]).then(([deviceId, profile, dietary, isPremium]) => {
            setFirebaseUserId(deviceId).catch(() => {});
            setFirebaseUserProperties({
              fitness_goal: profile?.goal ?? 'unknown',
              dietary_tags: [...(dietary.allergenTags ?? []), ...(dietary.dietaryTags ?? [])].join(',') || 'none',
              subscription: isPremium ? 'premium' : 'free',
              platform: Platform.OS,
            }).catch(() => {});
          }).catch(() => {});
        })
        .catch(() => {});

      if (Platform.OS !== 'android') {
        import('../services/purchaseService')
          .then(({ initPurchases }) => initPurchases())
          .catch(() => {});

        import('../services/imageGenerationService')
          .then(({ generateScanInstrImages }) => generateScanInstrImages())
          .catch(() => {});
        import('../services/imageCacheService')
          .then(({ pruneImageCache }) => pruneImageCache())
          .catch(() => {});
      }
    }, 1200);

    return () => {
      clearTimeout(startupTimer);
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0F0F0F' } }} />
  );
}
