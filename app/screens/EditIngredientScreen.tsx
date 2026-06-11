import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
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

interface IngredientEditPayload {
  index: number;
  name: string;
  calories: string;
  quantity: string;
}

export default function EditIngredientScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [index, setIndex] = useState(-1);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
          await AsyncStorage.setItem(INGREDIENT_EDIT_OUT, JSON.stringify({
            index,
            deleted: true,
          }));
          router.back();
        },
      },
    ]);
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    setSaving(true);
    try {
      const cal = Math.max(0, Math.round(Number(calories) || 0));
      const payload: IngredientEditPayload & { deleted?: boolean } = {
        index,
        name: name.trim() || 'Ingredient',
        calories: `${cal} cal`,
        quantity: quantity.trim() || 'qty',
      };
      await AsyncStorage.setItem(INGREDIENT_EDIT_OUT, JSON.stringify(payload));
      router.back();
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
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
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Ingredient</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={handleDelete} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={20} color="#EF6A6A" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 16}
      >
        <View style={styles.body}>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Ingredient name"
            placeholderTextColor="rgba(248,241,232,0.28)"
            autoFocus={false}
            returnKeyType="next"
          />

          <Text style={styles.fieldLabel}>Portion / Quantity</Text>
          <View style={styles.fieldCard}>
            <TextInput
              style={styles.fieldInput}
              value={quantity}
              onChangeText={setQuantity}
              placeholder="e.g. 2 large, 1 cup, 100g"
              placeholderTextColor="rgba(248,241,232,0.34)"
              returnKeyType="next"
            />
          </View>

          <Text style={styles.fieldLabel}>Calories</Text>
          <View style={styles.calorieCard}>
            <View style={styles.calorieIcon}>
              <Ionicons name="flame" size={22} color="#FFFFFF" />
            </View>
            <TextInput
              style={styles.calorieInput}
              value={calories}
              onChangeText={(v) => setCalories(v.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="rgba(248,241,232,0.28)"
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            <Text style={styles.calorieUnit}>cal</Text>
          </View>
        </View>

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={styles.doneBtn} onPress={handleSave} disabled={saving} activeOpacity={0.86}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.doneBtnText}>Done</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </PremiumScreen>
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
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  nameInput: {
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '900',
    padding: 0,
    marginBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(248,241,232,0.14)',
    paddingBottom: 12,
  },
  fieldLabel: {
    color: 'rgba(248,241,232,0.56)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  fieldCard: {
    borderRadius: 18,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 24,
  },
  fieldInput: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    padding: 0,
  },
  calorieCard: {
    borderRadius: 18,
    backgroundColor: 'rgba(248,241,232,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.12)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  calorieIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#8F3A1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calorieInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    padding: 0,
  },
  calorieUnit: {
    color: 'rgba(248,241,232,0.54)',
    fontSize: 16,
    fontWeight: '900',
  },
  bottomBar: {
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: 'rgba(15,13,11,0.92)',
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
