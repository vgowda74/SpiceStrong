/**
 * ProfileMenu.tsx
 * Full-screen left slide-out drawer menu (like Oura app).
 * Profile icon in top-right opens the drawer from the left.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
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
import PaywallModal from './PaywallModal';
import { type LimitCheck } from '../services/subscriptionService';
import {
  DISPLAY_THEMES,
  getAppDisplayThemeId,
  setAppDisplayThemeId,
  subscribeToDisplayTheme,
  type AppDisplayThemeId,
} from '../src/theme/displayThemes';

const ORANGE = '#8F3A1F';
const BG = '#0D0B09';
const SURFACE = 'rgba(248,241,232,0.08)';
const BORDER = 'rgba(248,241,232,0.12)';
const DRAWER_WIDTH = Dimensions.get('window').width * 0.78;
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'serif',
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
  const [themePickerVisible, setThemePickerVisible] = useState(false);
  const [selectedThemeId, setSelectedThemeId] = useState<AppDisplayThemeId>('warmTan');
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    getAppDisplayThemeId().then((themeId) => {
      if (mounted) setSelectedThemeId(themeId);
    }).catch(() => {});
    const unsubscribe = subscribeToDisplayTheme(setSelectedThemeId);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

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
  const [paywallVisible, setPaywallVisible] = useState(false);
  const handleUpgradePro = () => closeMenu(() => {
    setPaywallVisible(true);
  });
  const handleRestorePurchase = () => closeMenu(async () => {
    try {
      const { restorePurchases } = require('../services/purchaseService');
      const result = await restorePurchases();
      if (result.isPremium) {
        Alert.alert('Restored!', 'Your Premium subscription has been restored.');
      } else {
        Alert.alert('No Subscription Found', 'No active Premium subscription found for this Apple ID.');
      }
    } catch {
      Alert.alert('Error', 'Could not restore purchases.');
    }
  });
  const handleAddRecipe = () => closeMenu(() => router.push({
    pathname: '/screens/AddRecipeScreen',
    params: { proteinId: '', proteinName: '', proteinEmoji: '', fromMenu: 'true' },
  }));
  const handleSpiceBuilder = () => closeMenu(() => router.push({
    pathname: '/screens/AIRecipeBuilderScreen',
    params: {},
  }));
  const handleFitnessProfile = () => closeMenu(() => router.push('/screens/FitnessProfileScreen'));
  const handleBodyScan = () => closeMenu(() => router.push('/screens/BodyScanScreen'));
  const handleScanLabel = () => closeMenu(() => router.push('/screens/ScanLabelScreen'));
  const handleProgressReport = () => closeMenu(() => router.push('/screens/ProgressReportScreen'));
  const handleFoodOrder = () => closeMenu(() => router.push('/screens/FoodOrderScreen'));
  const handleDisplayTheme = () => closeMenu(() => setThemePickerVisible(true));
  const handleSelectTheme = async (themeId: AppDisplayThemeId) => {
    setSelectedThemeId(themeId);
    await setAppDisplayThemeId(themeId);
    setThemePickerVisible(false);
  };

  // ── Menu items (flat list, no section headers) ──
  const SECTIONS: MenuSection[] = [
    {
      items: [
        { icon: 'body-outline',          label: 'Fitness Goals',         onPress: handleFitnessProfile },
        { icon: 'scan-outline',          label: 'AI Body Scan',          onPress: handleBodyScan },
        { icon: 'stats-chart-outline',   label: 'Progress Report',       onPress: handleProgressReport },
        { icon: 'color-palette-outline',  label: 'Display Theme',         onPress: handleDisplayTheme },
        { icon: 'leaf-outline',          label: 'Dietary Preferences',   onPress: handleDietary },
        { icon: 'flash-outline',         label: 'SpiceBuilder',          onPress: handleSpiceBuilder },
        { icon: 'calendar-outline',      label: 'Cal Tracker',           onPress: handleMealPlan },
        { icon: 'sparkles-outline',      label: 'Meal Planner',          onPress: handleAutoMealPlan },
        { icon: 'barcode-outline',       label: 'Scan Label',            onPress: handleScanLabel },
        { icon: 'restaurant-outline',    label: 'Smart Food Order',      onPress: handleFoodOrder },
        { icon: 'add-circle-outline',    label: 'Add Recipe',            onPress: handleAddRecipe },
        { icon: 'basket-outline',        label: 'My Pantry',             onPress: handleMyPantry },
        { icon: 'cart-outline',          label: 'Shopping List',         onPress: handleGroceryList },
        { icon: 'star-outline',          label: 'Upgrade to Pro',        onPress: handleUpgradePro },
        { icon: 'refresh-outline',       label: 'Restore Purchase',      onPress: handleRestorePurchase },
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
      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        limitCheck={{ allowed: false, used: 0, limit: 0, remaining: 0, premium: false, featureLabel: 'Premium Features', freeLabel: 'free plan' } as LimitCheck}
        onUpgrade={() => setPaywallVisible(false)}
      />
      <Modal
        visible={themePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setThemePickerVisible(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.themeBackdrop} onPress={() => setThemePickerVisible(false)}>
          <Pressable style={styles.themeSheet} onPress={() => {}}>
            <View style={styles.themeHeader}>
              <View>
                <Text style={styles.themeTitle}>Display Theme</Text>
                <Text style={styles.themeSubtitle}>Choose your Cal Tracker look</Text>
              </View>
              <TouchableOpacity onPress={() => setThemePickerVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.58)" />
              </TouchableOpacity>
            </View>

            <View style={styles.themeOptions}>
              {DISPLAY_THEMES.map((theme) => {
                const selected = theme.id === selectedThemeId;
                return (
                  <TouchableOpacity
                    key={theme.id}
                    style={[styles.themeOption, selected && styles.themeOptionSelected]}
                    onPress={() => handleSelectTheme(theme.id)}
                    activeOpacity={0.82}
                  >
                    <View style={[styles.themeSwatch, { backgroundColor: theme.background, borderColor: theme.panelBorder }]}>
                      <View style={[styles.themeSwatchPanel, { backgroundColor: theme.panelBg }]} />
                      <View style={[styles.themeSwatchLine, { backgroundColor: theme.accent }]} />
                    </View>
                    <View style={styles.themeOptionTextWrap}>
                      <Text style={styles.themeOptionName}>{theme.name}</Text>
                      <Text style={styles.themeOptionDescription}>{theme.description}</Text>
                    </View>
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={selected ? '#E8A87C' : 'rgba(255,255,255,0.28)'}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginVertical: 2,
    borderRadius: 8,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.08)',
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
  themeBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.64)',
    justifyContent: 'flex-end',
  },
  themeSheet: {
    backgroundColor: '#14100C',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
  },
  themeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  themeTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#FFFFFF',
    fontFamily: PLAYFAIR,
  },
  themeSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.42)',
  },
  themeOptions: {
    gap: 10,
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(248,241,232,0.10)',
    backgroundColor: 'rgba(248,241,232,0.06)',
    padding: 12,
  },
  themeOptionSelected: {
    borderColor: 'rgba(232,168,124,0.60)',
    backgroundColor: 'rgba(143,58,31,0.18)',
  },
  themeSwatch: {
    width: 52,
    height: 52,
    borderRadius: 15,
    borderWidth: 1,
    padding: 7,
    justifyContent: 'space-between',
  },
  themeSwatchPanel: {
    height: 23,
    borderRadius: 8,
  },
  themeSwatchLine: {
    height: 5,
    width: '70%',
    borderRadius: 999,
  },
  themeOptionTextWrap: {
    flex: 1,
  },
  themeOptionName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  themeOptionDescription: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.42)',
    lineHeight: 15,
  },
});
