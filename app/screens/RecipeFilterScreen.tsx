/**
 * RecipeFilterScreen.tsx — Full-screen recipe filter with two tabs:
 * 1. Quick Build: Fitness goal, macros, spice, cooking time, difficulty, meat type
 * 2. Advanced: Cooking method, cuisine, calories, meal prep
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { NON_VEG_PROTEIN_IDS } from '../../src/utils/dietPreference';
import { Ionicons } from '@expo/vector-icons';
import { PremiumScreen } from '../../components/PremiumScreen';

// ── Types ──

type Tab = 'quick' | 'advanced';

interface FilterState {
  // Quick Build
  fitnessGoal: string | null;
  proteinRange: string | null;
  carbsRange: string | null;
  fatRange: string | null;
  spiceLevel: string | null;
  cookingTime: string | null;
  difficulty: string | null;
  meatType: string | null;
  // Advanced (dietary/allergen handled globally via Profile > Dietary Restrictions)
  cookingMethod: string | null;
  cuisine: string | null;
  calorieRange: string | null;
  mealPrep: string[];
}

// ── Constants ──

const ORANGE = '#8F3A1F';
const CARD_BG = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(248,241,232,0.12)';

// Fitness goal → auto-fill macro ranges
const GOAL_MACROS: Record<string, { protein: string; carbs: string; fat: string }> = {
  'Fat Loss':     { protein: '30-39g', carbs: 'Under 20g', fat: 'Under 10g' },
  'Muscle Gain':  { protein: '40g+',   carbs: '50g+',      fat: '10-19g' },
  'Balanced':     { protein: '20-29g', carbs: '20-50g',    fat: '10-19g' },
  'Keto':         { protein: '30-39g', carbs: 'Under 20g', fat: '20g+' },
  'High Energy':  { protein: '20-29g', carbs: '50g+',      fat: '10-19g' },
};

const FITNESS_GOALS = [
  { key: 'Fat Loss', emoji: '🔥' },
  { key: 'Muscle Gain', emoji: '💪' },
  { key: 'Balanced', emoji: '⚖️' },
  { key: 'Keto', emoji: '🥑' },
  { key: 'High Energy', emoji: '🏃' },
];

const PROTEIN_RANGES = ['Under 20g', '20-29g', '30-39g', '40g+'];
const CARBS_RANGES = ['Under 20g', '20-50g', '50g+'];
const FAT_RANGES = ['Under 10g', '10-19g', '20g+'];

const SPICE_LEVELS = [
  { key: 'Mild', emoji: '🌶️' },
  { key: 'Medium', emoji: '🌶️🌶️' },
  { key: 'Hot', emoji: '🌶️🌶️🌶️' },
  { key: 'Extra Hot', emoji: '🔥' },
];

const COOKING_TIMES = [
  { key: 'under15', label: '⚡ Under 15 min' },
  { key: '15to30', label: '⏱️ 15-30 min' },
  { key: '30to60', label: '🍲 30-60 min' },
  { key: '60plus', label: '🫕 1 hour+' },
];

const DIFFICULTIES = [
  { key: 'Easy', emoji: '🟢' },
  { key: 'Medium', emoji: '🟡' },
  { key: 'Hard', emoji: '🔴' },
];

// Meat type options per protein
const MEAT_TYPES: Record<string, string[]> = {
  chicken: ['Drumstick', 'Boneless', 'Bone-in', 'Minced', 'Wings', 'Thigh'],
  fish: ['Fillet', 'Whole', 'Steak Cut', 'Minced'],
  lamb: ['Chops', 'Boneless', 'Bone-in', 'Minced', 'Shanks'],
  goat: ['Bone-in', 'Boneless', 'Minced'],
  beef: ['Steak', 'Minced', 'Boneless', 'Bone-in', 'Ribs'],
  pork: ['Chops', 'Boneless', 'Ribs', 'Minced', 'Belly'],
  prawns: ['Shell-on', 'Peeled', 'Tiger Prawns', 'King Prawns'],
  eggs: ['Whole Eggs', 'Egg Whites', 'Boiled', 'Scrambled'],
};

// Non-veg protein IDs
const NON_VEG_PROTEINS: readonly string[] = NON_VEG_PROTEIN_IDS;

// Advanced tab options
// Must match exact values from classification pipeline
// Must match exact values from classification pipeline (scripts/pipeline/classifyRecipe.js)
const COOKING_METHODS = [
  'Stovetop', 'Grilled', 'Baked', 'Air fryer',
  'Slow cooker', 'Instant pot', 'Steamed',
  'Stir-fried', 'Pan-seared', 'Broiled', 'Smoked',
];

// Must match classification pipeline cuisine_type values
const CUISINES = [
  'Indian', 'South Indian', 'Thai', 'Chinese', 'Korean',
  'Japanese', 'Vietnamese', 'Mediterranean', 'Italian', 'Greek',
  'Lebanese', 'Turkish', 'American', 'Mexican', 'Brazilian',
];

const CALORIE_RANGES = [
  { key: 'under300', label: 'Under 300' },
  { key: '300to500', label: '300-500' },
  { key: '500to700', label: '500-700' },
  { key: '700plus', label: '700+' },
];

// Must match classification pipeline storage_tags values
const MEAL_PREP_OPTIONS = [
  'Freezer friendly', 'Fridge 3-5 days', 'Make ahead',
  'Meal prep ready', 'Kid friendly', 'Office lunch',
];

// ── Helper: parse incoming filter params ──

function parseArray(val: string | undefined): string[] {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

// ── Component ──

export default function RecipeFilterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    proteinId?: string;
    proteinName?: string;
    proteinEmoji?: string;
    // Incoming filter state
    fitnessGoal?: string;
    proteinRange?: string;
    carbsRange?: string;
    fatRange?: string;
    spiceLevel?: string;
    cookingTime?: string;
    difficulty?: string;
    meatType?: string;
    cookingMethod?: string;
    cuisine?: string;
    calorieRange?: string;
    mealPrep?: string;
  }>();

  const proteinId = params.proteinId ?? '';
  const proteinName = params.proteinName ?? '';
  const isNonVeg = NON_VEG_PROTEINS.includes(proteinId);
  const meatTypeOptions = MEAT_TYPES[proteinId] || [];

  const [activeTab, setActiveTab] = useState<Tab>('quick');

  // ── Filter state (initialized from params) ──
  const [fitnessGoal, setFitnessGoal] = useState<string | null>(params.fitnessGoal || null);
  const [proteinRange, setProteinRange] = useState<string | null>(params.proteinRange || null);
  const [carbsRange, setCarbsRange] = useState<string | null>(params.carbsRange || null);
  const [fatRange, setFatRange] = useState<string | null>(params.fatRange || null);
  const [spiceLevel, setSpiceLevel] = useState<string | null>(params.spiceLevel || null);
  const [cookingTime, setCookingTime] = useState<string | null>(params.cookingTime || null);
  const [difficulty, setDifficulty] = useState<string | null>(params.difficulty || null);
  const [meatType, setMeatType] = useState<string | null>(params.meatType || null);
  const [cookingMethod, setCookingMethod] = useState<string | null>(params.cookingMethod || null);
  const [cuisine, setCuisine] = useState<string | null>(params.cuisine || null);
  const [calorieRange, setCalorieRange] = useState<string | null>(params.calorieRange || null);
  const [mealPrep, setMealPrep] = useState<string[]>(parseArray(params.mealPrep));

  // ── Active filter count ──
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (fitnessGoal) count++;
    if (proteinRange) count++;
    if (carbsRange) count++;
    if (fatRange) count++;
    if (spiceLevel) count++;
    if (cookingTime) count++;
    if (difficulty) count++;
    if (meatType) count++;
    if (cookingMethod) count++;
    if (cuisine) count++;
    if (calorieRange) count++;
    count += mealPrep.length;
    return count;
  }, [fitnessGoal, proteinRange, carbsRange, fatRange, spiceLevel, cookingTime, difficulty, meatType, cookingMethod, cuisine, calorieRange, mealPrep]);

  // ── Fitness goal auto-fill macros ──
  const selectFitnessGoal = useCallback((goal: string) => {
    if (fitnessGoal === goal) {
      setFitnessGoal(null);
      return;
    }
    setFitnessGoal(goal);
    const macros = GOAL_MACROS[goal];
    if (macros) {
      setProteinRange(macros.protein);
      setCarbsRange(macros.carbs);
      setFatRange(macros.fat);
    }
  }, [fitnessGoal]);

  // ── Toggle multi-select ──
  const toggleMulti = useCallback((arr: string[], val: string, setter: (v: string[]) => void) => {
    if (arr.includes(val)) {
      setter(arr.filter(v => v !== val));
    } else {
      setter([...arr, val]);
    }
  }, []);

  // ── Clear All ──
  const clearAll = useCallback(() => {
    setFitnessGoal(null);
    setProteinRange(null);
    setCarbsRange(null);
    setFatRange(null);
    setSpiceLevel(null);
    setCookingTime(null);
    setDifficulty(null);
    setMeatType(null);
    setCookingMethod(null);
    setCuisine(null);
    setCalorieRange(null);
    setMealPrep([]);
  }, []);

  // ── Apply & navigate back with filters as params ──
  const applyFilters = useCallback(() => {
    router.navigate({
      pathname: '/screens/RecipeListScreen',
      params: {
        proteinId,
        proteinName,
        proteinEmoji: params.proteinEmoji || '',
        filterApplied: 'true',
        f_fitnessGoal: fitnessGoal || '',
        f_proteinRange: proteinRange || '',
        f_carbsRange: carbsRange || '',
        f_fatRange: fatRange || '',
        f_spiceLevel: spiceLevel || '',
        f_cookingTime: cookingTime || '',
        f_difficulty: difficulty || '',
        f_meatType: meatType || '',
        f_cookingMethod: cookingMethod || '',
        f_cuisine: cuisine || '',
        f_calorieRange: calorieRange || '',
        f_mealPrep: JSON.stringify(mealPrep),
      },
    });
  }, [fitnessGoal, proteinRange, carbsRange, fatRange, spiceLevel, cookingTime, difficulty, meatType, cookingMethod, cuisine, calorieRange, mealPrep, router, proteinId, proteinName]);

  // ── Single-select chip ──
  const Chip = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  // ── Multi-select checkbox ──
  const Checkbox = ({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) => (
    <TouchableOpacity style={styles.checkboxRow} onPress={onPress} activeOpacity={0.7}>
      <Ionicons
        name={checked ? 'checkbox' : 'square-outline'}
        size={22}
        color={checked ? ORANGE : 'rgba(255,255,255,0.4)'}
      />
      <Text style={[styles.checkboxLabel, checked && styles.checkboxLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );

  // ── Section header ──
  const SectionHeader = ({ icon, title }: { icon: string; title: string }) => (
    <Text style={styles.sectionHeader}>{icon}  {title}</Text>
  );

  // ── Render Quick Build Tab ──
  const renderQuickBuild = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Fitness Goal */}
      <SectionHeader icon="🎯" title="FITNESS GOAL" />
      <View style={styles.chipRow}>
        {FITNESS_GOALS.map(g => (
          <Chip
            key={g.key}
            label={`${g.emoji} ${g.key}`}
            selected={fitnessGoal === g.key}
            onPress={() => selectFitnessGoal(g.key)}
          />
        ))}
      </View>

      {/* Macro targets */}
      <SectionHeader icon="📊" title="MACROS (PER SERVING)" />

      <Text style={styles.macroLabel}>Protein</Text>
      <View style={styles.chipRow}>
        {PROTEIN_RANGES.map(r => (
          <Chip key={r} label={r} selected={proteinRange === r} onPress={() => setProteinRange(proteinRange === r ? null : r)} />
        ))}
      </View>

      <Text style={styles.macroLabel}>Carbs</Text>
      <View style={styles.chipRow}>
        {CARBS_RANGES.map(r => (
          <Chip key={r} label={r} selected={carbsRange === r} onPress={() => setCarbsRange(carbsRange === r ? null : r)} />
        ))}
      </View>

      <Text style={styles.macroLabel}>Fat</Text>
      <View style={styles.chipRow}>
        {FAT_RANGES.map(r => (
          <Chip key={r} label={r} selected={fatRange === r} onPress={() => setFatRange(fatRange === r ? null : r)} />
        ))}
      </View>

      {/* Spice Level */}
      <SectionHeader icon="🌶️" title="SPICE LEVEL" />
      <View style={styles.chipRow}>
        {SPICE_LEVELS.map(s => (
          <Chip
            key={s.key}
            label={`${s.emoji} ${s.key}`}
            selected={spiceLevel === s.key}
            onPress={() => setSpiceLevel(spiceLevel === s.key ? null : s.key)}
          />
        ))}
      </View>

      {/* Cooking Time */}
      <SectionHeader icon="⏱️" title="COOKING TIME" />
      <View style={styles.chipRow}>
        {COOKING_TIMES.map(t => (
          <Chip
            key={t.key}
            label={t.label}
            selected={cookingTime === t.key}
            onPress={() => setCookingTime(cookingTime === t.key ? null : t.key)}
          />
        ))}
      </View>

      {/* Difficulty */}
      <SectionHeader icon="📊" title="DIFFICULTY" />
      <View style={styles.chipRow}>
        {DIFFICULTIES.map(d => (
          <Chip
            key={d.key}
            label={`${d.emoji} ${d.key}`}
            selected={difficulty === d.key}
            onPress={() => setDifficulty(difficulty === d.key ? null : d.key)}
          />
        ))}
      </View>

      {/* Meat Type — only for non-veg */}
      {isNonVeg && meatTypeOptions.length > 0 && (
        <>
          <SectionHeader icon="🍗" title={`${proteinName.toUpperCase()} CUT`} />
          <View style={styles.chipRow}>
            {meatTypeOptions.map(m => (
              <Chip
                key={m}
                label={m}
                selected={meatType === m}
                onPress={() => setMeatType(meatType === m ? null : m)}
              />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );

  // ── Render Advanced Tab ──
  const renderAdvanced = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Cooking Method */}
      <SectionHeader icon="🍳" title="COOKING METHOD" />
      <View style={styles.chipRow}>
        {COOKING_METHODS.map(m => (
          <Chip
            key={m}
            label={m}
            selected={cookingMethod === m}
            onPress={() => setCookingMethod(cookingMethod === m ? null : m)}
          />
        ))}
      </View>

      {/* Cuisine */}
      <SectionHeader icon="🌍" title="CUISINE" />
      <View style={styles.chipRow}>
        {CUISINES.map(c => (
          <Chip
            key={c}
            label={c}
            selected={cuisine === c}
            onPress={() => setCuisine(cuisine === c ? null : c)}
          />
        ))}
      </View>

      {/* Calorie Range */}
      <SectionHeader icon="🔥" title="CALORIES (PER SERVING)" />
      <View style={styles.chipRow}>
        {CALORIE_RANGES.map(c => (
          <Chip
            key={c.key}
            label={c.label}
            selected={calorieRange === c.key}
            onPress={() => setCalorieRange(calorieRange === c.key ? null : c.key)}
          />
        ))}
      </View>

      {/* Meal Prep */}
      <SectionHeader icon="🍽️" title="MEAL PREP & LIFESTYLE" />
      <View style={styles.checkboxGrid}>
        {MEAL_PREP_OPTIONS.map(m => (
          <Checkbox
            key={m}
            label={m}
            checked={mealPrep.includes(m)}
            onPress={() => toggleMulti(mealPrep, m, setMealPrep)}
          />
        ))}
      </View>
    </ScrollView>
  );

  return (
    <PremiumScreen>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Filter Recipes</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'quick' && styles.tabActive]}
          onPress={() => setActiveTab('quick')}
        >
          <Text style={[styles.tabText, activeTab === 'quick' && styles.tabTextActive]}>Quick Build</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'advanced' && styles.tabActive]}
          onPress={() => setActiveTab('advanced')}
        >
          <Text style={[styles.tabText, activeTab === 'advanced' && styles.tabTextActive]}>Advanced</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeTab === 'quick' ? renderQuickBuild() : renderAdvanced()}

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.clearBtn} onPress={clearAll}>
          <Text style={styles.clearText}>Clear All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.applyBtn} onPress={applyFilters} activeOpacity={0.8}>
          <Text style={styles.applyText}>
            Apply Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>
      </SafeAreaView>
    </PremiumScreen>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: ORANGE,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },

  // Tab content
  tabContent: {
    flex: 1,
    paddingHorizontal: 16,
  },

  // Section header
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 10,
  },

  // Macro sub-label
  macroLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
    marginBottom: 6,
  },

  // Chip row (wrapping)
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  // Chip
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: {
    backgroundColor: 'rgba(143,58,31,0.2)',
    borderColor: ORANGE,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Checkbox grid
  checkboxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '50%',
    paddingVertical: 8,
    gap: 8,
  },
  checkboxLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
  },
  checkboxLabelActive: {
    color: '#FFFFFF',
  },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: 'rgba(13,11,9,0.92)',
  },
  clearBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  clearText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  applyBtn: {
    backgroundColor: ORANGE,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  applyText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
