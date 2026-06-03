/**
 * GroceryListScreen.tsx — SpiceStrong
 * Premium grocery shopping list.
 * - Items with checkboxes (tap to mark bought)
 * - Grouped by category
 * - Move back to pantry
 * - Share list
 * - Pantry items auto-subtracted
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { getIngredientEmoji } from '../../src/data/ingredientEmojis';
import { checkLimit, recordUsage, type LimitCheck } from '../../services/subscriptionService';
import PaywallModal from '../../components/PaywallModal';
import { PremiumScreen } from '../../components/PremiumScreen';
import { getIngredientInfo } from '../../services/ingredientInfoService';
import { trackEvent } from '../../services/analyticsService';

const ORANGE = '#8F3A1F';
const SURFACE = 'rgba(248,241,232,0.08)';
const BORDER = 'rgba(248,241,232,0.12)';
const GREEN = '#22C55E';
const PLAYFAIR = Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'PlayfairDisplay_700Bold', default: 'serif' });

export default function GroceryListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    trackEvent('grocery_opened', { screen: 'GroceryListScreen' });
  }, []);

  const [items, setItems] = useState<GroceryItem[]>([]);
  const [addName, setAddName] = useState('');
  const [addQty, setAddQty] = useState('');

  // Smart Summary + ingredient info modals
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [infoText, setInfoText] = useState('');
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoItemName, setInfoItemName] = useState('');
  const [editingItemName, setEditingItemName] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallCheck, setPaywallCheck] = useState<LimitCheck | null>(null);

  const handleSmartSummary = async () => {
    if (items.length === 0) return;
    const limitResult = await checkLimit('nutrition_iq');
    if (!limitResult.allowed) { setPaywallCheck(limitResult); setPaywallVisible(true); return; }

    setSummaryVisible(true);
    setSummaryLoading(true);
    setSummaryText('');
    const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
    if (!apiKey) { setSummaryText('AI is not configured.'); setSummaryLoading(false); return; }
    try {
      const toBuy = items.filter((i) => !i.checked).map((i) => `${i.name} (${i.quantity})`).join(', ');
      const done = items.filter((i) => i.checked).map((i) => `${i.name} (${i.quantity})`).join(', ');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{ role: 'user', content: `You are a brutally honest fitness shopping advisor. Analyze this grocery list using the Protein Source Quality framework. Be direct — call out bad choices.

PROTEIN TIER SYSTEM:
- S-Tier (Supreme): chicken breast, turkey, tuna in water, whey isolate, egg whites, tilapia, cod
- A-Tier (Excellent): lean ground beef 93/7, shrimp/prawns, Greek yogurt, white fish, cottage cheese, tofu, tempeh, paneer
- B-Tier (Good): whole eggs, salmon, lean pork, lamb, edamame, lentils
- C-Tier (Average): protein bars, ground beef 80/20, beans, cheese, quinoa
- D-Tier (Low): peanut butter, nuts, sausage, bacon, granola
- F-Tier (Skip): hot dogs, fried chicken, nuggets, processed junk

To buy: ${toBuy || 'nothing'}
Already bought: ${done || 'nothing'}

Give a shopping report card (use emojis):
1. Protein Score — classify each protein item by tier (S/A/B/C/D/F). Are they buying S/A tier sources?
2. Smart Picks — 2-3 best items on their list for fitness goals, with WHY
3. Red Flags — any junk food, processed items, or calorie-inefficient choices? Call them out.
4. Missing — 2-3 specific S/A tier items to add to the list
5. Budget tip — how to get more protein per dollar from their current list

Keep it under 250 words. Be specific to THEIR items.` }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSummaryText(data.content?.[0]?.text || 'Could not generate summary.');
        recordUsage('nutrition_iq');
      } else {
        const errBody = await res.text().catch(() => '');
        console.error('[SpiceStrong] Smart Summary error:', res.status, errBody);
        setSummaryText('Could not generate summary. Please try again.');
      }
    } catch (err) {
      console.error('[SpiceStrong] Smart Summary failed:', err);
      setSummaryText('Could not connect. Check your internet and try again.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleIngredientInfo = async (name: string) => {
    setInfoItemName(name);
    setInfoVisible(true);
    setInfoLoading(true);
    setInfoText('');
    try {
      const text = await getIngredientInfo(name);
      setInfoText(text);
    } catch {
      setInfoText('Could not load info. Please try again.');
    } finally {
      setInfoLoading(false);
    }
  };

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
          text: '💡 Learn About It',
          onPress: () => handleIngredientInfo(item.name),
        },
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

  const openEditItem = (item: GroceryItem) => {
    setEditingItemName(item.name);
    setEditName(item.name);
    setEditQty(item.quantity);
  };

  const saveEditItem = async () => {
    const originalName = editingItemName;
    const nextName = editName.trim();
    if (!originalName || !nextName) return;
    const updated = items.map((item) =>
      item.name.toLowerCase() === originalName.toLowerCase()
        ? { ...item, name: nextName, quantity: editQty.trim() || '1' }
        : item
    );
    await saveGroceryList(updated);
    setItems(updated);
    setEditingItemName(null);
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
    <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Grocery List</Text>
          <Text style={styles.headerSub}>{uncheckedItems.length} to buy · {checkedItems.length} done</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.shareBtn} onPress={() => router.push({ pathname: '/screens/ScanFridgeScreen', params: { mode: 'list' } })} activeOpacity={0.8}>
            <Text style={styles.shareBtnText}>📸 Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
            <Text style={styles.shareBtnText}>📤 Share</Text>
          </TouchableOpacity>
        </View>
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

      {/* Smart Summary button */}
      {items.length > 0 && (
        <TouchableOpacity style={styles.smartSummaryBtn} onPress={handleSmartSummary} activeOpacity={0.8}>
          <Text style={styles.smartSummaryEmoji}>🧠</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.smartSummaryTitle}>Nutrition IQ</Text>
            <Text style={styles.smartSummarySub}>Tap for a health check of your shopping list</Text>
          </View>
          <Text style={styles.smartSummaryArrow}>›</Text>
        </TouchableOpacity>
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
            <Text style={styles.emptyTitle}>Nothing to buy</Text>
            <Text style={styles.emptySub}>Add items below or recipes will auto-populate your list</Text>
          </View>
        )}

        {/* Unchecked items */}
        {uncheckedItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>TO BUY</Text>
            {uncheckedItems.map((item) => (
              <View
                key={item.name}
                style={styles.itemCard}
              >
                <TouchableOpacity style={styles.checkbox} onPress={() => handleToggle(item.name)} activeOpacity={0.7}>
                  <View style={styles.checkboxInner} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.itemIcon} onPress={() => handleIngredientInfo(item.name)} activeOpacity={0.7}>
                  <Text style={styles.itemIconText}>{getIngredientEmoji(item.name)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.itemContent} onPress={() => openEditItem(item)} onLongPress={() => handleTapItem(item)} activeOpacity={0.7}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {item.fromRecipe && <Text style={styles.itemRecipe}>{item.fromRecipe}</Text>}
                  <Text style={styles.itemHint}>Tap text to edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openEditItem(item)} activeOpacity={0.7}>
                  <Text style={styles.itemQty}>{item.quantity}</Text>
                </TouchableOpacity>
              </View>
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
              <View
                key={item.name}
                style={[styles.itemCard, styles.itemCardDone]}
              >
                <TouchableOpacity style={[styles.checkbox, styles.checkboxDone]} onPress={() => handleToggle(item.name)} activeOpacity={0.7}>
                  <Text style={styles.checkboxCheck}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.itemIcon, { opacity: 0.4 }]} onPress={() => handleIngredientInfo(item.name)} activeOpacity={0.7}>
                  <Text style={styles.itemIconText}>{getIngredientEmoji(item.name)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.itemContent} onPress={() => openEditItem(item)} onLongPress={() => handleTapItem(item)} activeOpacity={0.7}>
                  <Text style={[styles.itemName, styles.itemNameDone]}>{item.name}</Text>
                  <Text style={[styles.itemHint, styles.itemQtyDone]}>Tap text to edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openEditItem(item)} activeOpacity={0.7}>
                  <Text style={[styles.itemQty, styles.itemQtyDone]}>{item.quantity}</Text>
                </TouchableOpacity>
              </View>
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

      {/* Smart Summary Modal */}
      <Modal visible={summaryVisible} transparent animationType="slide" onRequestClose={() => setSummaryVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🧠 Nutrition IQ</Text>
              <TouchableOpacity onPress={() => setSummaryVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {summaryLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={GREEN} size="large" />
                <Text style={styles.modalLoadingText}>Analyzing your shopping list...</Text>
              </View>
            ) : (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.modalBody}>{summaryText}</Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Ingredient Info Modal */}
      <Modal visible={infoVisible} transparent animationType="slide" onRequestClose={() => setInfoVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>💡 {infoItemName}</Text>
              <TouchableOpacity onPress={() => setInfoVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {infoLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={GREEN} size="large" />
                <Text style={styles.modalLoadingText}>Looking up {infoItemName}...</Text>
              </View>
            ) : (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.modalBody}>{infoText}</Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Item Modal */}
      <Modal visible={!!editingItemName} transparent animationType="slide" onRequestClose={() => setEditingItemName(null)}>
        <View style={[styles.modalOverlay, styles.editModalOverlay]}>
          <View style={[styles.modalCard, styles.editModalCard]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Grocery Item</Text>
              <TouchableOpacity onPress={() => setEditingItemName(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.editModalBody}>
              <TextInput
                style={styles.editInput}
                value={editName}
                onChangeText={setEditName}
                autoFocus
                placeholder="Item name"
                placeholderTextColor="rgba(255,255,255,0.28)"
              />
              <TextInput
                style={styles.editInput}
                value={editQty}
                onChangeText={setEditQty}
                placeholder="Quantity"
                placeholderTextColor="rgba(255,255,255,0.28)"
              />
              <View style={styles.editActions}>
                <TouchableOpacity style={styles.editCancelBtn} onPress={() => setEditingItemName(null)} activeOpacity={0.8}>
                  <Text style={styles.editCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editSaveBtn} onPress={saveEditItem} activeOpacity={0.8}>
                  <Text style={styles.editSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} limitCheck={paywallCheck} onUpgrade={() => { setPaywallVisible(false); /* TODO: IAP */ }} />
    </PremiumScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
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
  back: { fontSize: 28, lineHeight: 30, color: '#FFFFFF', fontWeight: '900' },
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
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  itemIconText: { fontSize: 28 },
  itemContent: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  itemNameDone: { color: 'rgba(255,255,255,0.35)', textDecorationLine: 'line-through' },
  itemRecipe: { fontSize: 11, color: 'rgba(255,255,255,0.30)', marginTop: 2 },
  itemHint: { fontSize: 10, color: 'rgba(255,255,255,0.26)', marginTop: 2 },
  itemQty: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.50)', marginLeft: 8 },
  itemQtyDone: { color: 'rgba(255,255,255,0.25)' },

  // Bottom action bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(13,11,9,0.92)',
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

  // Smart Summary button
  smartSummaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(34,197,94,0.25)',
    gap: 12,
  },
  smartSummaryEmoji: { fontSize: 28 },
  smartSummaryTitle: { fontSize: 15, fontWeight: '800', color: GREEN },
  smartSummarySub: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  smartSummaryArrow: { fontSize: 24, color: 'rgba(34,197,94,0.50)', fontWeight: '300' },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', fontFamily: PLAYFAIR },
  modalClose: { fontSize: 18, color: 'rgba(255,255,255,0.50)', fontWeight: '600' },
  modalLoading: { alignItems: 'center', paddingVertical: 50, gap: 16 },
  modalLoadingText: { fontSize: 14, color: 'rgba(255,255,255,0.45)' },
  modalScroll: { paddingHorizontal: 20, paddingTop: 16 },
  modalBody: { fontSize: 15, color: 'rgba(255,255,255,0.85)', lineHeight: 24 },
  editModalBody: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24, gap: 12 },
  editModalOverlay: {
    justifyContent: 'flex-start',
    paddingTop: 88,
    paddingHorizontal: 16,
  },
  editModalCard: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    paddingBottom: 0,
    maxHeight: undefined,
  },
  editInput: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#FFFFFF',
    fontSize: 15,
  },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  editCancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  editSaveBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: GREEN,
  },
  editCancelText: { color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: '700' },
  editSaveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
