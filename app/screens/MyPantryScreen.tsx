/**
 * MyPantryScreen.tsx — SpiceStrong
 * Premium pantry inventory management.
 * - Items grouped by category with counts
 * - Editable quantities inline
 * - Swipe/tap: Move to Grocery / Edit / Delete
 * - Quick add with category picker
 * - Scan My Grocery CTA
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { getIngredientEmoji } from '../../src/data/ingredientEmojis';
import { checkLimit, recordUsage, type LimitCheck } from '../../services/subscriptionService';
import PaywallModal from '../../components/PaywallModal';
import { PremiumScreen } from '../../components/PremiumScreen';
import { getIngredientInfo } from '../../services/ingredientInfoService';
import { trackEvent } from '../../services/analyticsService';
import { getDietPreference, isNonVegIngredientName, type DietPreference } from '../../src/utils/dietPreference';

const ORANGE = '#8F3A1F';
const SURFACE = 'rgba(248,241,232,0.08)';
const BORDER = 'rgba(248,241,232,0.12)';
const GREEN = '#22C55E';
const PLAYFAIR = Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'PlayfairDisplay_700Bold', default: 'serif' });

type Category = PantryItem['category'];
const CATEGORY_ORDER: Category[] = ['PROTEIN', 'VEGETABLE', 'FRUIT', 'DAIRY', 'GRAIN', 'CONDIMENT', 'SPICE', 'PANTRY'];
const CATEGORY_CONFIG: Record<Category, { label: string; emoji: string; color: string }> = {
  PROTEIN: { label: 'Proteins', emoji: '💪', color: '#8F3A1F' },
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

  useEffect(() => {
    trackEvent('pantry_opened', { screen: 'MyPantryScreen' });
  }, []);

  const [dietPref, setDietPref] = useState<DietPreference | null>(null);
  useEffect(() => { getDietPreference().then(setDietPref); }, []);

  // Hard block: veg users cannot add non-vegetarian items. Returns true if blocked.
  const blockIfNonVeg = (name: string): boolean => {
    if (dietPref === 'veg' && isNonVegIngredientName(name)) {
      Alert.alert(
        '🟢 Vegetarian Mode',
        `"${name}" looks non-vegetarian, so it can't be added while your diet preference is set to Vegetarian.\n\nYou can change this in your profile.`,
        [{ text: 'OK' }],
      );
      return true;
    }
    return false;
  };

  const [items, setItems] = useState<PantryItem[]>([]);
  const [addName, setAddName] = useState('');
  const [addQty, setAddQty] = useState('');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const isSelecting = selectedItems.size > 0;

  // Nutrition IQ summary + ingredient info modals
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [infoText, setInfoText] = useState('');
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoItemName, setInfoItemName] = useState('');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallCheck, setPaywallCheck] = useState<LimitCheck | null>(null);

  const handleNutritionIQ = async () => {
    if (items.length === 0) return;
    // Freemium limit check
    const limitResult = await checkLimit('nutrition_iq');
    if (!limitResult.allowed) { setPaywallCheck(limitResult); setPaywallVisible(true); return; }

    setSummaryVisible(true);
    setSummaryLoading(true);
    setSummaryText('');
    const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
    if (!apiKey) { setSummaryText('AI is not configured.'); setSummaryLoading(false); return; }
    try {
      const itemList = items.map((i) => `${i.name} (${i.quantity})`).join(', ');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{ role: 'user', content: `You are a brutally honest fitness nutritionist. Analyze this pantry using the Protein Source Quality framework. Be encouraging but direct — don't sugarcoat.

PROTEIN TIER SYSTEM:
- S-Tier (Supreme): chicken breast, turkey, tuna in water, whey isolate, egg whites, tilapia, cod
- A-Tier (Excellent): lean ground beef 93/7, shrimp/prawns, Greek yogurt, white fish, cottage cheese, tofu, tempeh, paneer
- B-Tier (Good): whole eggs, salmon, lean pork, lamb, edamame, lentils
- C-Tier (Average): protein bars, ground beef 80/20, beans, cheese, quinoa
- D-Tier (Low): peanut butter, nuts, sausage, bacon, granola
- F-Tier (Skip): hot dogs, fried chicken, nuggets, processed junk

Pantry items: ${itemList}

Give a report card (use emojis):
1. Protein Shelf Score (S/A/B/C/D) — classify their protein sources by tier. List each protein item with its tier.
2. Wholesome Score (A-F) — ratio of whole foods vs processed. Call out any junk food directly.
3. 75% Rule Check — is 75% of their protein from S/A/B tier sources? (Recommended for muscle synthesis)
4. Missing essentials — 2-3 specific S/A tier items to add
5. Quick win — one high-protein meal they can make RIGHT NOW with what they have

Keep it under 250 words. Be specific to THEIR items.` }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSummaryText(data.content?.[0]?.text || 'Could not generate summary.');
        recordUsage('nutrition_iq');
      } else {
        const errBody = await res.text().catch(() => '');
        console.error('[SpiceStrong] Nutrition IQ error:', res.status, errBody);
        setSummaryText('Could not generate summary. Please try again.');
      }
    } catch (err) {
      console.error('[SpiceStrong] Nutrition IQ failed:', err);
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
    setItems(await getPantryItems());
  }, []);

  useFocusEffect(useCallback(() => { loadItems(); }, [loadItems]));

  const handleTapItem = (item: PantryItem) => {
    Alert.alert(
      item.name,
      `Quantity: ${item.quantity}${item.state && item.state !== 'raw' ? ` · ${item.state}` : ''}`,
      [
        {
          text: '💡 Learn About It',
          onPress: () => handleIngredientInfo(item.name),
        },
        {
          text: '🛒 Move to Grocery',
          onPress: async () => {
            await addToGroceryList({ name: item.name, quantity: item.quantity });
            await removePantryItem(item.name);
            loadItems();
          },
        },
        {
          text: 'Edit Item',
          onPress: () => openEditItem(item),
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

  const openEditItem = (item: PantryItem) => {
    setEditingItem(item.name);
    setEditName(item.name);
    setEditQty(item.quantity);
  };

  const saveEditItem = async () => {
    const originalName = editingItem;
    const nextName = editName.trim().toLowerCase();
    if (!originalName || !nextName) return;
    const updated = items.map((i) =>
      i.name === originalName
        ? { ...i, name: nextName, quantity: editQty.trim() || 'some', category: detectCategory(nextName) }
        : i
    );
    await savePantryItems(updated);
    setItems(updated);
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.delete(originalName)) next.add(nextName);
      return next;
    });
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
    if (blockIfNonVeg(name)) return;
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
    <PremiumScreen style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>My Pantry</Text>
          <Text style={styles.headerSub}>{totalCount} item{totalCount !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => router.push({ pathname: '/screens/ScanFridgeScreen', params: { mode: 'receipt' } })}
          activeOpacity={0.8}
        >
          <Text style={styles.scanBtnText}>🧾 Scan Receipt</Text>
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

      {/* Action bar — always visible when items selected */}
      {selectedItems.size > 0 && (
        <View style={styles.selectionBar}>
          <TouchableOpacity style={styles.selectionAction} onPress={handleMoveSelectedToGrocery} activeOpacity={0.75}>
            <Text style={styles.selectionActionText}>🛒 Move to Grocery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.selectionAction, styles.selectionActionDanger]} onPress={handleDeleteSelected} activeOpacity={0.75}>
            <Text style={styles.selectionActionDangerText}>🗑 Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Nutrition IQ button */}
      {items.length > 0 && (
        <TouchableOpacity style={styles.nutritionIQBtn} onPress={handleNutritionIQ} activeOpacity={0.8}>
          <Text style={styles.nutritionIQEmoji}>🧠</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.nutritionIQTitle}>Nutrition IQ</Text>
            <Text style={styles.nutritionIQSub}>Tap for a health report of your pantry</Text>
          </View>
          <Text style={styles.nutritionIQArrow}>›</Text>
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
            <Text style={styles.emptyTitle}>Pantry is empty</Text>
            <Text style={styles.emptySub}>Scan a grocery receipt or add items manually</Text>
            <TouchableOpacity
              style={styles.emptyScanBtn}
              onPress={() => router.push({ pathname: '/screens/ScanFridgeScreen', params: { mode: 'receipt' } })}
              activeOpacity={0.8}
            >
              <LinearGradient colors={['#A94724', '#742B17']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyScanGradient}>
                <Text style={styles.emptyScanText}>🧾 Scan Receipt</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Grouped items */}
        {Object.entries(grouped).map(([cat, catItems]) => {
          const config = CATEGORY_CONFIG[cat as Category];
          const allSelected = catItems.every((i) => selectedItems.has(i.name));
          const toggleAll = () => {
            setSelectedItems((prev) => {
              const next = new Set(prev);
              if (allSelected) {
                catItems.forEach((i) => next.delete(i.name));
              } else {
                catItems.forEach((i) => next.add(i.name));
              }
              return next;
            });
          };
          return (
            <View key={cat} style={styles.catSection}>
              <TouchableOpacity style={styles.catHeader} onPress={toggleAll} activeOpacity={0.7}>
                <View style={[styles.selectBox, { width: 18, height: 18, borderRadius: 4, marginRight: 6 }, allSelected && styles.selectBoxOn]}>
                  {allSelected && <Text style={[styles.selectCheck, { fontSize: 10 }]}>✓</Text>}
                </View>
                <View style={[styles.catDot, { backgroundColor: config.color }]} />
                <Text style={styles.catEmoji}>{config.emoji}</Text>
                <Text style={styles.catLabel}>{config.label}</Text>
                <View style={[styles.catBadge, { backgroundColor: config.color + '20' }]}>
                  <Text style={[styles.catBadgeText, { color: config.color }]}>{catItems.length}</Text>
                </View>
              </TouchableOpacity>
              {catItems.map((item) => {
                const isSelected = selectedItems.has(item.name);
                return (
                <View
                  key={item.name}
                  style={[styles.itemCard, isSelected && styles.itemCardSelected]}
                >
                  <TouchableOpacity style={[styles.selectBox, isSelected && styles.selectBoxOn]} onPress={() => toggleSelect(item.name)} activeOpacity={0.7}>
                    {isSelected && <Text style={styles.selectCheck}>✓</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.itemIcon} onPress={() => handleIngredientInfo(item.name)} activeOpacity={0.7}>
                    <Text style={styles.itemIconText}>{getIngredientEmoji(item.name, cat)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.itemLeft} onPress={() => openEditItem(item)} onLongPress={() => handleTapItem(item)} activeOpacity={0.7}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.state && item.state !== 'raw' && (
                      <View style={styles.itemStateBadge}>
                        <Text style={styles.itemStateText}>{item.state}</Text>
                      </View>
                    )}
                    <Text style={styles.itemHint}>Tap text to edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openEditItem(item)} activeOpacity={0.7}>
                    <Text style={styles.itemQty}>{item.quantity}</Text>
                  </TouchableOpacity>
                </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      {/* Nutrition IQ Summary Modal */}
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
                <ActivityIndicator color={ORANGE} size="large" />
                <Text style={styles.modalLoadingText}>Analyzing your pantry...</Text>
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
                <ActivityIndicator color={ORANGE} size="large" />
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
      <Modal visible={!!editingItem} transparent animationType="slide" onRequestClose={() => setEditingItem(null)}>
        <View style={[styles.modalOverlay, styles.editModalOverlay]}>
          <View style={[styles.modalCard, styles.editModalCard]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Pantry Item</Text>
              <TouchableOpacity onPress={() => setEditingItem(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
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
                <TouchableOpacity style={styles.editCancelBtn} onPress={() => setEditingItem(null)} activeOpacity={0.8}>
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
  scanBtn: {
    backgroundColor: 'rgba(143,58,31,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.35)',
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
    backgroundColor: 'rgba(143,58,31,0.10)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(143,58,31,0.20)',
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

  // Item cards — ingredient checklist style
  itemCardSelected: {
    borderColor: ORANGE,
    backgroundColor: 'rgba(143,58,31,0.08)',
  },
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
  itemLeft: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  itemHint: { fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 2 },
  itemStateBadge: {
    backgroundColor: 'rgba(143,58,31,0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  itemStateText: { fontSize: 10, fontWeight: '700', color: ORANGE, textTransform: 'uppercase' },
  itemQty: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.50)', marginLeft: 8 },

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
    backgroundColor: 'rgba(13,11,9,0.92)',
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

  // Nutrition IQ button
  nutritionIQBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: 'rgba(143,58,31,0.10)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(143,58,31,0.25)',
    gap: 12,
  },
  nutritionIQEmoji: { fontSize: 28 },
  nutritionIQTitle: { fontSize: 15, fontWeight: '800', color: ORANGE },
  nutritionIQSub: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  nutritionIQArrow: { fontSize: 24, color: 'rgba(143,58,31,0.50)', fontWeight: '300' },

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
    backgroundColor: ORANGE,
  },
  editCancelText: { color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: '700' },
  editSaveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
