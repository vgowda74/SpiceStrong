import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type PremiumScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  overlayOpacity?: number;
};

export function PremiumScreen({ children, style, overlayOpacity = 0.76 }: PremiumScreenProps) {
  return (
    <View style={styles.bg}>
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: `rgba(16,6,4,${overlayOpacity})` },
        ]}
      />
      <View style={[styles.content, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#100604',
  },
  content: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
