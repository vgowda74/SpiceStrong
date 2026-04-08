/**
 * MyPantryScreen.tsx — SpiceStrong
 * Premium pantry inventory management.
 * - Items grouped by category with counts
 * - Editable quantities inline
 * - Swipe/tap: Move to Grocery / Edit / Delete
 * - Quick add with category picker
 * - Scan My Grocery CTA
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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getPantryItems,
  addPantryItem,
  removePantryItem,
  savePantryItems,
  addToGroceryList,
  type PantryItem,
} from '../../services/pantryService';

const ORANGE = '#E85D26';
const BG = '#0F0F0F';
const SURFACE = '#1A1A1A';
const BORDER = 'rgba(255,255,255,0.08)';
const GREEN = '#22C55E';
const PLAYFAIR = Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'PlayfairDisplay_700Bold', default: 'serif' });

type Category = PantryItem['category'];
const CATEGORY_ORDER: Category[] = ['PROTEIN', 'VEGETABLE', 'FRUIT', 'DAIRY', 'GRAIN', 'CONDIMENT', 'SPICE', 'PANTRY'];
const CATEGORY_CONFIG: Record<Category, { label: string; emoji: string; color: string }> = {
  PROTEIN: { label: 'Proteins', emoji: '💪', color: '#E85D26' },
  VEGETABLE: { label: 'Vegetables', emoji: '🥬', color: '#22C55E' },
  FRUIT: { label: 'Fruits', emoji: '🍎', color: '#F59E0B' },
  DAIRY: { label: 'Dairy', emoji: '🥛', color: '#60A5FA' },
  GRAIN: { label: 'Grains', emoji: '🌾', color: '#D4A017' },
  CONDIMENT: { label: 'Condiments', emoji: '🫙', color: '#A78BFA' },
  SPICE: { label: 'Spices', emoji: '🧂', color: '#F97316' },
  PANTRY: { label: 'Pantry', emoji: '🥫', color: '#94A3B8' },
};

export default function MyPantryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<PantryItem[]>([]);
  const [addName, setAddName] = useState('');
  const [addQty, setAddQty] = useState('');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const isSelecting = selectedItems.size > 0;

  const loadItems = useCallback(async () => {
    setItems(await getPantryItems());
  }, []);

  useFocusEffect(useCallback(() => { loadItems(); }, [loadItems]));

  const handleTapItem = (item: PantryItem) => {
    Alert.alert(
      item.name,
      `Quantity: ${item.quantity}${item.state && item.state !== 'raw' ? ` · ${item.state}` : ''}`,
      [
        {
          text: '🛒 Move to Grocery',
          onPress: async () => {
            await addToGroceryList({ name: item.name, quantity: item.quantity });
            await removePantryItem(item.name);
            loadItems();
          },
        },
        {
          text: '✏️ Edit Quantity',
          onPress: () => {
            setEditingItem(item.name);
            setEditQty(item.quantity);
          },
        },
        {
          text: '🗑 Delete',
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

  const saveEditQty = async (name: string) => {
    const updated = items.map((i) =>
      i.name === name ? { ...i, quantity: editQty.trim() || 'some' } : i
    );
    await savePantryItems(updated);
    setItems(updated);
    setEditingItem(null);
  };

  // Auto-detect category from item name
  const detectCategory = (name: string): Category => {
    const n = name.toLowerCase();
    const proteins = ['chicken', 'beef', 'pork', 'lamb', 'goat', 'fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'egg', 'tofu', 'paneer', 'tempeh', 'turkey', 'duck', 'lentil', 'bean', 'chickpea', 'whey', 'protein'];
    const vegetables = ['spinach', 'kale', 'broccoli', 'carrot', 'tomato', 'onion', 'garlic', 'pepper', 'capsicum', 'potato', 'mushroom', 'zucchini', 'cucumber', 'lettuce', 'cabbage', 'cauliflower', 'celery', 'corn', 'peas', 'eggplant', 'ginger'];
    const fruits = ['apple', 'banana', 'orange', 'lemon', 'lime', 'mango', 'avocado', 'berry', 'grape', 'pineapple', 'watermelon', 'strawberry', 'blueberry'];
    const dairy = ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'ghee', 'curd', 'paneer', 'whey'];
    const grains = ['rice', 'pasta', 'bread', 'flour', 'oat', 'quinoa', 'noodle', 'tortilla', 'naan', 'couscous'];
    const spices = ['salt', 'pepper', 'cumin', 'turmeric', 'cinnamon', 'paprika', 'chili', 'oregano', 'basil', 'thyme', 'garam masala', 'coriander'];
    const condiments = ['oil', 'vinegar', 'sauce', 'soy sauce', 'ketchup', 'mustard', 'honey', 'mayo', 'dressing'];
    if (proteins.some((p) => n.includes(p))) return 'PROTEIN';
    if (dairy.some((d) => n.includes(d))) return 'DAIRY';
    if (vegetables.some((v) => n.includes(v))) return 'VEGETABLE';
    if (fruits.some((f) => n.includes(f))) return 'FRUIT';
    if (grains.some((g) => n.includes(g))) return 'GRAIN';
    if (spices.some((s) => n.includes(s))) return 'SPICE';
    if (condiments.some((c) => n.includes(c))) return 'CONDIMENT';
    return 'PANTRY';
  };

  const handleAdd = async () => {
    const name = addName.trim().toLowerCase();
    if (!name) return;
    const category = detectCategory(name);
    await addPantryItem({ name, category, quantity: addQty.trim() || 'some' });
    setAddName('');
    setAddQty('');
    loadItems();
  };

  const toggleSelect = (name: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    for (const name of selectedItems) {
      await removePantryItem(name);
    }
    setSelectedItems(new Set());
    loadItems();
  };

  const handleMoveSelectedToGrocery = async () => {
    for (const name of selectedItems) {
      const item = items.find((i) => i.name === name);
      if (item) {
        await addToGroceryList({ name: item.name, quantity: item.quantity });
        await removePantryItem(item.name);
      }
    }
    setSelectedItems(new Set());
    loadItems();
    Alert.alert('Moved! 🛒', 'Selected items moved to your grocery list.');
  };

  // Group by category
  const grouped = CATEGORY_ORDER.reduce<Record<string, PantryItem[]>>((acc, cat) => {
    const catItems = items.filter((i) => i.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {});

  const totalCount = items.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>My Pantry</Text>
          <Text style={styles.headerSub}>{totalCount} item{totalCount !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => router.push('/screens/ScanFridgeScreen')}
          activeOpacity={0.8}
        >
          <Text style={styles.scanBtnText}>📸 Scan</Text>
        </TouchableOpacity>
      </View>

      {/* Quick add — at top */}
      <View style={styles.addTopBar}>
        <View style={styles.addRow}>
          <TextInput
            style={styles.addNameInput}
            value={addName}
            onChangeText={setAddName}
            placeholder="Add item..."
            placeholderTextColor="rgba(255,255,255,0.30)"
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />
          <TextInput
            style={styles.addQtyInput}
            value={addQty}
            onChangeText={setAddQty}
            placeholder="Qty"
            placeholderTextColor="rgba(255,255,255,0.20)"
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />
          <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.8}>
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Selection action bar */}
      {isSelecting && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>{selectedItems.size} selected</Text>
          <TouchableOpacity style={styles.selectionAction} onPress={handleMoveSelectedToGrocery} activeOpacity={0.75}>
            <Text style={styles.selectionActionText}>🛒 Grocery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.selectionAction, styles.selectionActionDanger]} onPress={handleDeleteSelected} activeOpacity={0.75}>
            <Text style={styles.selectionActionDangerText}>🗑 Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelectedItems(new Set())} activeOpacity={0.7}>
            <Text style={styles.selectionCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        {/* Empty state */}
        {items.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🛒</Text>
            <Text style={styles.emptyTitle}>Pantry is empty</Text>
            <Text style={styles.emptySub}>Scan your groceries or add items below</Text>
            <TouchableOpacity
              style={styles.emptyScanBtn}
              onPress={() => router.push('/screens/ScanFridgeScreen')}
              activeOpacity={0.8}
            >
              <LinearGradient colors={['#F07030', '#C84A10']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyScanGradient}>
                <Text style={styles.emptyScanText}>📸 Scan My Grocery</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Grouped items */}
        {Object.entries(grouped).map(([cat, catItems]) => {
          const config = CATEGORY_CONFIG[cat as Category];
          return (
            <View key={cat} style={styles.catSection}>
              <View style={styles.catHeader}>
                <View style={[styles.catDot, { backgroundColor: config.color }]} />
                <Text style={styles.catEmoji}>{config.emoji}</Text>
                <Text style={styles.catLabel}>{config.label}</Text>
                <View style={[styles.catBadge, { backgroundColor: config.color + '20' }]}>
                  <Text style={[styles.catBadgeText, { color: config.color }]}>{catItems.length}</Text>
                </View>
              </View>
              {catItems.map((item) => {
                const isSelected = selectedItems.has(item.name);
                return (
                <TouchableOpacity
                  key={item.name}
                  style={[styles.itemCard, isSelected && styles.itemCardSelected]}
                  onPress={() => isSelecting ? toggleSelect(item.name) : handleTapItem(item)}
                  onLongPress={() => toggleSelect(item.name)}
                  activeOpacity={0.7}
                >
                  {isSelecting && (
                    <View style={[styles.selectBox, isSelected && styles.selectBoxOn]}>
                      {isSelected && <Text style={styles.selectCheck}>✓</Text>}
                    </View>
                  )}
                  <View style={styles.itemLeft}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.state && item.state !== 'raw' && (
                      <View style={styles.itemStateBadge}>
                        <Text style={styles.itemStateText}>{item.state}</Text>
                      </View>
                    )}
                  </View>
                  {editingItem === item.name ? (
                    <View style={styles.editQtyRow}>
                      <TextInput
                        style={styles.editQtyInput}
                        value={editQty}
                        onChangeText={setEditQty}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => saveEditQty(item.name)}
                        onBlur={() => saveEditQty(item.name)}
                        placeholder="qty"
                        placeholderTextColor="rgba(255,255,255,0.20)"
                      />
                    </View>
                  ) : (
                    <Text style={styles.itemQty}>{item.quantity}</Text>
                  )}
                </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

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
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 2 },
  scanBtn: {
    backgroundColor: 'rgba(232,93,38,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.35)',
  },
  scanBtnText: { fontSize: 13, fontWeight: '700', color: ORANGE },

  addTopBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  scroll: { paddingHorizontal: 20, paddingTop: 16 },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
  emptySub: { fontSize: 14, color: 'rgba(255,255,255,0.50)' },
  emptyScanBtn: { marginTop: 20, borderRadius: 16, overflow: 'hidden' },
  emptyScanGradient: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 16 },
  emptyScanText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  // Category sections
  catSection: { marginBottom: 20 },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  catDot: { width: 4, height: 16, borderRadius: 2 },
  catEmoji: { fontSize: 16 },
  catLabel: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', flex: 1 },
  catBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  catBadgeText: { fontSize: 11, fontWeight: '800' },

  // Selection bar
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(232,93,38,0.10)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(232,93,38,0.20)',
    gap: 10,
  },
  selectionCount: { fontSize: 13, fontWeight: '700', color: ORANGE, flex: 1 },
  selectionAction: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.30)',
  },
  selectionActionText: { fontSize: 12, fontWeight: '700', color: GREEN },
  selectionActionDanger: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: 'rgba(239,68,68,0.30)',
  },
  selectionActionDangerText: { fontSize: 12, fontWeight: '700', color: '#EF4444' },
  selectionCancel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.40)' },

  // Select checkbox
  selectBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBoxOn: { backgroundColor: ORANGE, borderColor: ORANGE },
  selectCheck: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  // Item cards
  itemCardSelected: {
    borderColor: ORANGE,
    backgroundColor: 'rgba(232,93,38,0.08)',
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SURFACE,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: BORDER,
  },
  itemLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  itemStateBadge: {
    backgroundColor: 'rgba(232,93,38,0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  itemStateText: { fontSize: 10, fontWeight: '700', color: ORANGE, textTransform: 'uppercase' },
  itemQty: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },

  // Edit quantity
  editQtyRow: { flexDirection: 'row', alignItems: 'center' },
  editQtyInput: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    width: 80,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: ORANGE,
  },

  // Add footer
  addFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  addNameInput: {
    flex: 2,
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  addQtyInput: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
  },
  addBtn: {
    width: 46,
    backgroundColor: ORANGE,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  addCatScroll: { maxHeight: 34 },
  addCatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  addCatEmoji: { fontSize: 12 },
  addCatText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.40)' },
});
