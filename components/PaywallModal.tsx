/**
 * PaywallModal.tsx — SpiceStrong
 * Premium upgrade screen with Free vs Pro comparison and plan toggle.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { LimitCheck } from '../services/subscriptionService';
import { trackEvent } from '../services/analyticsService';
import { getCuratedRecipeCount } from '../services/recipeService';

const ORANGE = '#8F3A1F';
const GREEN = '#22C55E';
const BG = '#1A1A1A';
const SURFACE = '#252525';
const BORDER = 'rgba(255,255,255,0.08)';
const PLAYFAIR = Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'PlayfairDisplay_700Bold', default: 'serif' });

const BASE_FEATURES = [
  { label: 'Curated recipes', free: '300+', pro: '300+', freeCheck: true, proCheck: true },
  { label: 'AI recipe builder', free: '5/month', pro: '50/year', freeCheck: true, proCheck: true },
  { label: 'Nutrition scans', free: '10/month', pro: 'Unlimited', freeCheck: true, proCheck: true },
  { label: 'Meal plans', free: '2/month', pro: 'Unlimited', freeCheck: true, proCheck: true },
  { label: 'Nutrition IQ', free: '5/month', pro: 'Unlimited', freeCheck: true, proCheck: true },
  { label: 'Ingredient info', free: 'Unlimited', pro: 'Unlimited', freeCheck: true, proCheck: true },
  { label: 'Protein tier ratings', free: '—', pro: '✓', freeCheck: false, proCheck: true },
  { label: 'Clean ingredient scan', free: '—', pro: '✓', freeCheck: false, proCheck: true },
  { label: 'Receipt & list scanner', free: '—', pro: 'Unlimited', freeCheck: false, proCheck: true },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  limitCheck: LimitCheck | null;
  onUpgrade: () => void;
}

export default function PaywallModal({ visible, onClose, limitCheck, onUpgrade }: Props) {
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'yearly' | 'monthly'>('yearly');
  const [curatedRecipeLabel, setCuratedRecipeLabel] = useState('300+');

  const features = BASE_FEATURES.map((feature) => (
    feature.label === 'Curated recipes'
      ? { ...feature, free: curatedRecipeLabel, pro: curatedRecipeLabel }
      : feature
  ));

  useEffect(() => {
    if (visible) {
      trackEvent('paywall_viewed', {
        screen: 'PaywallModal',
        metadata: { featureLabel: limitCheck?.featureLabel },
      });

      getCuratedRecipeCount()
        .then((count) => setCuratedRecipeLabel(`${Math.max(count, 300)}+`))
        .catch(() => setCuratedRecipeLabel('300+'));
    }
  }, [visible, limitCheck?.featureLabel]);

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      const { purchasePremium } = require('../services/purchaseService');
      const result = await purchasePremium(selectedPlan);
      if (result.success) {
        Alert.alert('Welcome to Premium!', 'All features are now unlocked. Enjoy SpiceStrong Premium!');
        onUpgrade();
      } else if (result.error === 'cancelled') {
        // User cancelled
      } else {
        Alert.alert('Purchase Failed', result.error || 'Something went wrong. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not complete purchase.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const { restorePurchases } = require('../services/purchaseService');
      const result = await restorePurchases();
      if (result.isPremium) {
        Alert.alert('Restored!', 'Your Premium subscription has been restored.');
        onUpgrade();
      } else {
        Alert.alert('No Subscription Found', 'No active Premium subscription was found for this Apple ID.');
      }
    } catch {
      Alert.alert('Error', 'Could not restore purchases. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  if (!limitCheck) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <Text style={styles.emoji}>💪</Text>
            <Text style={styles.title}>SpiceStrong Premium</Text>
            <Text style={styles.subtitle}>Unlock your full fitness cooking potential</Text>

            {/* Plan toggle */}
            <View style={styles.planToggle}>
              <TouchableOpacity
                style={[styles.planTab, selectedPlan === 'monthly' && styles.planTabActive]}
                onPress={() => setSelectedPlan('monthly')}
                activeOpacity={0.8}
              >
                <Text style={[styles.planTabText, selectedPlan === 'monthly' && styles.planTabTextActive]}>Monthly</Text>
                <Text style={[styles.planTabPrice, selectedPlan === 'monthly' && styles.planTabPriceActive]}>$4.99/mo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.planTab, selectedPlan === 'yearly' && styles.planTabActive]}
                onPress={() => setSelectedPlan('yearly')}
                activeOpacity={0.8}
              >
                <Text style={[styles.planTabText, selectedPlan === 'yearly' && styles.planTabTextActive]}>Yearly</Text>
                <Text style={[styles.planTabPrice, selectedPlan === 'yearly' && styles.planTabPriceActive]}>$29.99/yr</Text>
                <View style={styles.saveBadge}><Text style={styles.saveBadgeText}>SAVE 50%</Text></View>
              </TouchableOpacity>
            </View>

            {/* Comparison table */}
            <View style={styles.compTable}>
              {/* Table header */}
              <View style={styles.compHeaderRow}>
                <Text style={styles.compFeatureHeader}>Feature</Text>
                <Text style={styles.compFreeHeader}>Free</Text>
                <Text style={styles.compProHeader}>Pro</Text>
              </View>

              {/* Feature rows */}
              {features.map((f, i) => (
                <View key={i} style={[styles.compRow, i % 2 === 0 && styles.compRowAlt]}>
                  <Text style={styles.compFeature}>{f.label}</Text>
                  <Text style={[styles.compFreeVal, !f.freeCheck && styles.compValDim]}>{f.free}</Text>
                  <Text style={[styles.compProVal, f.proCheck && styles.compValGreen]}>{f.pro}</Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={[styles.upgradeBtn, purchasing && { opacity: 0.6 }]}
              onPress={handlePurchase}
              disabled={purchasing || restoring}
              activeOpacity={0.85}
            >
              {purchasing ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.upgradeBtnText}>
                  Start Premium — {selectedPlan === 'yearly' ? '$29.99/year' : '$4.99/month'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Restore */}
            <TouchableOpacity
              style={styles.restoreBtn}
              onPress={handleRestore}
              disabled={purchasing || restoring}
              activeOpacity={0.75}
            >
              {restoring ? (
                <ActivityIndicator color="rgba(255,255,255,0.40)" size="small" />
              ) : (
                <Text style={styles.restoreBtnText}>Restore Purchase</Text>
              )}
            </TouchableOpacity>

            {/* Dismiss */}
            <TouchableOpacity style={styles.dismissBtn} onPress={onClose} activeOpacity={0.75}>
              <Text style={styles.dismissBtnText}>Not now</Text>
            </TouchableOpacity>

            {/* Fine print */}
            {/* Required by Apple: subscription info + links */}
            <Text style={styles.finePrint}>
              SpiceStrong Premium auto-renewable subscription. {selectedPlan === 'yearly' ? 'Yearly plan: $29.99/year.' : 'Monthly plan: $4.99/month.'} Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period. Manage subscriptions in Settings &gt; Apple ID &gt; Subscriptions.
            </Text>
            <View style={styles.legalLinks}>
              <TouchableOpacity onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}>
                <Text style={styles.legalLinkText}>Terms of Use</Text>
              </TouchableOpacity>
              <Text style={styles.legalDot}> · </Text>
              <TouchableOpacity onPress={() => Linking.openURL('https://www.spicestrong.app/privacy.html')}>
                <Text style={styles.legalLinkText}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 34,
    maxHeight: '92%',
  },
  emoji: { fontSize: 40, textAlign: 'center', marginBottom: 8 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    fontFamily: PLAYFAIR,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.50)',
    textAlign: 'center',
    marginBottom: 20,
  },

  // Plan toggle
  planToggle: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  planTab: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 14,
    alignItems: 'center',
    position: 'relative',
  },
  planTabActive: {
    borderColor: ORANGE,
    backgroundColor: 'rgba(143,58,31,0.12)',
  },
  planTabText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.50)' },
  planTabTextActive: { color: '#FFFFFF' },
  planTabPrice: { fontSize: 18, fontWeight: '900', color: 'rgba(255,255,255,0.40)', marginTop: 4 },
  planTabPriceActive: { color: ORANGE },
  saveBadge: {
    position: 'absolute',
    top: -9,
    right: -5,
    backgroundColor: GREEN,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  saveBadgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },

  // Comparison table
  compTable: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    marginBottom: 20,
  },
  compHeaderRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  compFeatureHeader: { flex: 1, fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.40)', letterSpacing: 0.5 },
  compFreeHeader: { width: 65, fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.40)', textAlign: 'center', letterSpacing: 0.5 },
  compProHeader: { width: 75, fontSize: 11, fontWeight: '800', color: ORANGE, textAlign: 'center', letterSpacing: 0.5 },
  compRow: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  compRowAlt: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  compFeature: { flex: 1, fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  compFreeVal: { width: 65, fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.50)', textAlign: 'center' },
  compValDim: { color: 'rgba(255,255,255,0.20)' },
  compProVal: { width: 75, fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.70)', textAlign: 'center' },
  compValGreen: { color: GREEN },

  // CTA
  upgradeBtn: {
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  upgradeBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  restoreBtn: { paddingVertical: 10, alignItems: 'center' },
  restoreBtnText: {
    color: 'rgba(255,255,255,0.66)',
    fontSize: 15,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  dismissBtn: { paddingVertical: 12, alignItems: 'center' },
  dismissBtnText: { color: 'rgba(255,255,255,0.52)', fontSize: 15, fontWeight: '800' },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  legalLinkText: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: 'rgba(255,255,255,0.20)',
    fontSize: 12,
  },
  finePrint: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.20)',
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 8,
    paddingHorizontal: 10,
  },
});
