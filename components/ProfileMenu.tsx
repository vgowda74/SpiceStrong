/**
 * ProfileMenu.tsx
 * Full-screen left slide-out drawer menu (like Oura app).
 * Profile icon in top-right opens the drawer from the left.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

const ORANGE = '#E85D26';
const BG = '#0F0F0F';
const SURFACE = '#1A1A1A';
const BORDER = 'rgba(255,255,255,0.08)';
const DRAWER_WIDTH = Dimensions.get('window').width * 0.78;
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'PlayfairDisplay_700Bold',
  default: 'serif',
});

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  badge?: boolean;
}

interface MenuSection {
  title?: string;
  items: MenuItem[];
}

export function ProfileMenu() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const openMenu = () => {
    setOpen(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const closeMenu = useCallback((onClosed?: () => void) => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setOpen(false);
      onClosed?.();
    });
  }, [slideAnim, fadeAnim]);

  // ── Handlers ──
  const handleMealPlan = () => closeMenu(() => router.push('/screens/MealPlanScreen'));

  const handleGroceryList = () => closeMenu(() => router.push('/screens/GroceryListScreen'));

  const handleDietary = () => closeMenu(() => router.push('/screens/DietaryRestrictionsScreen'));
  const handleScanGrocery = () => closeMenu(() => router.push('/screens/ScanFridgeScreen'));
  const handleMyPantry = () => closeMenu(() => router.push('/screens/MyPantryScreen'));
  const handleAutoMealPlan = () => closeMenu(() => router.push('/screens/AutoMealPlanScreen'));
  const handleAddRecipe = () => closeMenu(() => router.push({
    pathname: '/screens/AddRecipeScreen',
    params: { proteinId: '', proteinName: '', proteinEmoji: '', fromMenu: 'true' },
  }));
  const handleSpiceBuilder = () => closeMenu(() => router.push({
    pathname: '/screens/AIRecipeBuilderScreen',
    params: {},
  }));
  const handleFitnessProfile = () => closeMenu(() => router.push('/screens/FitnessProfileScreen'));
  const handleScanLabel = () => closeMenu(() => router.push('/screens/ScanLabelScreen'));
  const handleProgressReport = () => closeMenu(() => router.push('/screens/ProgressReportScreen'));
  const handleScanMenu = () => closeMenu(() => router.push('/screens/ScanMenuScreen'));

  // ── Menu sections ──
  const SECTIONS: MenuSection[] = [
    {
      title: 'My Profile',
      items: [
        { icon: 'body-outline', label: 'Fitness Profile', onPress: handleFitnessProfile },
        { icon: 'stats-chart-outline', label: 'Progress Report', onPress: handleProgressReport },
        { icon: 'leaf-outline', label: 'Dietary Restrictions', onPress: handleDietary },
      ],
    },
    {
      title: 'Recipes',
      items: [
        { icon: 'flash-outline', label: 'SpiceBuilder Recipe', onPress: handleSpiceBuilder },
        { icon: 'add-circle-outline', label: 'Add Your Recipe', onPress: handleAddRecipe },
      ],
    },
    {
      title: 'Meal Planning',
      items: [
        { icon: 'sparkles-outline', label: 'Auto Meal Plan', onPress: handleAutoMealPlan },
        { icon: 'calendar-outline', label: 'Meal Calendar', onPress: handleMealPlan },
      ],
    },
    {
      title: 'Smart Tools',
      items: [
        { icon: 'barcode-outline', label: 'Scan Nutrition Label', onPress: handleScanLabel },
        { icon: 'restaurant-outline', label: 'Scan Restaurant Menu', onPress: handleScanMenu },
        { icon: 'basket-outline', label: 'My Pantry Items', onPress: handleMyPantry },
        { icon: 'cart-outline', label: 'My Shopping List', onPress: handleGroceryList },
      ],
    },
  ];

  return (
    <>
      {/* Hamburger menu button (top-left) */}
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={openMenu}
        activeOpacity={0.75}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={styles.hamburger}>
          <Ionicons name="menu" size={28} color="#FFFFFF" />
        </View>
      </TouchableOpacity>

      {/* Drawer modal */}
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => closeMenu()}
        statusBarTranslucent
      >
        {/* Backdrop */}
        <Pressable style={styles.backdrop} onPress={() => closeMenu()}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: fadeAnim }]} />
        </Pressable>

        {/* Drawer */}
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }], paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerLogo}>SpiceStrong</Text>
            <TouchableOpacity onPress={() => closeMenu()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color="rgba(255,255,255,0.50)" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.drawerScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
            {SECTIONS.map((section, sIdx) => (
              <View key={sIdx} style={styles.section}>
                {section.title && (
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                )}
                {section.items.map((item) => (
                  <TouchableOpacity
                    key={item.label}
                    style={styles.menuItem}
                    onPress={item.onPress}
                    activeOpacity={0.65}
                  >
                    <Ionicons name={item.icon} size={22} color="rgba(255,255,255,0.55)" />
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    {item.badge && <View style={styles.badge} />}
                  </TouchableOpacity>
                ))}
                {sIdx < SECTIONS.length - 1 && <View style={styles.sectionDivider} />}
              </View>
            ))}
          </ScrollView>

          {/* Footer */}
          <View style={[styles.drawerFooter, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={styles.footerText}>SpiceStrong v1.0</Text>
          </View>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    zIndex: 100,
  },
  hamburger: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: BG,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 10, height: 0 } },
      android: { elevation: 20 },
    }),
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  drawerLogo: {
    fontSize: 24,
    fontWeight: '800',
    color: ORANGE,
    fontFamily: PLAYFAIR,
  },
  drawerScroll: {
    flex: 1,
  },
  section: {
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.30)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 24,
    gap: 16,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  badge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 24,
    marginTop: 8,
  },
  drawerFooter: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.20)',
  },
});
