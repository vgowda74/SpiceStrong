import React from 'react';
import { View, Text, StyleSheet, ImageBackground, Platform } from 'react-native';
import type { SavedRecipe } from '../src/store/recipes';

const ACCENT = '#E85D26';
const DARK_BG = '#1A0A00';
const WARM_CREAM = '#FFF8F0';
const WARM_TAN = '#F5E6D3';
const HEADER_BROWN = '#3D1A0A';
const BORDER_ORNAMENT = '#C4854C';

interface ShareableRecipeCardProps {
  recipe: SavedRecipe;
  stats?: { proteinG: number; kcal: number; cookTimeMin: number; servings?: number };
}

export default function ShareableRecipeCard({ recipe, stats }: ShareableRecipeCardProps) {
  // Get ingredients from first available tier
  const tiers = ['2-3 servings', '4-6 servings'] as const;
  const ingredientTier = tiers.find((t) => recipe.ingredients[t]?.length > 0) ?? '2-3 servings';
  const ingredients: { name: string; quantity: string }[] = recipe.ingredients[ingredientTier] ?? [];

  return (
    <View style={styles.cardOuter}>
      <ImageBackground
        source={require('../assets/images/splash-bg.png')}
        style={styles.bg}
        resizeMode="cover"
      >
        <View style={styles.overlay} />

        {/* Ornamental top border */}
        <View style={styles.ornamentTop}>
          <View style={styles.ornamentLine} />
          <View style={styles.ornamentDiamond}>
            <Text style={styles.ornamentDiamondText}>◆</Text>
          </View>
          <View style={styles.ornamentLine} />
        </View>

        {/* Recipe Title */}
        <View style={styles.titleBanner}>
          <Text style={styles.titleText} numberOfLines={2}>
            {recipe.proteinEmoji} {recipe.name}
          </Text>
        </View>

        {/* Stats bar */}
        {stats && (
          <View style={styles.statsBar}>
            <Text style={styles.statChip}>💪 {stats.proteinG}g protein</Text>
            <Text style={styles.statDot}>•</Text>
            <Text style={styles.statChip}>🔥 {stats.kcal} kcal</Text>
            <Text style={styles.statDot}>•</Text>
            <Text style={styles.statChip}>⏱️ {stats.cookTimeMin} min</Text>
          </View>
        )}

        {/* Two-column content */}
        <View style={styles.columnsWrap}>
          {/* Ingredients column */}
          <View style={styles.column}>
            <View style={styles.columnHeaderWrap}>
              <Text style={styles.columnHeader}>Ingredients</Text>
            </View>
            <View style={styles.columnContent}>
              {ingredients.slice(0, 14).map((ing, idx) => (
                <View key={idx} style={styles.ingredientRow}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.ingredientText} numberOfLines={2}>
                    <Text style={styles.ingredientBold}>{ing.quantity}</Text> {ing.name}
                  </Text>
                </View>
              ))}
              {ingredients.length > 14 && (
                <Text style={styles.moreText}>+{ingredients.length - 14} more...</Text>
              )}
            </View>
          </View>

          {/* Instructions column */}
          <View style={styles.column}>
            <View style={styles.columnHeaderWrap}>
              <Text style={styles.columnHeader}>Instructions</Text>
            </View>
            <View style={styles.columnContent}>
              {recipe.steps.slice(0, 8).map((step, idx) => (
                <View key={idx} style={styles.stepRow}>
                  <Text style={styles.stepNumber}>{idx + 1}.</Text>
                  <Text style={styles.stepText} numberOfLines={3}>
                    {step.title ? `${step.title}. ` : ''}{step.description}
                  </Text>
                </View>
              ))}
              {recipe.steps.length > 8 && (
                <Text style={styles.moreText}>+{recipe.steps.length - 8} more steps...</Text>
              )}
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.ornamentLineFooter} />
          <View style={styles.footerContent}>
            <Text style={styles.brandText}>
              <Text style={styles.brandSpice}>Spice</Text>
              <Text style={styles.brandStrong}>Strong</Text>
            </Text>
            <Text style={styles.tagline}>High Protein • Indian Recipes</Text>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    width: 900,
    height: 600,
    borderRadius: 0,
    overflow: 'hidden',
  },
  bg: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,10,0,0.75)',
  },

  // Ornamental border
  ornamentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 16,
  },
  ornamentLine: {
    flex: 1,
    height: 2,
    backgroundColor: BORDER_ORNAMENT,
  },
  ornamentDiamond: {
    marginHorizontal: 8,
  },
  ornamentDiamondText: {
    color: BORDER_ORNAMENT,
    fontSize: 12,
  },

  // Title
  titleBanner: {
    alignItems: 'center',
    paddingHorizontal: 30,
    marginTop: 10,
    marginBottom: 6,
  },
  titleText: {
    color: WARM_CREAM,
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  statChip: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '700',
  },
  statDot: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
  },

  // Columns
  columnsWrap: {
    flexDirection: 'row',
    flex: 1,
    paddingHorizontal: 20,
    gap: 16,
  },
  column: {
    flex: 1,
    backgroundColor: 'rgba(255,248,240,0.92)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  columnHeaderWrap: {
    backgroundColor: ACCENT,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  columnHeader: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 1,
  },
  columnContent: {
    padding: 12,
    flex: 1,
  },

  // Ingredients
  ingredientRow: {
    flexDirection: 'row',
    marginBottom: 3,
    alignItems: 'flex-start',
  },
  bullet: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '800',
    marginRight: 6,
    marginTop: 1,
  },
  ingredientText: {
    color: HEADER_BROWN,
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  ingredientBold: {
    fontWeight: '800',
    color: '#1a1a1a',
  },

  // Steps
  stepRow: {
    flexDirection: 'row',
    marginBottom: 4,
    alignItems: 'flex-start',
  },
  stepNumber: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: '800',
    marginRight: 6,
    minWidth: 18,
  },
  stepText: {
    color: HEADER_BROWN,
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },

  moreText: {
    color: '#999',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
  },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: 10,
  },
  ornamentLineFooter: {
    height: 2,
    backgroundColor: BORDER_ORNAMENT,
    marginBottom: 8,
  },
  footerContent: {
    alignItems: 'center',
  },
  brandText: {
    fontSize: 20,
    fontWeight: '800',
  },
  brandSpice: {
    color: ACCENT,
  },
  brandStrong: {
    color: '#FFFFFF',
  },
  tagline: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 2,
    textTransform: 'uppercase',
  },
});
