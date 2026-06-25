import React, { useEffect, useRef, useState } from 'react';
import { ProcessingRing } from '../../components/ProcessingRing';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PremiumScreen } from '../../components/PremiumScreen';

export const INGREDIENT_EDIT_IN = 'spicestrong_ingredient_edit_in';
export const INGREDIENT_EDIT_OUT = 'spicestrong_ingredient_edit_out';

export interface IngredientEditPayload {
  index: number;
  name: string;
  calories: string;
  quantity: string;
  proteinG: number;
  carbsG: number;
  fatG: number;
  deleted?: boolean;
}

function num(v: string) {
  return Math.max(0, Math.round(Number(v.replace(/[^\d]/g, '')) || 0));
}

function quantityAmount(v: string): number | null {
  const mixedFraction = v.match(/(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)/);
  if (mixedFraction) {
    const whole = Number(mixedFraction[1]);
    const numerator = Number(mixedFraction[2]);
    const denominator = Number(mixedFraction[3]);
    if (denominator > 0) return whole + numerator / denominator;
  }

  const fraction = v.match(/(\d+)\/(\d+)/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator > 0) return numerator / denominator;
  }

  const decimal = v.match(/\d+(?:\.\d+)?/);
  return decimal ? Number(decimal[0]) : null;
}

