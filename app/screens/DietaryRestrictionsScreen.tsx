/**
 * DietaryRestrictionsScreen.tsx
 * Lets users set dietary preferences and allergen-free requirements.
 * Settings are saved to Supabase (via dietaryService) and applied globally.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getDietaryRestrictions,
  saveDietaryRestrictions,
  type DietaryRestrictions,
} from '../../services/dietaryService';

const ORANGE = '#E85D26';
const BG = '#0F0F0F';
const SURFACE = '#1A1A1A';
const BORDER = 'rgba(255,255,255,0.10)';
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'PlayfairDisplay_700Bold',
  default: 'serif',
});

const DIETARY_OPTIONS = [
  { key: 'High protein', emoji: '💪', desc: '≥30g protein per serving' },
  { key: 'Low fat',      emoji: '🥗', desc: '<10g fat per serving' },
  { key: 'Low carb',     emoji: '🌾', desc: '<25g carbs per serving' },
  { key: 'Keto',         emoji: '🥑', desc: 'Low carb + fat-dominant' },
  { key: 'Low calorie',  emoji: '⚖️', desc: '<400 cal per serving' },
  { key: 'Low sodium',   emoji: '🧂', desc: 'Reduced sodium recipes' },
  { key: 'Low sugar',    emoji: '🍬', desc: 'Minimal added sugars' },
  { key: 'High fiber',   emoji: '🌿', desc: '≥5g fiber per serving' },
];

const ALLERGEN_OPTIONS = [
  { key: 'Vegetarian',   emoji: '🥦' },
  { key: 'Vegan',        emoji: '🌱' },
  { key: 'Gluten free',  emoji: '🌾' },
  { key: 'Dairy free',   emoji: '🥛' },
  { key: 'Egg free',     emoji: '🥚' },
  { key: 'Nut free',     emoji: '🥜' },
  { key: 'Soy free',     emoji: '🫘' },
  { key: 'Shellfish free', emoji: '🦐' },
  { key: 'Paleo',        emoji: '🍖' },
  { key: 'Whole30',      emoji: '🥕' },
];

function Chip({
  label,
  emoji,
  desc,
  selected,
  onPress,
}: {
  label: string;
  emoji: string;
  desc?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={styles.chipEmoji}>{emoji}</Text>
      <View style={styles.chipTextBlock}>
        <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
        {desc ? <Text style={styles.chipDesc}>{desc}</Text> : null}
      </View>
      <View style={[styles.chipCheck, selected && styles.chipCheckSelected]}>
        {selected && <Text style={styles.chipCheckMark}>✓</Text>}
      </View>
    </TouchableOpacity>
  );
}

export default function DietaryRestrictionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [allergenTags, setAllergenTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDietaryRestrictions().then((r) => {
      setDietaryTags(r.dietaryTags);
      setAllergenTags(r.allergenTags);
      setLoading(false);
    });
  }, []);

  const toggle = useCallback((list: string[], setList: (v: string[]) => void, key: string) => {
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await saveDietaryRestrictions({ dietaryTags, allergenTags });
    setSaving(false);
    router.back();
  };

  const handleClear = () => {
    setDietaryTags([]);
    setAllergenTags([]);
  };

  const totalSelected = dietaryTags.length + allergenTags.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dietary Restrictions</Text>
        {totalSelected > 0 ? (
          <TouchableOpacity onPress={handleClear}>
            <Text style={styles.clearBtn}>Clear all</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ORANGE} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>
            Set your preferences and SpiceStrong will only show recipes that match — including AI-generated recipes.
          </Text>

          <Text style={styles.sectionLabel}>LIFESTYLE & DIET GOALS</Text>
          {DIETARY_OPTIONS.map((o) => (
            <Chip
              key={o.key}
              label={o.key}
              emoji={o.emoji}
              desc={o.desc}
              selected={dietaryTags.includes(o.key)}
              onPress={() => toggle(dietaryTags, setDietaryTags, o.key)}
            />
          ))}

          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>ALLERGENS & LIFESTYLE</Text>
          <Text style={styles.sectionHint}>Only recipes that are free from your selected items will appear.</Text>
          {ALLERGEN_OPTIONS.map((o) => (
            <Chip
              key={o.key}
              label={o.key}
              emoji={o.emoji}
              selected={allergenTags.includes(o.key)}
              onPress={() => toggle(allergenTags, setAllergenTags, o.key)}
            />
          ))}
        </ScrollView>
      )}

      {/* Save button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable onPress={handleSave} disabled={saving} style={styles.saveWrapper}>
          <LinearGradient
            colors={['#F07030', '#C84A10']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveBtn}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>
                Save{totalSelected > 0 ? ` (${totalSelected} selected)` : ' Preferences'}
              </Text>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  back: { fontSize: 24, color: '#FFFFFF', fontWeight: '600' },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: PLAYFAIR,
  },
  clearBtn: { fontSize: 14, color: ORANGE, fontWeight: '600' },

  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  intro: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 21,
    marginBottom: 24,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  sectionHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.50)',
    marginTop: -8,
    marginBottom: 12,
  },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 12,
  },
  chipSelected: {
    borderColor: ORANGE,
    backgroundColor: 'rgba(232,93,38,0.12)',
  },
  chipEmoji: { fontSize: 22 },
  chipTextBlock: { flex: 1 },
  chipLabel: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  chipLabelSelected: { color: '#FFFFFF' },
  chipDesc: { fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 2 },
  chipCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCheckSelected: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  chipCheckMark: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  saveWrapper: {
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  saveBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
