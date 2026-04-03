/**
 * MyPantryScreen.tsx — SpiceStrong
 * Persistent pantry inventory.
 * - Shows all pantry items grouped by category
 * - Tap item → popup: Move to Grocery List / Delete / Cancel
 * - Manual add with name + category
 * - Populated by Scan My Grocery or manual entry
 */

import React, { useCallback, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getPantryItems,
  addPantryItem,
  removePantryItem,
  addToGroceryList,
  type PantryItem,
} from '../../services/pantryService';

const ORANGE = '#E85D26';
const BG = '#0F0F0F';
const SURFACE = '#1A1A1A';
const BORDER = 'rgba(255,255,255,0.10)';
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'PlayfairDisplay_700Bold',
  default: 'serif',
});

type Category = PantryItem['category'];
const CATEGORY_ORDER: Category[] = ['PROTEIN', 'VEGETABLE', 'FRUIT', 'DAIRY', 'GRAIN', 'CONDIMENT', 'SPICE', 'PANTRY'];
const CATEGORY_LABELS: Record<Category, string> = {
  PROTEIN: '💪 Proteins',
  VEGETABLE: '🥬 Vegetables',
  FRUIT: '🍎 Fruits',
  DAIRY: '🥛 Dairy',
  GRAIN: '🌾 Grains',
  CONDIMENT: '🫙 Condiments',
  SPICE: '🧂 Spices',
  PANTRY: '🥫 Pantry',
};

export default function MyPantryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<PantryItem[]>([]);
  const [addName, setAddName] = useState('');
  const [addCategory, setAddCategory] = useState<Category>('VEGETABLE');

  const loadItems = useCallback(async () => {
    const pantry = await getPantryItems();
    setItems(pantry);
  }, []);

  useFocusEffect(useCallback(() => {
    loadItems();
  }, [loadItems]));

  const handleTapItem = (item: PantryItem) => {
    Alert.alert(
      item.name,
      item.quantity !== 'some' ? `Quantity: ${item.quantity}` : undefined,
      [
        {
          text: 'Move to Grocery List',
          onPress: async () => {
            await addToGroceryList({ name: item.name, quantity: item.quantity });
            await removePantryItem(item.name);
            loadItems();
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await removePantryItem(item.name);
            loadItems();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleAdd = async () => {
    const name = addName.trim().toLowerCase();
    if (!name) return;
    await addPantryItem({ name, category: addCategory, quantity: 'some' });
    setAddName('');
    loadItems();
  };

  // Group by category
  const grouped = CATEGORY_ORDER.reduce<Record<string, PantryItem[]>>((acc, cat) => {
    const catItems = items.filter((i) => i.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {});

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Pantry</Text>
        <Text style={styles.itemCount}>{items.length} items</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        {/* Empty state */}
        {items.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🛒</Text>
            <Text style={styles.emptyTitle}>Pantry is empty</Text>
            <Text style={styles.emptySub}>
              Scan your groceries or add items manually below
            </Text>
            <TouchableOpacity
              style={styles.scanBtn}
              onPress={() => router.push('/screens/ScanFridgeScreen')}
              activeOpacity={0.8}
            >
              <Text style={styles.scanBtnText}>📸 Scan My Grocery</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Grouped items */}
        {Object.entries(grouped).map(([cat, catItems]) => (
          <View key={cat} style={styles.catSection}>
            <Text style={styles.catLabel}>{CATEGORY_LABELS[cat as Category]}</Text>
            <View style={styles.chipWrap}>
              {catItems.map((item) => (
                <TouchableOpacity
                  key={item.name}
                  style={styles.chip}
                  onPress={() => handleTapItem(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipText}>{item.name}</Text>
                  {item.quantity !== 'some' && (
                    <Text style={styles.chipQty}>{item.quantity}</Text>
                  )}
                  {item.state && item.state !== 'raw' && (
                    <Text style={styles.chipState}>{item.state}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Add item section */}
        <View style={styles.addSection}>
          <Text style={styles.catLabel}>+ Add Item</Text>
          <TextInput
            style={styles.addInput}
            value={addName}
            onChangeText={setAddName}
            placeholder="e.g. chicken breast"
            placeholderTextColor="rgba(255,255,255,0.30)"
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
            {CATEGORY_ORDER.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.catPill, addCategory === cat && styles.catPillActive]}
                onPress={() => setAddCategory(cat)}
              >
                <Text style={[styles.catPillText, addCategory === cat && styles.catPillTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.75}>
            <Text style={styles.addBtnText}>Add to Pantry</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Scan button footer */}
      {items.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={styles.footerScanBtn}
            onPress={() => router.push('/screens/ScanFridgeScreen')}
            activeOpacity={0.8}
          >
            <Text style={styles.footerScanText}>📸 Scan More Groceries</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', fontFamily: PLAYFAIR },
  itemCount: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.40)' },

  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  emptySub: { fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 22 },
  scanBtn: {
    marginTop: 16,
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  scanBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  // Categories
  catSection: { marginBottom: 20 },
  catLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  chipQty: { fontSize: 11, color: 'rgba(255,255,255,0.40)' },
  chipState: { fontSize: 10, fontWeight: '700', color: ORANGE, textTransform: 'uppercase' },

  // Add item
  addSection: { marginBottom: 20, gap: 8 },
  addInput: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  catScroll: { maxHeight: 36 },
  catPill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  catPillActive: { backgroundColor: 'rgba(232,93,38,0.20)', borderWidth: 1, borderColor: ORANGE },
  catPillText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase' },
  catPillTextActive: { color: ORANGE },
  addBtn: {
    backgroundColor: 'rgba(232,93,38,0.20)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.40)',
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: ORANGE },

  // Footer
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
  footerScanBtn: {
    backgroundColor: 'rgba(232,93,38,0.15)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.35)',
  },
  footerScanText: { fontSize: 14, fontWeight: '700', color: ORANGE },
});
