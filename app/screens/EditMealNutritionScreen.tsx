import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PremiumScreen } from '../../components/PremiumScreen';
import { HomeButton } from '../../components/HomeButton';
import { getMealPlanForDate } from '../../services/mealPlanService';
import { getRecipeById } from '../../src/store/recipes';
import { INGREDIENT_EDIT_IN, INGREDIENT_EDIT_OUT } from './EditIngredientScreen';

const MACRO_OVERRIDE_PREFIX = 'spicestrong_macro_override_';

interface MacroOverride {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  description?: string;
  components?: string[];
  photoUri?: string;
  photoUris?: string[];
}

interface EditState {
  title: string;
  description: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  components: string[];
  photoUri?: string;
  photoUris?: string[];
}

function parseIngredientComponent(component: string): { name: string; calories: string; quantity: string; proteinG: number; carbsG: number; fatG: number } {
  const normalized = component.replace(/—/g, '|').replace(/ - /g, ' | ');
  const parts = normalized.split('|').map((part) => part.trim()).filter(Boolean);
  const name = parts[0]?.replace(/^[-•\s]+/, '') || component;
  const calories = parts.find((part) => /\bcal\b|kcal/i.test(part))?.replace(/^~\s*/, '') ?? '';
  const quantity = parts.find((part) => !/\bcal\b|kcal/i.test(part) && !/\bprotein\b/i.test(part) && !/\bcarb/i.test(part) && !/\bfat\b/i.test(part) && part !== name) ?? '';
  const proteinPart = parts.find((part) => /\bprotein\b/i.test(part));
  const carbsPart = parts.find((part) => /\bcarb/i.test(part));
  const fatPart = parts.find((part) => /\bfat\b/i.test(part));
  const proteinG = proteinPart ? Math.round(Number(proteinPart.replace(/[^\d.]/g, '')) || 0) : 0;
  const carbsG = carbsPart ? Math.round(Number(carbsPart.replace(/[^\d.]/g, '')) || 0) : 0;
  const fatG = fatPart ? Math.round(Number(fatPart.replace(/[^\d.]/g, '')) || 0) : 0;
  return { name, calories, quantity, proteinG, carbsG, fatG };
}

function numeric(value: string) {
  return Math.max(0, Math.round(Number(value.replace(/[^\d]/g, '')) || 0));
}

