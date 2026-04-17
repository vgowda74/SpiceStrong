/**
 * PaywallModal.tsx — SpiceStrong
 * Shown when a free user hits their usage limit.
 * Displays what they've used, what premium unlocks, and a CTA.
 */

import React from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { LimitCheck } from '../services/subscriptionService';

const ORANGE = '#E85D26';
const BG = '#1A1A1A';
const BORDER = 'rgba(255,255,255,0.08)';
const PLAYFAIR = Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'PlayfairDisplay_700Bold', default: 'serif' });

interface Props {
  visible: boolean;
  onClose: () => void;
  limitCheck: LimitCheck | null;
  onUpgrade: () => void;
}

export default function PaywallModal({ visible, onClose, limitCheck, onUpgrade }: Props) {
  if (!limitCheck) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <Text style={styles.emoji}>🔒</Text>
            <Text style={styles.title}>Limit Reached</Text>
            <Text style={styles.subtitle}>
              You've used all {limitCheck.freeLabel} in your free plan this month.
            </Text>

            {/* Usage bar */}
            <View style={styles.usageRow}>
              <Text style={styles.usageLabel}>{limitCheck.featureLabel}</Text>
              <View style={styles.usageBarBg}>
                <View style={[styles.usageBarFill, { width: '100%' }]} />
              </View>
              <Text style={styles.usageCount}>{limitCheck.used}/{limitCheck.limit}</Text>
            </View>

            {/* Premium benefits */}
            <View style={styles.benefitsSection}>
              <Text style={styles.benefitsTitle}>Upgrade to SpiceStrong Premium</Text>
              <View style={styles.benefitRow}>
                <Text style={styles.benefitIcon}>🍳</Text>
                <Text style={styles.benefitText}>50 AI recipes per year</Text>
              </View>
              <View style={styles.benefitRow}>
                <Text style={styles.benefitIcon}>📸</Text>
                <Text style={styles.benefitText}>Unlimited nutrition & menu scans</Text>
              </View>
              <View style={styles.benefitRow}>
                <Text style={styles.benefitIcon}>📅</Text>
                <Text style={styles.benefitText}>Unlimited meal plans</Text>
              </View>
              <View style={styles.benefitRow}>
                <Text style={styles.benefitIcon}>🧠</Text>
                <Text style={styles.benefitText}>Unlimited Nutrition IQ reports</Text>
              </View>
              <View style={styles.benefitRow}>
                <Text style={styles.benefitIcon}>🌿</Text>
                <Text style={styles.benefitText}>Clean ingredient scanner</Text>
              </View>
            </View>

            {/* Price */}
            <View style={styles.priceSection}>
              <Text style={styles.priceMain}>$29.99</Text>
              <Text style={styles.priceSub}>per year · less than $2.50/month</Text>
            </View>

            {/* CTA */}
            <TouchableOpacity style={styles.upgradeBtn} onPress={onUpgrade} activeOpacity={0.85}>
              <Text style={styles.upgradeBtnText}>Upgrade to Premium</Text>
            </TouchableOpacity>

            {/* Dismiss */}
            <TouchableOpacity style={styles.dismissBtn} onPress={onClose} activeOpacity={0.75}>
              <Text style={styles.dismissBtnText}>Not now</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.80)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  emoji: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    fontFamily: PLAYFAIR,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  usageLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.50)', width: 90 },
  usageBarBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.10)' },
  usageBarFill: { height: 8, borderRadius: 4, backgroundColor: ORANGE },
  usageCount: { fontSize: 12, fontWeight: '800', color: ORANGE, width: 40, textAlign: 'right' },

  benefitsSection: {
    backgroundColor: 'rgba(232,93,38,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.20)',
    padding: 18,
    marginBottom: 20,
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: ORANGE,
    marginBottom: 14,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  benefitIcon: { fontSize: 18 },
  benefitText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },

  priceSection: { alignItems: 'center', marginBottom: 20 },
  priceMain: { fontSize: 36, fontWeight: '900', color: '#FFFFFF', fontFamily: PLAYFAIR },
  priceSub: { fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 },

  upgradeBtn: {
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  upgradeBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },

  dismissBtn: { paddingVertical: 12, alignItems: 'center' },
  dismissBtnText: { color: 'rgba(255,255,255,0.40)', fontSize: 14, fontWeight: '600' },
});
