import React from 'react';
import { View, Text, StyleSheet, ImageBackground, Platform } from 'react-native';
import { Image } from 'expo-image';
import type { ImageSourcePropType } from 'react-native';
import type { SavedRecipe } from '../src/store/recipes';

const BANNER_RED = '#7B1A1A';
const CREAM_BG = 'rgba(245,230,200,0.92)';
const DARK_BROWN = '#100604';
const STEP_RED = '#9B2C2C';
const PHOTO_BORDER = '#FFFFFF';
const ACCENT = '#8F3A1F';

interface ShareableRecipeCardProps {
  recipe: SavedRecipe;
  stats?: { proteinG: number; calories: number; servings?: number };
  dishImage?: ImageSourcePropType | { uri: string } | null;
  stepImages?: Record<number, ImageSourcePropType | { uri: string } | null>;
  ingredientImages?: Record<string, ImageSourcePropType | undefined>;
}

export default function ShareableRecipeCard({
  recipe,
  stats,
  dishImage,
  stepImages,
  ingredientImages,
}: ShareableRecipeCardProps) {
  const tiers = ['2-3 servings', '4-6 servings'] as const;
  const ingredientTier = tiers.find((t) => recipe.ingredients[t]?.length > 0) ?? '2-3 servings';
  const ingredients: { name: string; quantity: string }[] = recipe.ingredients[ingredientTier] ?? [];

  const MAX_INGREDIENTS = 12;
  const MAX_STEPS = 7;

  const description = recipe.description ?? '';

  return (
    <View style={styles.cardOuter}>
      <ImageBackground
        source={require('../assets/images/splash-bg.jpg')}
        style={styles.bg}
        resizeMode="cover"
      >
        <View style={styles.overlay} />

        {/* ===== TITLE BANNER ===== */}
        <View style={styles.titleBanner}>
          <Text style={styles.titleText} numberOfLines={2}>
            {recipe.name}
          </Text>
        </View>

        {/* ===== HERO DISH IMAGE (top-right) ===== */}
        {dishImage && (
          <View style={styles.heroWrap}>
            <View style={styles.heroFrame}>
              <Image source={dishImage as ImageSourcePropType} style={styles.heroImage} resizeMode="cover" />
            </View>
          </View>
        )}

        {/* ===== DESCRIPTION below title ===== */}
        {description ? (
          <View style={styles.descriptionWrap}>
            <Text style={styles.descriptionText} numberOfLines={2}>
              {description}
            </Text>
            {stats && (
              <Text style={styles.statsText}>
                💪 {stats.proteinG}g protein  •  🔥 {stats.calories} kcal
              </Text>
            )}
          </View>
        ) : stats ? (
          <View style={styles.descriptionWrap}>
            <Text style={styles.statsText}>
              💪 {stats.proteinG}g protein  •  🔥 {stats.calories} kcal
            </Text>
          </View>
        ) : null}

        {/* ===== TWO-COLUMN BODY: Ingredients (left) | Instructions (right) ===== */}
        <View style={styles.columnsRow}>

          {/* ---- LEFT: Ingredients with inline images ---- */}
          <View style={styles.column}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>Ingredients</Text>
            </View>
            <View style={styles.sectionBody}>
              {ingredients.slice(0, MAX_INGREDIENTS).map((ing, idx) => {
                const ingImg = ingredientImages?.[ing.name];
                return (
                  <View key={idx} style={styles.ingredientRow}>
                    {ingImg ? (
                      <Image source={ingImg} style={styles.ingThumb} resizeMode="cover" />
                    ) : (
                      <View style={styles.ingBulletWrap}>
                        <Text style={styles.ingBullet}>•</Text>
                      </View>
                    )}
                    <Text style={styles.ingredientText} numberOfLines={2}>
                      <Text style={styles.ingredientBold}>{ing.quantity}</Text>
                      {'  '}{ing.name}
                    </Text>
                  </View>
                );
              })}
              {ingredients.length > MAX_INGREDIENTS && (
                <Text style={styles.moreText}>+{ingredients.length - MAX_INGREDIENTS} more...</Text>
              )}
            </View>
          </View>

          {/* ---- RIGHT: Instructions with inline step images ---- */}
          <View style={styles.column}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>Instructions</Text>
            </View>
            <View style={styles.sectionBody}>
              {recipe.steps.slice(0, MAX_STEPS).map((step, idx) => {
                const stepImg = stepImages?.[idx];
                return (
                  <View key={idx} style={styles.stepRow}>
                    <View style={styles.stepLeft}>
                      <View style={styles.stepNumCircle}>
                        <Text style={styles.stepNumText}>{idx + 1}</Text>
                      </View>
                      <View style={styles.stepTextWrap}>
                        <Text style={styles.stepTitle} numberOfLines={1}>
                          {step.title || `Step ${idx + 1}`}:
                        </Text>
                        <Text style={styles.stepDesc} numberOfLines={2}>
                          {step.description}
                        </Text>
                      </View>
                    </View>
                    {stepImg && (
                      <View style={styles.stepPhotoFrame}>
                        <Image source={stepImg as ImageSourcePropType} style={styles.stepPhoto} resizeMode="cover" />
                      </View>
                    )}
                  </View>
                );
              })}
              {recipe.steps.length > MAX_STEPS && (
                <Text style={styles.moreText}>+{recipe.steps.length - MAX_STEPS} more steps...</Text>
              )}
            </View>
          </View>
        </View>

        {/* ===== FOOTER ===== */}
        <View style={styles.footer}>
          <Text style={styles.brandText}>
            <Text style={styles.brandSpice}>Spice</Text>
            <Text style={styles.brandStrong}>Strong</Text>
          </Text>
          <Text style={styles.urlText}>www.spicestrong.app</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    width: 1400,
    height: 900,
    overflow: 'hidden',
  },
  bg: {
    flex: 1,
    backgroundColor: DARK_BROWN,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: DARK_BROWN,
  },

  /* ===== TITLE BANNER ===== */
  titleBanner: {
    backgroundColor: BANNER_RED,
    paddingVertical: 12,
    paddingHorizontal: 30,
    alignSelf: 'flex-start',
    marginTop: 18,
    marginLeft: 20,
    borderRadius: 4,
    maxWidth: '72%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
    }),
  },
  titleText: {
    color: '#FFF8F0',
    fontSize: 40,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontStyle: 'italic',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  /* ===== HERO DISH (top-right) ===== */
  heroWrap: {
    position: 'absolute',
    top: 10,
    right: 18,
    zIndex: 10,
    transform: [{ rotate: '4deg' }],
  },
  heroFrame: {
    width: 170,
    height: 170,
    borderRadius: 12,
    borderWidth: 6,
    borderColor: PHOTO_BORDER,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 2, height: 4 } },
      android: { elevation: 12 },
    }),
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },

  /* ===== DESCRIPTION ===== */
  descriptionWrap: {
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 6,
    maxWidth: '72%',
  },
  descriptionText: {
    color: 'rgba(255,248,240,0.85)',
    fontSize: 17,
    fontStyle: 'italic',
    lineHeight: 23,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  statsText: {
    color: ACCENT,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },

  /* ===== TWO-COLUMN BODY ===== */
  columnsRow: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 6,
    gap: 14,
  },
  column: {
    flex: 1,
    backgroundColor: CREAM_BG,
    borderRadius: 10,
    overflow: 'hidden',
  },
  sectionHeader: {
    backgroundColor: BANNER_RED,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  sectionHeaderText: {
    color: '#FFF8F0',
    fontSize: 22,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontStyle: 'italic',
    letterSpacing: 1,
  },
  sectionBody: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    flex: 1,
  },

  /* ===== INGREDIENTS (left column) ===== */
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
    minHeight: 38,
  },
  ingThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  ingBulletWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingBullet: {
    color: DARK_BROWN,
    fontSize: 22,
    fontWeight: '800',
  },
  ingredientText: {
    color: DARK_BROWN,
    fontSize: 17,
    flex: 1,
    lineHeight: 22,
  },
  ingredientBold: {
    fontWeight: '800',
    color: '#1a1a1a',
  },

  /* ===== INSTRUCTIONS (right column) ===== */
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
    minHeight: 60,
  },
  stepLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  stepNumCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: STEP_RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNumText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  stepTextWrap: {
    flex: 1,
  },
  stepTitle: {
    color: DARK_BROWN,
    fontSize: 16,
    fontWeight: '800',
  },
  stepDesc: {
    color: '#555',
    fontSize: 14,
    lineHeight: 19,
  },
  stepPhotoFrame: {
    width: 58,
    height: 58,
    borderWidth: 3,
    borderColor: PHOTO_BORDER,
    borderRadius: 8,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 1, height: 2 } },
      android: { elevation: 4 },
    }),
  },
  stepPhoto: {
    width: '100%',
    height: '100%',
  },

  moreText: {
    color: '#888',
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 4,
    paddingLeft: 10,
  },

  /* ===== FOOTER ===== */
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  brandText: {
    fontSize: 30,
    fontWeight: '800',
  },
  brandSpice: {
    color: ACCENT,
  },
  brandStrong: {
    color: '#FFFFFF',
  },
  urlText: {
    color: ACCENT,
    fontSize: 20,
    fontWeight: '700',
    textDecorationLine: 'underline',
    letterSpacing: 0.3,
  },
});
