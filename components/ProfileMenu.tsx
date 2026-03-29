/**
 * ProfileMenu.tsx
 * Top-right profile icon that opens a slide-down menu with:
 *   - Meal Plan
 *   - Grocery List (share sheet)
 *   - Dietary Restrictions
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';

const ORANGE = '#E85D26';
const SURFACE = '#1C1C1E';
const BORDER = 'rgba(255,255,255,0.10)';
const GLOBAL_CART_KEY = 'globalShoppingList';

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
}

export function ProfileMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-12)).current;

  const openMenu = () => {
    setOpen(true);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
  };

  const closeMenu = useCallback((onClosed?: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -12, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setOpen(false);
      onClosed?.();
    });
  }, [fadeAnim, slideAnim]);

  const handleMealPlan = () => {
    closeMenu(() => router.push('/screens/MealPlanScreen'));
  };

  const handleGroceryList = () => {
    closeMenu(async () => {
      try {
        const stored = await AsyncStorage.getItem(GLOBAL_CART_KEY);
        const cartItems: Record<string, string> = stored ? JSON.parse(stored) : {};
        const keys = Object.keys(cartItems);
        if (keys.length === 0) {
          await Share.share({ message: 'Your SpiceStrong grocery list is empty. Add ingredients from any recipe!' });
          return;
        }
        const grouped: Record<string, string[]> = {};
        keys.forEach((key) => {
          const recipeName = cartItems[key];
          if (!grouped[recipeName]) grouped[recipeName] = [];
          const [name, qty] = key.split('|||');
          grouped[recipeName].push(`  • ${qty} ${name}`);
        });
        const sections = Object.entries(grouped)
          .map(([recipeName, items]) => `📌 ${recipeName}\n${items.join('\n')}`)
          .join('\n\n');
        await Share.share({ message: `🛒 Shopping List\n\n${sections}\n\nCooked with SpiceStrong 💪` });
      } catch {}
    });
  };

  const handleDietary = () => {
    closeMenu(() => router.push('/screens/DietaryRestrictionsScreen'));
  };

  const handleScanFridge = () => {
    closeMenu(() => router.push('/screens/ScanFridgeScreen'));
  };

  const MENU_ITEMS: MenuItem[] = [
    { icon: 'scan-outline', label: 'Scan My Fridge', onPress: handleScanFridge },
    { icon: 'calendar-outline', label: 'Meal Plan', onPress: handleMealPlan },
    { icon: 'cart-outline', label: 'Grocery List', onPress: handleGroceryList },
    { icon: 'leaf-outline', label: 'Dietary Restrictions', onPress: handleDietary },
  ];

  return (
    <>
      {/* Profile icon button */}
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={openMenu}
        activeOpacity={0.75}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={styles.avatar}>
          <Ionicons name="person" size={18} color="#FFFFFF" />
        </View>
      </TouchableOpacity>

      {/* Dropdown menu */}
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => closeMenu()}
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={() => closeMenu()}>
          <Animated.View
            style={[
              styles.menu,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {MENU_ITEMS.map((item, idx) => (
              <React.Fragment key={item.label}>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <Ionicons name={item.icon} size={20} color={item.color ?? ORANGE} />
                  <Text style={[styles.menuLabel, item.color ? { color: item.color } : {}]}>
                    {item.label}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.30)" />
                </TouchableOpacity>
                {idx < MENU_ITEMS.length - 1 && <View style={styles.menuDivider} />}
              </React.Fragment>
            ))}
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 36,
    right: 20,
    zIndex: 100,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(232,93,38,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'flex-end',
  },
  menu: {
    marginTop: Platform.OS === 'ios' ? 100 : 80,
    marginRight: 16,
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    minWidth: 220,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  menuDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 16,
  },
});
