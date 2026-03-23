/**
 * RecipeCard.tsx — SpiceStrong
 * Compact recipe card with protein/rating top bar, hero image, and title.
 */

import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  type GestureResponderEvent,
  type ImageSourcePropType,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';

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
  isBuilding?: boolean;
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
  isBuilding,
  nutrition,
}: RecipeCardProps) {
  const cleanName = name.replace(/^High-Protein\s+/i, '');
  const nameParts = cleanName.includes(' (') ? cleanName.split(/ \((.+)\)$/) : [cleanName, ''];
  const recipeTitle = nameParts[0]?.trim() ?? cleanName;

  return (
    <Pressable
      style={({ pressed }) => [styles.cardShell, pressed && !isBuilding && styles.cardPressed, isBuilding && styles.cardBuilding]}
      onPress={isBuilding ? undefined : onPress}
      disabled={isBuilding}
    >
      <View style={styles.cardInner}>
        {/* Building overlay */}
        {isBuilding && (
          <View style={styles.buildingOverlay}>
            <Text style={styles.buildingEmoji}>👨‍🍳</Text>
            <Text style={styles.buildingTitle}>Crafting Your Recipe</Text>
            <Text style={styles.buildingSubtext}>Our SpiceBuilder chefs are working{'\n'}their magic in the kitchen</Text>
            <View style={styles.buildingDots}>
              <View style={styles.buildingDot} />
              <View style={[styles.buildingDot, styles.buildingDotMid]} />
              <View style={[styles.buildingDot, styles.buildingDotLast]} />
            </View>
            <Text style={styles.buildingComeBack}>Come back soon!</Text>
          </View>
        )}
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
                contentFit="cover"
                transition={200}
              />
            ) : (
              <>
                <View style={styles.heroEmojiGlow} pointerEvents="none" />
                <Text style={styles.heroEmoji}>{emoji}</Text>
              </>
            )}

            {/* ——— Macro pills top-left (stacked) ——— */}
            <View style={styles.statsOverlay}>
              <View style={styles.statPill}>
                <Text style={styles.statPillText}>💪 {protein || '—'}</Text>
              </View>
              {nutrition != null && nutrition.fatG > 0 && (
                <View style={styles.statPill}>
                  <Text style={styles.statPillText}>🧈 {Math.round(nutrition.fatG)}g fat</Text>
                </View>
              )}
              {nutrition != null && nutrition.carbsG > 0 && (
                <View style={styles.statPill}>
                  <Text style={styles.statPillText}>🍚 {Math.round(nutrition.carbsG)}g carbs</Text>
                </View>
              )}
            </View>

            {/* ——— Rating top-right ——— */}
            <View style={styles.ratingOverlay}>
              {communityLoading ? (
                <View style={styles.statPill}>
                  <Text style={styles.statPillText}>⭐ ···</Text>
                </View>
              ) : rating != null && rating !== '' ? (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); onRatingPress?.(); }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={styles.statPill}>
                    <Text style={styles.statPillText}>
                      ⭐ {rating}{communityCount != null ? ` (${communityCount})` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); onRatingPress?.(); }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={[styles.statPill, styles.statPillBlue]}>
                    <Text style={styles.statPillText}>⭐ New</Text>
                  </View>
                </TouchableOpacity>
              )}
              {cookCount != null && cookCount > 0 && (
                <View style={[styles.statPill, styles.statPillGreen, { marginTop: 4 }]}>
                  <Text style={styles.statPillText}>🍳 {cookCount} cooked</Text>
                </View>
              )}
              {actionRow && (
                <View style={{ marginTop: 4 }}>{actionRow}</View>
              )}
            </View>

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
    borderBottomWidth: 4,
    borderRightWidth: 2,
    borderBottomColor: '#D4D4D4',
    borderRightColor: '#E0E0E0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 3, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: { elevation: 8 },
    }),
  },
  cardInner: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  cardBuilding: {
    opacity: 0.85,
  },
  buildingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: 'rgba(26,10,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CARD_RADIUS,
    gap: 4,
    paddingHorizontal: 20,
  },
  buildingEmoji: {
    fontSize: 36,
    marginBottom: 4,
  },
  buildingTitle: {
    color: '#FFB347',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  buildingSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 17,
  },
  buildingDots: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 6,
  },
  buildingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFB347',
    opacity: 1,
  },
  buildingDotMid: {
    opacity: 0.6,
  },
  buildingDotLast: {
    opacity: 0.3,
  },
  buildingComeBack: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
    ...Platform.select({
      ios: { shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },

  // Stats overlay pills
  statsOverlay: {
    position: 'absolute',
    top: 10,
    left: 50,
    flexDirection: 'column',
    gap: 4,
    zIndex: 3,
  },
  ratingOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 3,
    alignItems: 'flex-end',
  },
  statPill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statPillGreen: {
    backgroundColor: 'rgba(22,163,74,0.7)',
  },
  statPillBlue: {
    backgroundColor: 'rgba(59,130,246,0.7)',
  },
  statPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
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
    fontSize: 20,
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
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 3,
    lineHeight: 17,
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
