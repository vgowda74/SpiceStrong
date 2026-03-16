/**
 * RecipeCard.tsx — SpiceStrong
 * Compact recipe card with protein/rating top bar, hero image, and title.
 */

import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  type GestureResponderEvent,
  type ImageSourcePropType,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const SPACE = 4;
const CARD_RADIUS = 20;
const HERO_HEIGHT = 160;

export type RecipeDifficulty = 'Easy' | 'Medium' | 'Hard';

/** Nutrition info to display on the card. */
export interface CardNutrition {
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
}

export interface RecipeCardProps {
  name: string;
  description: string;
  time: string;
  protein: string;
  difficulty: RecipeDifficulty;
  rating: string | undefined;
  communityCount?: number;
  communityLoading?: boolean;
  cookCount?: number;
  emoji: string;
  imageSource?: ImageSourcePropType;
  isFavorite: boolean;
  onPress: () => void;
  onFavoriteToggle: (e: GestureResponderEvent) => void;
  onRatingPress?: () => void;
  accentColors: readonly [string, string];
  actionRow?: React.ReactNode;
  nutrition?: CardNutrition;
}

export function RecipeCard({
  name,
  description,
  protein,
  rating,
  communityCount,
  communityLoading,
  cookCount,
  emoji,
  isFavorite,
  onPress,
  onFavoriteToggle,
  onRatingPress,
  accentColors,
  actionRow,
  imageSource,
}: RecipeCardProps) {
  const nameParts = name.includes(' (') ? name.split(/ \((.+)\)$/) : [name, ''];
  const recipeTitle = nameParts[0]?.trim() ?? name;

  // Build rating display
  let ratingDisplay: React.ReactNode;
  if (communityLoading) {
    ratingDisplay = <Text style={styles.topBarText}>⭐ ···</Text>;
  } else if (rating != null && rating !== '') {
    ratingDisplay = (
      <TouchableOpacity
        onPress={(e) => { e.stopPropagation(); onRatingPress?.(); }}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.topBarText}>
          ⭐ {rating}{communityCount != null ? ` (${communityCount})` : ''}
        </Text>
      </TouchableOpacity>
    );
  } else {
    ratingDisplay = (
      <TouchableOpacity
        onPress={(e) => { e.stopPropagation(); onRatingPress?.(); }}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.topBarTextNew}>⭐ New</Text>
      </TouchableOpacity>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.cardShell, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.cardInner}>
        {/* ——— TOP BAR: Protein + Cook Count + Rating ——— */}
        <View style={styles.topBar}>
          <Text style={styles.topBarProtein}>💪 {protein || '—'}</Text>
          {cookCount != null && cookCount > 0 && (
            <Text style={styles.topBarCookCount}>🍳 {cookCount} cooked</Text>
          )}
          {ratingDisplay}
        </View>

        {/* ——— HERO IMAGE ——— */}
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={[accentColors[0], accentColors[1]]}
            style={styles.heroGradient}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.heroGloss}
              pointerEvents="none"
            />
            {imageSource != null ? (
              <Image
                source={imageSource}
                style={styles.heroFullImage}
                resizeMode="cover"
              />
            ) : (
              <>
                <View style={styles.heroEmojiGlow} pointerEvents="none" />
                <Text style={styles.heroEmoji}>{emoji}</Text>
              </>
            )}

            <TouchableOpacity
              style={styles.favouriteBtn}
              onPress={onFavoriteToggle}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.85}
            >
              <Text style={[styles.favouriteStar, isFavorite && styles.favouriteStarFilled]}>
                {isFavorite ? '★' : '☆'}
              </Text>
            </TouchableOpacity>

            {actionRow && (
              <View style={styles.deleteCorner}>{actionRow}</View>
            )}

            {/* ——— Name + Description overlay on image ——— */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.heroTextOverlay}
              pointerEvents="none"
            >
              <Text style={styles.heroTitle} numberOfLines={1}>{recipeTitle}</Text>
              {description ? (
                <Text style={styles.heroDescription} numberOfLines={2}>{description}</Text>
              ) : null}
            </LinearGradient>
          </LinearGradient>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardShell: {
    marginHorizontal: SPACE * 4,
    marginVertical: SPACE * 2,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(30,15,5,0.6)',
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(100,40,0,1)',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  cardInner: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
    ...Platform.select({
      ios: { shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#FAF8F5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EDE9E3',
  },
  topBarProtein: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E85D26',
  },
  topBarText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D4920A',
  },
  topBarTextNew: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  topBarCookCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16A34A',
  },

  // Hero
  heroWrap: {
    height: HERO_HEIGHT,
  },
  heroGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  heroEmojiGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
  },
  heroFullImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  heroEmoji: {
    fontSize: 80,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.2)',
        textShadowOffset: { width: 2, height: 4 },
        textShadowRadius: 8,
      },
    }),
  },

  favouriteBtn: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 2,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 3 },
    }),
  },
  favouriteStar: {
    fontSize: 18,
    color: '#999999',
  },
  favouriteStarFilled: {
    color: '#FFD700',
  },

  deleteCorner: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
  },

  // Hero text overlay
  heroTextOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 30,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
    }),
  },
  heroDescription: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
    lineHeight: 15,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.4)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
      },
    }),
  },
});

export default RecipeCard;
