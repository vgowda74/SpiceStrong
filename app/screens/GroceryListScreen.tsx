/**
 * GroceryListScreen.tsx — SpiceStrong
 * Premium grocery shopping list.
 * - Items with checkboxes (tap to mark bought)
 * - Grouped by category
 * - Move back to pantry
 * - Share list
 * - Pantry items auto-subtracted
 */

import React, { useCallback, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  Share,
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
  getGroceryList,
  saveGroceryList,
  addToGroceryList,
  removeFromGroceryList,
  toggleGroceryItem,
  type GroceryItem,
} from '../../services/pantryService';
import { addPantryItem } from '../../services/pantryService';

const ORANGE = '#E85D26';
const BG = '#0F0F0F';
const SURFACE = '#1A1A1A';
const BORDER = 'rgba(255,255,255,0.08)';
const GREEN = '#22C55E';
const PLAYFAIR = Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'PlayfairDisplay_700Bold', default: 'serif' });

export default function GroceryListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<GroceryItem[]>([]);
  const [addName, setAddName] = useState('');
  const [addQty, setAddQty] = useState('');

  const loadItems = useCallback(async () => {
    setItems(await getGroceryList());
  }, []);

  useFocusEffect(useCallback(() => { loadItems(); }, [loadItems]));

  const handleToggle = async (name: string) => {
    await toggleGroceryItem(name);
    loadItems();
  };

  const handleTapItem = (item: GroceryItem) => {
    Alert.alert(
      item.name,
      `${item.quantity}${item.fromRecipe ? `\nFrom: ${item.fromRecipe}` : ''}`,
      [
        {
          text: '📦 Move to Pantry',
          onPress: async () => {
            await addPantryItem({ name: item.name, category: 'PANTRY', quantity: item.quantity });
            await removeFromGroceryList(item.name);
            loadItems();
          },
        },
        {
          text: '🗑 Remove',
          style: 'destructive',
          onPress: async () => {
            await removeFromGroceryList(item.name);
            loadItems();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleAdd = async () => {
    const name = addName.trim();
    if (!name) return;
    await addToGroceryList({ name, quantity: addQty.trim() || '1' });
    setAddName('');
    setAddQty('');
    loadItems();
  };

  const handleShare = async () => {
    const unchecked = items.filter((i) => !i.checked);
    const checked = items.filter((i) => i.checked);
    let text = '🛒 Grocery List\n\n';
    if (unchecked.length > 0) {
      text += 'To Buy:\n';
      unchecked.forEach((i) => { text += `  ☐ ${i.quantity} ${i.name}\n`; });
    }
    if (checked.length > 0) {
      text += '\nDone:\n';
      checked.forEach((i) => { text += `  ✓ ${i.quantity} ${i.name}\n`; });
    }
    text += '\nPowered by SpiceStrong 💪';
    await Share.share({ message: text });
  };

  const handleClearChecked = () => {
    Alert.alert('Clear Checked Items', 'Remove all checked items from the list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          const remaining = items.filter((i) => !i.checked);
          await saveGroceryList(remaining);
          setItems(remaining);
        },
      },
    ]);
  };

  const uncheckedItems = items.filter((i) => !i.checked);
  const checkedItems = items.filter((i) => i.checked);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Grocery List</Text>
          <Text style={styles.headerSub}>{uncheckedItems.length} to buy · {checkedItems.length} done</Text>
        </View>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
          <Text style={styles.shareBtnText}>📤 Share</Text>
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

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        {/* Empty state */}
        {items.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🛒</Text>
            <Text style={styles.emptyTitle}>Nothing to buy</Text>
            <Text style={styles.emptySub}>Add items below or recipes will auto-populate your list</Text>
          </View>
        )}

        {/* Unchecked items */}
        {uncheckedItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>TO BUY</Text>
            {uncheckedItems.map((item) => (
              <TouchableOpacity
                key={item.name}
                style={styles.itemCard}
                onPress={() => handleToggle(item.name)}
                onLongPress={() => handleTapItem(item)}
                activeOpacity={0.7}
              >
                <View style={styles.checkbox}>
                  <View style={styles.checkboxInner} />
                </View>
                <View style={styles.itemIcon}>
                  <Text style={styles.itemIconText}>🛒</Text>
                </View>
                <View style={styles.itemContent}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {item.fromRecipe && <Text style={styles.itemRecipe}>{item.fromRecipe}</Text>}
                </View>
                <Text style={styles.itemQty}>{item.quantity}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Checked items */}
        {checkedItems.length > 0 && (
          <View style={styles.section}>
            <View style={styles.doneHeader}>
              <Text style={styles.sectionLabelDone}>DONE</Text>
              <TouchableOpacity onPress={handleClearChecked} activeOpacity={0.7}>
                <Text style={styles.clearBtn}>Clear all</Text>
              </TouchableOpacity>
            </View>
            {checkedItems.map((item) => (
              <TouchableOpacity
                key={item.name}
                style={[styles.itemCard, styles.itemCardDone]}
                onPress={() => handleToggle(item.name)}
                onLongPress={() => handleTapItem(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, styles.checkboxDone]}>
                  <Text style={styles.checkboxCheck}>✓</Text>
                </View>
                <View style={[styles.itemIcon, { opacity: 0.4 }]}>
                  <Text style={styles.itemIconText}>✅</Text>
                </View>
                <View style={styles.itemContent}>
                  <Text style={[styles.itemName, styles.itemNameDone]}>{item.name}</Text>
                </View>
                <Text style={[styles.itemQty, styles.itemQtyDone]}>{item.quantity}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.moveToPantryBtn}
          onPress={async () => {
            const checked = items.filter((i) => i.checked);
            if (checked.length === 0) {
              Alert.alert('No items selected', 'Check items you\'ve bought to move them to your pantry.');
              return;
            }
            for (const item of checked) {
              await addPantryItem({ name: item.name, category: 'PANTRY', quantity: item.quantity });
              await removeFromGroceryList(item.name);
            }
            loadItems();
            Alert.alert('Moved! 📦', `${checked.length} item${checked.length > 1 ? 's' : ''} moved to your pantry.`);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.moveToPantryText}>📦 Pantry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteCheckedBtn}
          onPress={() => {
            const checked = items.filter((i) => i.checked);
            if (checked.length === 0) {
              Alert.alert('No items checked', 'Check items to delete them.');
              return;
            }
            Alert.alert('Delete Checked', `Remove ${checked.length} checked item${checked.length > 1 ? 's' : ''}?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  const remaining = items.filter((i) => !i.checked);
                  await saveGroceryList(remaining);
                  setItems(remaining);
                },
              },
            ]);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.deleteCheckedText}>🗑</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.orderBtn}
          onPress={() => router.push('/screens/OrderGroceryScreen')}
          activeOpacity={0.8}
        >
          <Text style={styles.orderBtnText}>🛍 Order</Text>
        </TouchableOpacity>
      </View>
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
  shareBtn: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  shareBtnText: { fontSize: 13, fontWeight: '700', color: GREEN },

  addTopBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  scroll: { paddingHorizontal: 20, paddingTop: 16 },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
  emptySub: { fontSize: 14, color: 'rgba(255,255,255,0.50)', textAlign: 'center' },

  // Sections
  section: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  doneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionLabelDone: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(34,197,94,0.60)',
    letterSpacing: 1.5,
  },
  clearBtn: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.35)' },

  // Item cards — ingredient checklist style
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  itemCardDone: {
    backgroundColor: 'rgba(34,197,94,0.04)',
    borderColor: 'rgba(34,197,94,0.10)',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxInner: {},
  checkboxDone: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  checkboxCheck: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemIconText: { fontSize: 20 },
  itemContent: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  itemNameDone: { color: 'rgba(255,255,255,0.35)', textDecorationLine: 'line-through' },
  itemRecipe: { fontSize: 11, color: 'rgba(255,255,255,0.30)', marginTop: 2 },
  itemQty: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.50)', marginLeft: 8 },
  itemQtyDone: { color: 'rgba(255,255,255,0.25)' },

  // Bottom action bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  moveToPantryBtn: {
    flex: 2,
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  moveToPantryText: { fontSize: 13, fontWeight: '700', color: GREEN },
  deleteCheckedBtn: {
    width: 46,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.30)',
  },
  deleteCheckedText: { fontSize: 18 },
  orderBtn: {
    flex: 1,
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  orderBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },

  addRow: { flexDirection: 'row', gap: 8 },
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
    backgroundColor: GREEN,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
});
