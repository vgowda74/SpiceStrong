/**
 * ScanMenuScreen.tsx — SpiceStrong
 * Restaurant menu scanner — photograph a menu, get high-protein recommendations.
 * - Claude identifies menu items + estimates macros
 * - Color-coded: green (high protein), yellow (moderate), red (avoid)
 * - Dietary restriction flags
 * - "Best choice for your goals" recommendation
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getDietaryRestrictions } from '../../services/dietaryService';

const ORANGE = '#E85D26';
const BG = '#0F0F0F';
const SURFACE = '#1A1A1A';
const BORDER = 'rgba(255,255,255,0.08)';
const GREEN = '#22C55E';
const YELLOW = '#F59E0B';
const RED = '#EF4444';
const PLAYFAIR = Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'PlayfairDisplay_700Bold', default: 'serif' });

interface MenuItem {
  name: string;
  description: string;
  estimatedCalories: number;
  estimatedProteinG: number;
  estimatedCarbsG: number;
  estimatedFatG: number;
  proteinDensity: number;
  rating: 'excellent' | 'good' | 'poor' | 'avoid';
  dietaryFlags: string[];
  recommendation: string;
}

export default function ScanMenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [bestChoice, setBestChoice] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState('');

  const pickImage = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setImageUri(result.assets[0].uri);
      setMenuItems([]);
      setError(null);
      setBestChoice('');
      analyzeMenu(result.assets[0].uri);
    }
  };

  const analyzeMenu = async (uri: string) => {
    setScanning(true);
    setError(null);
    try {
      const manipulated = await manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.5, format: SaveFormat.JPEG, base64: true },
      );
      const b64 = manipulated.base64 || '';

      const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
      if (!apiKey) throw new Error('No API key');

      // Get dietary restrictions
      const dietary = await getDietaryRestrictions();
      const dietaryContext = dietary.allergenTags.length > 0
        ? `User's dietary restrictions: ${dietary.allergenTags.join(', ')}.`
        : '';

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 3000,
          system: `You are a fitness nutrition expert analyzing a restaurant menu. For each menu item visible, estimate macros and rate it for a high-protein fitness diet.

${dietaryContext}

Return ONLY this JSON:
{
  "restaurantName": "Restaurant name if visible, or 'Restaurant Menu'",
  "bestChoice": "Name of the single best item for high-protein fitness goals with a brief reason why",
  "items": [
    {
      "name": "Dish name",
      "description": "Brief description from menu",
      "estimatedCalories": number,
      "estimatedProteinG": number,
      "estimatedCarbsG": number,
      "estimatedFatG": number,
      "rating": "excellent|good|poor|avoid",
      "dietaryFlags": ["Contains dairy", "High sodium"],
      "recommendation": "One sentence — why it's good or bad for fitness"
    }
  ]
}

RATING RULES:
- "excellent": proteinG/calories*100 >= 6.4 AND reasonable macros
- "good": proteinG/calories*100 >= 4.0 AND moderate macros
- "poor": low protein density OR very high fat/carbs
- "avoid": fried, heavy cream, excessive sugar, very low protein

If the image is NOT a menu, return: {"error": "not_menu"}
Estimate portions as typically served at restaurants (larger than home portions).`,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
              { type: 'text', text: 'Analyze this restaurant menu. Rate each item for high-protein fitness nutrition.' },
            ],
          }],
        }),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const start = text.indexOf('{');
      let depth = 0, end = -1;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end === -1) throw new Error('Could not parse menu');
      const parsed = JSON.parse(text.slice(start, end));

      if (parsed.error === 'not_menu') {
        setError('This doesn\'t look like a restaurant menu. Try a clearer photo of the menu.');
        setScanning(false);
        return;
      }

      setRestaurantName(parsed.restaurantName || 'Restaurant Menu');
      setBestChoice(parsed.bestChoice || '');

      const items: MenuItem[] = (parsed.items || []).map((item: any) => ({
        ...item,
        proteinDensity: item.estimatedCalories > 0 ? (item.estimatedProteinG / item.estimatedCalories) * 100 : 0,
      }));

      // Sort: excellent first, then good, poor, avoid
      const ratingOrder = { excellent: 0, good: 1, poor: 2, avoid: 3 };
      items.sort((a: MenuItem, b: MenuItem) => (ratingOrder[a.rating] ?? 3) - (ratingOrder[b.rating] ?? 3));

      setMenuItems(items);
    } catch (err: any) {
      setError(err?.message || 'Could not analyze the menu.');
    } finally {
      setScanning(false);
    }
  };

  const ratingConfig = {
    excellent: { color: GREEN, emoji: '🟢', label: 'Excellent' },
    good: { color: YELLOW, emoji: '🟡', label: 'Good' },
    poor: { color: ORANGE, emoji: '🟠', label: 'Poor' },
    avoid: { color: RED, emoji: '🔴', label: 'Avoid' },
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Menu</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>

        {/* Upload */}
        {!imageUri && !scanning && menuItems.length === 0 && (
          <View style={styles.uploadSection}>
            <Text style={styles.uploadEmoji}>🍽</Text>
            <Text style={styles.uploadTitle}>Eating Out?</Text>
            <Text style={styles.uploadSub}>Photograph the menu and we'll find the best high-protein options for you</Text>
            <TouchableOpacity style={styles.cameraBtn} onPress={pickImage} activeOpacity={0.8}>
              <Text style={styles.cameraBtnText}>📷 Photograph Menu</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Scanning */}
        {scanning && (
          <View style={styles.scanningWrap}>
            <ActivityIndicator color={ORANGE} size="large" />
            <Text style={styles.scanningTitle}>Analyzing menu...</Text>
            <Text style={styles.scanningSub}>Finding the best options for your fitness goals</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => { setImageUri(null); setError(null); }}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Results */}
        {menuItems.length > 0 && (
          <>
            {/* Menu preview */}
            {imageUri && <Image source={{ uri: imageUri }} style={styles.menuPreview} contentFit="cover" />}

            {/* Restaurant name */}
            <Text style={styles.restaurantName}>{restaurantName}</Text>
            <Text style={styles.itemCount}>{menuItems.length} items analyzed</Text>

            {/* Best choice card */}
            {bestChoice && (
              <View style={styles.bestChoiceCard}>
                <Text style={styles.bestChoiceTitle}>⭐ Best Choice for Your Goals</Text>
                <Text style={styles.bestChoiceText}>{bestChoice}</Text>
              </View>
            )}

            {/* Legend */}
            <View style={styles.legend}>
              <Text style={[styles.legendItem, { color: GREEN }]}>🟢 Excellent</Text>
              <Text style={[styles.legendItem, { color: YELLOW }]}>🟡 Good</Text>
              <Text style={[styles.legendItem, { color: ORANGE }]}>🟠 Poor</Text>
              <Text style={[styles.legendItem, { color: RED }]}>🔴 Avoid</Text>
            </View>

            {/* Menu items */}
            {menuItems.map((item, i) => {
              const config = ratingConfig[item.rating] || ratingConfig.poor;
              return (
                <View key={i} style={[styles.itemCard, { borderLeftColor: config.color, borderLeftWidth: 3 }]}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <View style={[styles.ratingBadge, { backgroundColor: config.color + '20' }]}>
                      <Text style={[styles.ratingText, { color: config.color }]}>{config.emoji} {config.label}</Text>
                    </View>
                  </View>
                  {item.description && <Text style={styles.itemDesc}>{item.description}</Text>}

                  {/* Macros */}
                  <View style={styles.itemMacros}>
                    <Text style={styles.itemMacroCal}>🔥 {item.estimatedCalories} cal</Text>
                    <Text style={[styles.itemMacro, { color: ORANGE }]}>💪 {item.estimatedProteinG}g P</Text>
                    <Text style={styles.itemMacro}>{item.estimatedCarbsG}g C</Text>
                    <Text style={styles.itemMacro}>{item.estimatedFatG}g F</Text>
                  </View>

                  {/* Protein density */}
                  <Text style={[styles.itemDensity, { color: item.proteinDensity >= 6.4 ? GREEN : item.proteinDensity >= 4 ? YELLOW : RED }]}>
                    {item.proteinDensity.toFixed(1)}g protein/100 cal {item.proteinDensity >= 6.4 ? '✅' : ''}
                  </Text>

                  {/* Recommendation */}
                  <Text style={styles.itemRec}>{item.recommendation}</Text>

                  {/* Dietary flags */}
                  {item.dietaryFlags?.length > 0 && (
                    <View style={styles.flagsRow}>
                      {item.dietaryFlags.map((flag, fi) => (
                        <Text key={fi} style={styles.flagText}>⚠️ {flag}</Text>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            {/* Scan another */}
            <TouchableOpacity style={styles.scanAnotherBtn} onPress={() => { setImageUri(null); setMenuItems([]); setBestChoice(''); setError(null); }}>
              <Text style={styles.scanAnotherText}>Scan Another Menu</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  back: { fontSize: 24, color: '#FFFFFF', fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  // Upload
  uploadSection: { alignItems: 'center', paddingTop: 40, gap: 10 },
  uploadEmoji: { fontSize: 64 },
  uploadTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
  uploadSub: { fontSize: 14, color: 'rgba(255,255,255,0.50)', textAlign: 'center', lineHeight: 22, paddingHorizontal: 10 },
  cameraBtn: { marginTop: 20, backgroundColor: ORANGE, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  cameraBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  // Scanning
  scanningWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  scanningTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  scanningSub: { fontSize: 13, color: 'rgba(255,255,255,0.50)' },

  // Error
  errorWrap: { alignItems: 'center', paddingTop: 40, gap: 12 },
  errorText: { fontSize: 14, color: RED, textAlign: 'center' },
  retryBtn: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  retryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  // Results
  menuPreview: { width: '100%', height: 140, borderRadius: 14, marginBottom: 12 },
  restaurantName: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
  itemCount: { fontSize: 13, color: 'rgba(255,255,255,0.40)', marginBottom: 12 },

  // Best choice
  bestChoiceCard: { backgroundColor: 'rgba(34,197,94,0.10)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(34,197,94,0.30)', padding: 16, marginBottom: 14 },
  bestChoiceTitle: { fontSize: 14, fontWeight: '800', color: GREEN, marginBottom: 6 },
  bestChoiceText: { fontSize: 14, color: 'rgba(255,255,255,0.80)', lineHeight: 20 },

  // Legend
  legend: { flexDirection: 'row', gap: 12, marginBottom: 14, justifyContent: 'center' },
  legendItem: { fontSize: 11, fontWeight: '700' },

  // Item cards
  itemCard: { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 10 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  itemName: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', flex: 1, marginRight: 8 },
  ratingBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  ratingText: { fontSize: 11, fontWeight: '800' },
  itemDesc: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 8 },
  itemMacros: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  itemMacroCal: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', backgroundColor: 'rgba(232,93,38,0.20)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  itemMacro: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.60)' },
  itemDensity: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  itemRec: { fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 19, marginBottom: 6 },
  flagsRow: { gap: 3 },
  flagText: { fontSize: 11, color: RED, fontWeight: '600' },

  // Scan another
  scanAnotherBtn: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', marginTop: 8 },
  scanAnotherText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
