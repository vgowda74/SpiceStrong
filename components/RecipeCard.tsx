/**
 * RecipeCard.tsx — SpiceStrong
 * Premium editorial / App Store–style recipe card with cinematic hero,
 * layered food pedestal, creamy info panel, and refined typography.
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

/** Base unit for spacing scale (4px grid). */
const SPACE = 4;
const CARD_RADIUS = 24;
const HERO_HEIGHT = 180;
/** Hero content area for Image only; emoji is rendered full-area without a frame. */
const HERO_CONTENT_WIDTH = 140;
const HERO_CONTENT_HEIGHT = 140;

export type RecipeDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface RecipeCardProps {
  name: string;
  description: string;
  time: string;
  protein: string;
  difficulty: RecipeDifficulty;
  /** If undefined, "✨ New" badge is shown. */
  rating: string | undefined;
  /** Community rating count (e.g. 127). If provided, shown as "⭐ 4.6 (127)" */
  communityCount?: number;
  /** Whether community ratings are still loading */
  communityLoading?: boolean;
  /** Placeholder emoji when no image; hero content frame is sized for <Image /> (e.g. expo-image) when provided. */
  emoji: string;
  /** Optional image source for hero; when set, render image inside heroContentFrame instead of emoji. */
  imageSource?: ImageSourcePropType;
  isFavorite: boolean;
  onPress: () => void;
  onFavoriteToggle: (e: GestureResponderEvent) => void;
  /** Called when the rating pill is tapped */
  onRatingPress?: () => void;
  /** Gradient [start, end] for hero background. */
  accentColors: readonly [string, string];
  /** Optional row below stats (e.g. Edit/Delete for custom recipes). */
  actionRow?: React.ReactNode;
}

const DIFFICULTY_LABELS: Record<RecipeDifficulty, string> = {
  Easy: '🍃 Easy',
  Medium: '🔥 Medium',
  Hard: '⚡ Hard',
};

export function RecipeCard({
  name,
  description,
  time,
  protein,
  difficulty,
  rating,
  communityCount,
  communityLoading,
  emoji,
  isFavorite,
  onPress,
  onFavoriteToggle,
  onRatingPress,
  accentColors,
  actionRow,
  imageSource,
}: RecipeCardProps) {
  const difficultyLabel = DIFFICULTY_LABELS[difficulty];
  const nameParts = name.includes(' (') ? name.split(/ \((.+)\)$/) : [name, ''];
  const recipeTitle = nameParts[0]?.trim() ?? name;
  const recipeSubtitle = nameParts[1] ? ` (${nameParts[1]})` : '';

  return (
    <Pressable
      style={({ pressed }) => [styles.cardShell, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.cardInner}>
        {/* ————— HERO (height 260, gloss overlay, bottom fade, glow circle) ————— */}
        <View style={styles.heroWrap} pointerEvents="box-none">
          <LinearGradient
            colors={[accentColors[0], accentColors[1]]}
            style={styles.heroGradient}
          >
            {/* Gloss overlay on top of gradient */}
            <LinearGradient
              colors={['rgba(255,255,255,0.25)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.heroGloss}
              pointerEvents="none"
            />
            {/* Bottom fade into white */}
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.15)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.heroBottomFade}
              pointerEvents="none"
            />
            {/* Glow circle behind emoji */}
            <View style={styles.heroEmojiGlow} pointerEvents="none" />
            {imageSource != null ? (
              <Image
                source={imageSource}
                style={styles.heroFullImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.heroEmoji}>{emoji}</Text>
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

            {/* Difficulty badge removed */}
          </LinearGradient>
        </View>

        {/* ————— INFO SECTION (white, padding 18) ————— */}
        <View style={styles.infoSection}>
          <View style={styles.infoContent}>
            <Text style={styles.recipeTitle} numberOfLines={1}>{recipeTitle}</Text>
            {recipeSubtitle ? <Text style={styles.recipeSubtitle} numberOfLines={1}>{recipeSubtitle}</Text> : null}

            <Text style={styles.description} numberOfLines={2}>{description}</Text>

            <View style={styles.statsRow}>
              <View style={styles.statsLeft}>
                <Text style={styles.statsMeta}>⏱ {time}</Text>
              </View>
              <View style={styles.statsRight}>
                {protein ? (
                  <Text style={styles.proteinText}>{protein}</Text>
                ) : null}
                {communityLoading ? (
                  <View style={styles.ratingPill}>
                    <Text style={styles.ratingPillText}>⭐ ···</Text>
                  </View>
                ) : rating != null && rating !== '' ? (
                  <TouchableOpacity
                    style={styles.ratingPill}
                    onPress={(e) => {
                      e.stopPropagation();
                      onRatingPress?.();
                    }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.ratingPillText}>
                      ⭐ {rating}{communityCount != null ? ` (${communityCount})` : ''}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.newPill}
                    onPress={(e) => {
                      e.stopPropagation();
                      onRatingPress?.();
                    }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.newPillText}>⭐ New</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Action row removed */}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardShell: {
    marginHorizontal: SPACE * 4,
    marginVertical: SPACE * 3,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(100,40,0,1)',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
      },
      android: { elevation: 16 },
    }),
  },
  cardInner: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
    ...Platform.select({
      ios: { shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 8 },
    }),
  },

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
    height: 80,
  },
  heroBottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  heroEmojiGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
  },
  heroContentFrame: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    width: HERO_CONTENT_WIDTH,
    height: HERO_CONTENT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -18,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
    overflow: 'hidden',
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(36,24,16,0.22)',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.42,
        shadowRadius: 18,
      },
      android: { elevation: 5 },
    }),
  },
  heroImage: {
    width: '100%',
    height: '100%',
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
    fontSize: 120,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.2)',
        textShadowOffset: { width: 2, height: 6 },
        textShadowRadius: 10,
      },
    }),
  },

  favouriteBtn: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 2,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 4 },
    }),
  },
  favouriteStar: {
    fontSize: 20,
    color: '#999999',
  },
  favouriteStarFilled: {
    color: '#FFD700',
  },

  difficultyBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    backgroundColor: 'rgba(40,15,5,0.80)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 5 },
    }),
  },
  difficultyBadgeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  infoSection: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    marginTop: 0,
    overflow: 'hidden',
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
  },
  infoContent: {
    paddingTop: 0,
  },
  recipeTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  recipeSubtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: '#666666',
  },
  description: {
    fontSize: 13,
    color: '#888888',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statsLeft: {
    flexDirection: 'row',
    gap: 14,
  },
  statsMeta: {
    fontSize: 14,
    color: '#555555',
  },
  statsRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  proteinText: {
    fontSize: 14,
    color: '#E85D26',
    fontWeight: '700',
  },
  ratingPill: {
    backgroundColor: 'rgba(255,200,50,0.15)',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  ratingPillText: {
    color: '#D4920A',
    fontSize: 13,
    fontWeight: '700',
  },
  newPill: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  newPillText: {
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: '600',
  },
  actionRowWrap: {
    marginTop: SPACE * 3,
  },
});

export default RecipeCard;
