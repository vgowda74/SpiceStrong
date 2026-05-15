import type { ReactNode } from 'react';
import { ImageBackground, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type PremiumScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  overlayOpacity?: number;
};

export function PremiumScreen({ children, style, overlayOpacity = 0.76 }: PremiumScreenProps) {
  return (
    <ImageBackground
      source={require('../assets/images/splash-bg.jpg')}
      style={styles.bg}
      resizeMode="cover"
    >
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: `rgba(13,11,9,${overlayOpacity})` },
        ]}
      />
      <View style={[styles.content, style]}>{children}</View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
  },
  content: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
