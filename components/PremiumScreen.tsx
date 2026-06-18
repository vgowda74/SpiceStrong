import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { getAppDisplayThemeId, getDisplayTheme, subscribeToDisplayTheme, type AppDisplayThemeId } from '../src/theme/displayThemes';

type PremiumScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  overlayOpacity?: number;
};

export function PremiumScreen({ children, style, overlayOpacity = 0.76 }: PremiumScreenProps) {
  const [themeId, setThemeId] = useState<AppDisplayThemeId>('warmTan');
  const theme = getDisplayTheme(themeId);
  const readabilityOverlay = themeId === 'warmTan'
    ? Math.min(0.34, overlayOpacity * 0.28)
    : Math.min(0.24, overlayOpacity * 0.20);

  useEffect(() => {
    let mounted = true;
    getAppDisplayThemeId().then((nextThemeId) => {
      if (mounted) setThemeId(nextThemeId);
    }).catch(() => {});
    const unsubscribe = subscribeToDisplayTheme(setThemeId);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <View style={[styles.bg, { backgroundColor: theme.background }]}>
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: theme.textureOverlay },
        ]}
      />
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: `rgba(13,11,9,${readabilityOverlay})` },
        ]}
      />
      <View style={[styles.content, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  content: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
