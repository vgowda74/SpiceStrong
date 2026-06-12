/**
 * FridgeRecipeResultsScreen.tsx — SpiceStrong
 * Displays recipe matches from the fridge scan, grouped by tier:
 *   - Ready to Cook (90%+)
 *   - Almost There (60-89%)
 *   - Worth a Trip (30-59%)
 * Fallback: AI Chef card if fewer than 3 good matches.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ProcessingRing } from '../../components/ProcessingRing';
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  matchRecipes,
  type MatchedRecipe,
  type ScannedIngredient,
} from '../../services/fridgeScanService';
import { getRecipeImageUrls } from '../../services/recipeService';
import { loadRecipeImages } from '../../services/imageGenerationService';
import { getRecipeCardImage } from '../../src/data/recipeImages';
import { PremiumScreen } from '../../components/PremiumScreen';
import { HomeButton } from '../../components/HomeButton';

const ORANGE = '#8F3A1F';
const SURFACE = 'rgba(248,241,232,0.08)';
const BORDER = 'rgba(248,241,232,0.12)';
const CARD_W = Dimensions.get('window').width - 48;
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'PlayfairDisplay_700Bold',
  default: 'serif',
});

const TIER_CONFIG = {
  ready: { label: 'Ready to Cook', emoji: '✅', color: '#22C55E' },
  almost: { label: 'Almost There', emoji: '🔶', color: '#F59E0B' },
  trip: { label: 'Worth a Trip', emoji: '🛒', color: 'rgba(255,255,255,0.50)' },
};

export default function FridgeRecipeResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<MatchedRecipe[]>([]);
  const [images, setImages] = useState<Record<string, any>>({});

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('spicestrong_fridge_scan');
        if (!raw) { setLoading(false); return; }
        const ingredients: ScannedIngredient[] = JSON.parse(raw);
        const matched = await matchRecipes(ingredients);
        setResults(matched);

        // Resolve images in background
        const imgMap: Record<string, any> = {};
        for (const m of matched.slice(0, 20)) {
          try {
            const urls = await getRecipeImageUrls(m.recipe.id);
            if (urls.heroUrl) { imgMap[m.recipe.id] = { uri: urls.heroUrl }; continue; }
          } catch {}
          try {
            const ai = await loadRecipeImages(m.recipe.id);
            if (ai?.dishImage) { imgMap[m.recipe.id] = { uri: ai.dishImage }; continue; }
          } catch {}
          const builtin = getRecipeCardImage(m.recipe.id);
          if (builtin) imgMap[m.recipe.id] = builtin;
        }
        setImages(imgMap);
      } catch (err) {
        console.error('[SpiceStrong] Fridge results error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const grouped = {
    ready: results.filter((r) => r.tier === 'ready'),
    almost: results.filter((r) => r.tier === 'almost'),
    trip: results.filter((r) => r.tier === 'trip'),
  };

  const goodMatchCount = grouped.ready.length + grouped.almost.length;

  return (
    <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recipe Matches</Text>
        <HomeButton />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ProcessingRing label="Matching recipes…" sublabel="Finding the best matches for your ingredients" expectedMs={5000} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary */}
          <View style={styles.summary}>
            <Text style={styles.summaryCount}>{results.length}</Text>
            <Text style={styles.summaryLabel}>recipes match your ingredients</Text>
          </View>

          {/* Tier sections */}
          {(['ready', 'almost', 'trip'] as const).map((tier) => {
            const items = grouped[tier];
            if (items.length === 0) return null;
            const config = TIER_CONFIG[tier];
            return (
              <View key={tier} style={styles.tierSection}>
                <View style={styles.tierHeader}>
                  <Text style={styles.tierEmoji}>{config.emoji}</Text>
                  <Text style={[styles.tierLabel, { color: config.color }]}>{config.label}</Text>
                  <Text style={styles.tierCount}>{items.length}</Text>
                </View>

                {items.map((match) => {
                  const recipe = match.recipe;
                  const img = images[recipe.id];
                  return (
                    <TouchableOpacity
                      key={recipe.id}
                      style={styles.card}
                      onPress={() => router.push({
                        pathname: '/screens/RecipeOverviewScreen',
                        params: { recipeId: recipe.id, quantityTier: '2-3 servings' },
                      })}
                      activeOpacity={0.8}
                    >
                      {/* Hero */}
                      <View style={styles.cardHero}>
                        {img ? (
                          <Image source={img} style={styles.cardHeroImg} contentFit="cover" />
                        ) : (
                          <LinearGradient colors={['#3D1A0A', '#1A0500']} style={styles.cardHeroFallback}>
                            <Text style={styles.cardHeroEmoji}>{recipe.proteinEmoji}</Text>
                          </LinearGradient>
                        )}
                        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.cardHeroGradient} />
                        {/* Match badge */}
                        <View style={[styles.matchBadge, { backgroundColor: `${config.color}20`, borderColor: `${config.color}60` }]}>
                          <Text style={[styles.matchBadgeText, { color: config.color }]}>{match.matchPercent}% match</Text>
                        </View>
                      </View>

                      {/* Body */}
                      <View style={styles.cardBody}>
                        <Text style={styles.cardTitle} numberOfLines={2}>
                          {recipe.name.replace(/^High-Protein\s+/i, '')}
                        </Text>
                        <View style={styles.cardPills}>
                          <View style={styles.cardPill}>
                            <Text style={styles.cardPillText}>{recipe.proteinEmoji} {recipe.proteinName}</Text>
                          </View>
                        </View>

                        {/* Missing ingredients */}
                        {match.missingIngredients.length > 0 && (
                          <View style={styles.missingWrap}>
                            <Text style={styles.missingLabel}>Missing:</Text>
                            <Text style={styles.missingItems}>
                              {match.missingIngredients.slice(0, 4).join(', ')}
                              {match.missingIngredients.length > 4 ? ` +${match.missingIngredients.length - 4} more` : ''}
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}

          {/* AI Chef fallback */}
          {goodMatchCount < 3 && (
            <TouchableOpacity
              style={styles.aiChefCard}
              onPress={() => router.push('/screens/AIRecipeBuilderScreen')}
              activeOpacity={0.8}
            >
              <LinearGradient colors={['#3D1A0A', '#1A0500']} style={styles.aiChefGradient}>
                <Text style={styles.aiChefEmoji}>👨‍🍳</Text>
                <Text style={styles.aiChefTitle}>No perfect match?</Text>
                <Text style={styles.aiChefSub}>Let AI create a custom recipe with your ingredients</Text>
                <View style={styles.aiChefBtn}>
                  <Text style={styles.aiChefBtnText}>Try AI Chef</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Empty state */}
          {results.length === 0 && !loading && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>🍽</Text>
              <Text style={styles.emptyTitle}>No matches found</Text>
              <Text style={styles.emptySub}>Try scanning more items or let AI create a recipe for you</Text>
              <TouchableOpacity
                style={styles.aiChefBtn}
                onPress={() => router.push('/screens/AIRecipeBuilderScreen')}
              >
                <Text style={styles.aiChefBtnText}>Try AI Chef</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </PremiumScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: 'rgba(255,255,255,0.55)' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(248,241,232,0.12)',
  },
  backBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,11,9,0.54)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  back: { fontSize: 28, lineHeight: 30, color: '#FFFFFF', fontWeight: '900' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', fontFamily: PLAYFAIR },

  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  // Summary
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 24 },
  summaryCount: { fontSize: 36, fontWeight: '800', color: ORANGE, fontFamily: PLAYFAIR },
  summaryLabel: { fontSize: 15, color: 'rgba(255,255,255,0.60)', fontWeight: '500' },

  // Tier sections
  tierSection: { marginBottom: 28 },
  tierHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  tierEmoji: { fontSize: 16 },
  tierLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  tierCount: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.30)', marginLeft: 'auto' },

  // Recipe card
  card: {
    width: CARD_W,
    backgroundColor: SURFACE,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BORDER,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 6 },
    }),
  },
  cardHero: { height: 140, position: 'relative' },
  cardHeroImg: { width: '100%', height: '100%' },
  cardHeroFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  cardHeroEmoji: { fontSize: 48 },
  cardHeroGradient: { ...StyleSheet.absoluteFillObject },
  matchBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  matchBadgeText: { fontSize: 12, fontWeight: '800' },

  cardBody: { padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', lineHeight: 22, marginBottom: 8 },
  cardPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  cardPill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  cardPillText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },

  // Missing ingredients
  missingWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  missingLabel: { fontSize: 12, fontWeight: '700', color: ORANGE },
  missingItems: { fontSize: 12, color: 'rgba(255,255,255,0.45)', flex: 1 },

  // AI Chef fallback
  aiChefCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.30)',
  },
  aiChefGradient: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  aiChefEmoji: { fontSize: 48 },
  aiChefTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  aiChefSub: { fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 20 },
  aiChefBtn: {
    marginTop: 8,
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  aiChefBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  emptySub: { fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 22, marginBottom: 10 },
});