export default function EditMealNutritionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string; entryId?: string }>();
  const date = typeof params.date === 'string' ? params.date : '';
  const entryId = typeof params.entryId === 'string' ? params.entryId : '';

  const [meal, setMeal] = useState<EditState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const initialLoadDone = useRef(false);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    const run = async () => {
      // If returning from EditIngredientScreen, apply the result without reloading
      if (initialLoadDone.current) {
        const raw = await AsyncStorage.getItem(INGREDIENT_EDIT_OUT);
        if (raw) {
          await AsyncStorage.removeItem(INGREDIENT_EDIT_OUT);
          const result = JSON.parse(raw);
          setMeal((prev) => {
            if (!prev) return prev;
            const components = [...prev.components];
            if (result.deleted) {
              components.splice(result.index, 1);
            } else {
              const macros = [
                result.proteinG ? `${result.proteinG}g protein` : '',
                result.carbsG ? `${result.carbsG}g carbs` : '',
                result.fatG ? `${result.fatG}g fat` : '',
              ].filter(Boolean).join(' | ');
              components[result.index] = [result.name, result.calories, result.quantity, macros].filter(Boolean).join(' | ');
            }
            return { ...prev, components };
          });
        }
        return;
      }

      // Initial load from storage
      setLoading(true);
      try {
        const entries = await getMealPlanForDate(date);
        const entry = entries.find((item) => item.id === entryId);
        if (!entry) throw new Error('Meal not found.');

        const recipe = entry.recipeId.startsWith('quick_') ? null : await getRecipeById(entry.recipeId);
        const overrideStr = await AsyncStorage.getItem(`${MACRO_OVERRIDE_PREFIX}${entry.id}`);
        const override: MacroOverride | null = overrideStr ? JSON.parse(overrideStr) : null;
        const baseCalories = override?.calories ?? (recipe?.pipelineCalories ?? recipe?.aiNutrition?.calories ?? 0);
        const baseProtein = override?.proteinG ?? (recipe?.pipelineProteinG ?? recipe?.aiNutrition?.proteinG ?? 0);
        const baseCarbs = override?.carbsG ?? (recipe?.pipelineCarbsG ?? recipe?.aiNutrition?.carbsG ?? 0);
        const baseFat = override?.fatG ?? (recipe?.pipelineFatG ?? recipe?.aiNutrition?.fatG ?? 0);
        const components = override?.components?.length
          ? override.components
          : [`${entry.recipeName} | ${Math.round(baseCalories)} cal | 1 serving`];

        if (mounted) {
          setMeal({
            title: entry.recipeName || 'Meal',
            description: override?.description ?? recipe?.description ?? '',
            calories: Math.round(baseCalories),
            proteinG: Math.round(baseProtein),
            carbsG: Math.round(baseCarbs),
            fatG: Math.round(baseFat),
            components,
            photoUri: override?.photoUri,
            photoUris: override?.photoUris,
          });
          initialLoadDone.current = true;
        }
      } catch (err: any) {
        Alert.alert('Could not open meal', err?.message ?? 'Try again from Daily Cal Tracker.');
        router.back();
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => { mounted = false; };
  }, [date, entryId, router]));

  const updateNumber = (field: 'calories' | 'proteinG' | 'carbsG' | 'fatG', value: string) => {
    setMeal((prev) => prev ? { ...prev, [field]: numeric(value) } : prev);
  };

  const addIngredient = () => {
    setMeal((prev) => prev ? { ...prev, components: [...prev.components, 'Ingredient | 0 cal | qty'] } : prev);
  };

  const openIngredientEdit = async (index: number, component: string) => {
    const item = parseIngredientComponent(component);
    let { proteinG, carbsG, fatG } = item;

    // Estimate from meal totals when ingredient has no stored macros
    if (!proteinG && !carbsG && !fatG && meal) {
      const ingCal = Number(item.calories.replace(/[^\d]/g, '')) || 0;
      const totalIngCal = meal.components.reduce((sum, c) => {
        return sum + (Number(parseIngredientComponent(c).calories.replace(/[^\d]/g, '')) || 0);
      }, 0);
      if (totalIngCal > 0 && ingCal > 0) {
        const share = ingCal / totalIngCal;
        proteinG = Math.round(meal.proteinG * share);
        carbsG = Math.round(meal.carbsG * share);
        fatG = Math.round(meal.fatG * share);
      }
    }

    await AsyncStorage.setItem(INGREDIENT_EDIT_IN, JSON.stringify({
      index, name: item.name, calories: item.calories, quantity: item.quantity,
      proteinG, carbsG, fatG,
    }));
    router.push('/screens/EditIngredientScreen');
  };

  const save = async () => {
    if (!meal || !entryId) return;
    Keyboard.dismiss();
    setSaving(true);
    try {
      await AsyncStorage.setItem(`${MACRO_OVERRIDE_PREFIX}${entryId}`, JSON.stringify({
        calories: meal.calories,
        proteinG: meal.proteinG,
        carbsG: meal.carbsG,
        fatG: meal.fatG,
        description: meal.description,
        components: meal.components.filter((item) => item.trim()),
        photoUri: meal.photoUri ?? '',
        photoUris: meal.photoUris ?? (meal.photoUri ? [meal.photoUri] : []),
      }));
      router.back();
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Could not save meal edits.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !meal) {
    return (
      <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <ActivityIndicator color="#E8A87C" size="large" />
        </View>
      </PremiumScreen>
    );
  }

  return (
    <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEyebrow}>Daily Cal Tracker</Text>
          <Text style={styles.headerTitle}>Edit Food</Text>
        </View>
        <HomeButton />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 112 }]} showsVerticalScrollIndicator={false}>
        <TextInput
          style={styles.titleInput}
          value={meal.title}
          editable={false}
          placeholder="Food title"
          placeholderTextColor="rgba(248,241,232,0.34)"
        />
        <TextInput
          style={styles.descriptionInput}
          value={meal.description}
          onChangeText={(description) => setMeal((prev) => prev ? { ...prev, description } : prev)}
          placeholder="Short description"
          placeholderTextColor="rgba(248,241,232,0.34)"
          multiline
        />

        <View style={styles.calorieCard}>
          <View style={styles.calorieIcon}>
            <Ionicons name="flame" size={27} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.metricLabel}>Calories</Text>
            <TextInput
              style={styles.calorieInput}
              value={String(meal.calories)}
              onChangeText={(value) => updateNumber('calories', value)}
              keyboardType="number-pad"
              selectTextOnFocus
              returnKeyType="done"
            />
          </View>
        </View>

        <View style={styles.macroRow}>
          <MacroBox icon="barbell-outline" label="Protein" color="#EF6A6A" value={meal.proteinG} onChange={(value) => updateNumber('proteinG', value)} />
          <MacroBox icon="leaf-outline" label="Carbs" color="#E8A87C" value={meal.carbsG} onChange={(value) => updateNumber('carbsG', value)} />
          <MacroBox icon="water-outline" label="Fats" color="#60A5FA" value={meal.fatG} onChange={(value) => updateNumber('fatG', value)} />
        </View>

        <View style={styles.ingredientsHeader}>
          <Text style={styles.ingredientsTitle}>Ingredients</Text>
          <TouchableOpacity style={styles.addBtn} onPress={addIngredient} activeOpacity={0.82}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        {meal.components.map((component, index) => {
          const item = parseIngredientComponent(component);
          const calNum = item.calories.replace(/[^\d]/g, '');
          return (
            <TouchableOpacity
              key={`${component}_${index}`}
              style={styles.ingredientRow}
              onPress={() => openIngredientEdit(index, component)}
              activeOpacity={0.76}
            >
              <View style={styles.ingredientLeft}>
                <Text style={styles.ingredientName} numberOfLines={1}>{item.name}</Text>
                {calNum ? <Text style={styles.ingredientDot}>·</Text> : null}
                {calNum ? <Text style={styles.ingredientCal}>{calNum} cal</Text> : null}
              </View>
              <View style={styles.ingredientRight}>
                <Text style={styles.ingredientQty} numberOfLines={1}>{item.quantity}</Text>
                <Ionicons name="chevron-forward" size={14} color="rgba(248,241,232,0.28)" />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.doneBtn} onPress={save} disabled={saving} activeOpacity={0.86}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.doneBtnText}>Done</Text>}
        </TouchableOpacity>
      </View>
    </PremiumScreen>
  );
}

