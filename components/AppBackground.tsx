import { type ReactNode } from 'react';
import { ImageBackground, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { useAppDisplayTheme } from '../src/theme/displayThemes';

type AppBackgroundProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  imageSource?: ImageSourcePropType;
  imageOpacity?: number;
  overlayOpacity?: number;
};

export function AppBackground({
  children,
  style,
  imageSource,
  imageOpacity = 0.04,
  overlayOpacity = 0,
}: AppBackgroundProps) {
  const theme = useAppDisplayTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.background }, style]}>
      {imageSource && (
        <ImageBackground
          source={imageSource}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          imageStyle={{ opacity: imageOpacity }}
        />
      )}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: theme.textureOverlay },
        ]}
      />
      {overlayOpacity > 0 && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(13,11,9,${overlayOpacity})` },
          ]}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
