/**
 * OrderGroceryScreen.tsx — SpiceStrong
 * Coming soon: order groceries from Amazon Fresh, Instacart, Walmart.
 */

import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PremiumScreen } from '../../components/PremiumScreen';
import { HomeButton } from '../../components/HomeButton';

const SURFACE = 'rgba(248,241,232,0.08)';
const BORDER = 'rgba(248,241,232,0.12)';
const ACCENT = '#E8A87C';
const PLAYFAIR = Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'serif', default: 'serif' });

const SERVICES = [
  { name: 'Amazon Fresh', emoji: '📦', color: ACCENT },
  { name: 'Instacart', emoji: '🥕', color: ACCENT },
  { name: 'Walmart', emoji: '🏪', color: ACCENT },
];

export default function OrderGroceryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Groceries</Text>
        <HomeButton />
      </View>

      <View style={styles.content}>
        <Text style={styles.emoji}>🛍</Text>
        <Text style={styles.title}>Order Directly</Text>
        <Text style={styles.subtitle}>We're integrating with popular grocery delivery services so you can order ingredients directly from your list.</Text>

        {SERVICES.map((s) => (
          <View key={s.name} style={styles.serviceCard}>
            <Text style={styles.serviceEmoji}>{s.emoji}</Text>
            <Text style={styles.serviceName}>{s.name}</Text>
            <View style={[styles.comingSoonBadge, { backgroundColor: s.color + '20' }]}>
              <Text style={[styles.comingSoonText, { color: s.color }]}>Coming Soon</Text>
            </View>
          </View>
        ))}

        <Text style={styles.note}>We'll notify you when ordering is available in your area.</Text>
      </View>
    </PremiumScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
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
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
  content: { flex: 1, alignItems: 'center', paddingTop: 50, paddingHorizontal: 30 },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR, marginBottom: 10 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.50)', textAlign: 'center', lineHeight: 22, marginBottom: 30 },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: SURFACE,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 14,
  },
  serviceEmoji: { fontSize: 28 },
  serviceName: { flex: 1, fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  comingSoonBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  comingSoonText: { fontSize: 11, fontWeight: '800' },
  note: { fontSize: 12, color: 'rgba(255,255,255,0.30)', textAlign: 'center', marginTop: 20 },
});