function MacroBox({
  icon,
  label,
  color,
  value,
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.macroBox}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.macroLabel}>{label}</Text>
      <View style={styles.macroInputRow}>
        <TextInput
          style={styles.macroInput}
          value={String(value)}
          onChangeText={onChange}
          keyboardType="number-pad"
          selectTextOnFocus
          returnKeyType="done"
        />
        <Text style={styles.macroUnit}>g</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  headerBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  headerTitleWrap: { alignItems: 'center' },
  headerEyebrow: {
    color: 'rgba(248,241,232,0.50)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 3 },
  scroll: { paddingHorizontal: 18 },
  titleInput: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    padding: 0,
    marginTop: 18,
    marginBottom: 12,
  },
  descriptionInput: {
    color: 'rgba(248,241,232,0.70)',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    padding: 0,
    minHeight: 74,
    marginBottom: 18,
  },
  calorieCard: {
    minHeight: 108,
    borderRadius: 24,
    backgroundColor: 'rgba(13,11,9,0.40)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  calorieIcon: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#A33A1F',
  },
  metricLabel: { color: 'rgba(248,241,232,0.58)', fontSize: 16, fontWeight: '900' },
  calorieInput: {
    color: '#FFFFFF',
    fontSize: 48,
    lineHeight: 54,
    fontWeight: '900',
    padding: 0,
  },
  macroRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  macroBox: {
    flex: 1,
    minHeight: 104,
    borderRadius: 22,
    backgroundColor: 'rgba(13,11,9,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    padding: 12,
    justifyContent: 'center',
  },
  macroLabel: { color: 'rgba(248,241,232,0.60)', fontSize: 13, fontWeight: '900', marginTop: 8 },
  macroInputRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  macroInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    padding: 0,
  },
  macroUnit: {
    color: 'rgba(248,241,232,0.58)',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  ingredientsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  ingredientsTitle: { color: '#FFFFFF', fontSize: 27, fontWeight: '900' },
  addBtn: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(143,58,31,0.54)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.48)',
  },
  addBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  ingredientRow: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  ingredientLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, overflow: 'hidden' },
  ingredientName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  ingredientDot: { color: 'rgba(248,241,232,0.35)', fontSize: 14, fontWeight: '600', flexShrink: 0 },
  ingredientCal: { color: 'rgba(248,241,232,0.50)', fontSize: 13, fontWeight: '600', flexShrink: 0 },
  ingredientRight: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  ingredientQty: { color: 'rgba(248,241,232,0.60)', fontSize: 13, fontWeight: '600', maxWidth: 110 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 14,
    backgroundColor: 'rgba(15,13,11,0.94)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(248,241,232,0.10)',
  },
  doneBtn: {
    minHeight: 64,
    borderRadius: 26,
    backgroundColor: '#A33A1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { color: '#FFFFFF', fontSize: 19, fontWeight: '900' },
});