export default function EditIngredientScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [index, setIndex] = useState(-1);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [quantity, setQuantity] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [fatG, setFatG] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const qtyRef = useRef<TextInput>(null);
  const calRef = useRef<TextInput>(null);
  const proteinRef = useRef<TextInput>(null);
  const carbsRef = useRef<TextInput>(null);
  const fatRef = useRef<TextInput>(null);
  const originalRef = useRef<{
    quantityAmount: number | null;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(INGREDIENT_EDIT_IN).then((raw) => {
      if (!raw) {
        Alert.alert('Error', 'Could not load ingredient.');
        router.back();
        return;
      }
      const data: IngredientEditPayload = JSON.parse(raw);
      setIndex(data.index);
      setName(data.name);
      setCalories(data.calories.replace(/[^\d]/g, ''));
      setQuantity(data.quantity);
      setProteinG(String(data.proteinG ?? 0));
      setCarbsG(String(data.carbsG ?? 0));
      setFatG(String(data.fatG ?? 0));
      originalRef.current = {
        quantityAmount: quantityAmount(data.quantity),
        calories: num(data.calories),
        proteinG: Math.max(0, Math.round(data.proteinG ?? 0)),
        carbsG: Math.max(0, Math.round(data.carbsG ?? 0)),
        fatG: Math.max(0, Math.round(data.fatG ?? 0)),
      };
      setLoading(false);
    }).catch(() => {
      Alert.alert('Error', 'Could not load ingredient.');
      router.back();
    });
  }, []);

  const handleDelete = () => {
    Alert.alert('Remove ingredient?', `Remove "${name}" from this meal?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.setItem(INGREDIENT_EDIT_OUT, JSON.stringify({ index, deleted: true }));
          router.back();
        },
      },
    ]);
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    setSaving(true);
    try {
      const payload: IngredientEditPayload = {
        index,
        name: name.trim() || 'Ingredient',
        calories: `${num(calories)} cal`,
        quantity: quantity.trim() || 'qty',
        proteinG: num(proteinG),
        carbsG: num(carbsG),
        fatG: num(fatG),
      };
      await AsyncStorage.setItem(INGREDIENT_EDIT_OUT, JSON.stringify(payload));
      router.back();
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuantityChange = (value: string) => {
    setQuantity(value);

    const original = originalRef.current;
    const nextAmount = quantityAmount(value);
    if (!original?.quantityAmount || !nextAmount) return;

    const scale = nextAmount / original.quantityAmount;
    setCalories(String(Math.round(original.calories * scale)));
    setProteinG(String(Math.round(original.proteinG * scale)));
    setCarbsG(String(Math.round(original.carbsG * scale)));
    setFatG(String(Math.round(original.fatG * scale)));
  };

  if (loading) {
    return (
      <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <ProcessingRing label="Loading…" expectedMs={2000} />
        </View>
      </PremiumScreen>
    );
  }

  return (
    <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Ingredient</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={handleDelete} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={20} color="#EF6A6A" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 96 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder="Ingredient name"
          placeholderTextColor="rgba(248,241,232,0.28)"
          returnKeyType="next"
          onSubmitEditing={() => qtyRef.current?.focus()}
        />

        <Text style={styles.fieldLabel}>Portion / Quantity</Text>
        <View style={styles.fieldCard}>
          <TextInput
            ref={qtyRef}
            style={styles.fieldInput}
            value={quantity}
            onChangeText={handleQuantityChange}
            placeholder="e.g. 2 large, 1 cup, 100g"
            placeholderTextColor="rgba(248,241,232,0.34)"
            returnKeyType="next"
            onSubmitEditing={() => calRef.current?.focus()}
          />
        </View>

        <Text style={styles.fieldLabel}>Calories</Text>
        <View style={styles.calorieCard}>
          <View style={styles.calorieIcon}>
            <Ionicons name="flame" size={22} color="#FFFFFF" />
          </View>
          <TextInput
            ref={calRef}
            style={styles.calorieInput}
            value={calories}
            onChangeText={(v) => setCalories(v.replace(/[^\d]/g, ''))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="rgba(248,241,232,0.28)"
            selectTextOnFocus
            returnKeyType="next"
            onSubmitEditing={() => proteinRef.current?.focus()}
          />
          <Text style={styles.calorieUnit}>cal</Text>
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Macros</Text>
        <View style={styles.macroRow}>
          <MacroTile
            ref={proteinRef}
            icon="barbell-outline"
            label="Protein"
            color="#EF6A6A"
            value={proteinG}
            onChangeText={(v) => setProteinG(v.replace(/[^\d]/g, ''))}
            onSubmitEditing={() => carbsRef.current?.focus()}
          />
          <MacroTile
            ref={carbsRef}
            icon="leaf-outline"
            label="Carbs"
            color="#E8A87C"
            value={carbsG}
            onChangeText={(v) => setCarbsG(v.replace(/[^\d]/g, ''))}
            onSubmitEditing={() => fatRef.current?.focus()}
          />
          <MacroTile
            ref={fatRef}
            icon="water-outline"
            label="Fat"
            color="#60A5FA"
            value={fatG}
            onChangeText={(v) => setFatG(v.replace(/[^\d]/g, ''))}
            onSubmitEditing={handleSave}
          />
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.doneBtn} onPress={handleSave} disabled={saving} activeOpacity={0.86}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.doneBtnText}>Done</Text>}
        </TouchableOpacity>
      </View>
    </PremiumScreen>
  );
}

const MacroTile = React.forwardRef<TextInput, {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  value: string;
  onChangeText: (v: string) => void;
  onSubmitEditing?: () => void;
}>(({ icon, label, color, value, onChangeText, onSubmitEditing }, ref) => (
  <View style={styles.macroTile}>
    <Ionicons name={icon} size={18} color={color} />
    <Text style={styles.macroLabel}>{label}</Text>
    <View style={styles.macroInputRow}>
      <TextInput
        ref={ref}
        style={styles.macroInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        selectTextOnFocus
        returnKeyType="next"
        onSubmitEditing={onSubmitEditing}
        placeholder="0"
        placeholderTextColor="rgba(248,241,232,0.28)"
      />
      <Text style={styles.macroUnit}>g</Text>
    </View>
  </View>
));

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  headerBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  body: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  nameInput: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '900',
    padding: 0,
    marginBottom: 26,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(248,241,232,0.14)',
    paddingBottom: 12,
  },
  fieldLabel: {
    color: 'rgba(248,241,232,0.56)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  fieldCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  fieldInput: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    padding: 0,
  },
  calorieCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  calorieIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#8F3A1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calorieInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    padding: 0,
  },
  calorieUnit: {
    color: 'rgba(248,241,232,0.54)',
    fontSize: 15,
    fontWeight: '900',
  },
  macroRow: {
    flexDirection: 'row',
    gap: 10,
  },
  macroTile: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    padding: 12,
    minHeight: 90,
    justifyContent: 'space-between',
  },
  macroLabel: {
    color: 'rgba(248,241,232,0.56)',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  macroInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  macroInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    padding: 0,
  },
  macroUnit: {
    color: 'rgba(248,241,232,0.50)',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: 'rgba(15,13,11,0.94)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(248,241,232,0.10)',
  },
  doneBtn: {
    minHeight: 56,
    borderRadius: 22,
    backgroundColor: '#8F3A1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
});
