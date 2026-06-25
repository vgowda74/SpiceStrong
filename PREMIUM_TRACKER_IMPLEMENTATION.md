# Premium Daily Cal Tracker — Implementation Guide

This guide walks you through integrating the premium design components into your existing **MealPlanScreen.tsx**.

---

## 📦 What's New

### Files Created:
1. **`components/MacroProgressBar.tsx`** — Horizontal progress bars with animated fills
2. **`components/DailySummaryCard.tsx`** — Glassmorphism summary card with macro grid
3. **`styles/premiumTheme.ts`** — Centralized color palette & design tokens
4. **This file** — Integration instructions

---

## 🚀 Quick Start (10 minutes)

### Step 1: Install Dependencies (if not already installed)

```bash
npm install react-native-reanimated react-native-gesture-handler expo-haptics
# OR
yarn add react-native-reanimated react-native-gesture-handler expo-haptics
```

> **Note:** `react-native-reanimated` needs to be configured. See [Reanimated Setup](#reanimated-setup) below.

### Step 2: Import New Components in MealPlanScreen.tsx

```tsx
import MacroProgressBar from '../../components/MacroProgressBar';
import DailySummaryCard from '../../components/DailySummaryCard';
import { COLORS, SHADOWS, RADIUS, TYPOGRAPHY } from '../../styles/premiumTheme';
```

### Step 3: Replace Macro Ring Section

**BEFORE** (lines ~1520):
```tsx
{/* Macro progress rings */}
<View style={styles.ringsPanel}>
  <View style={styles.ringsRow}>
    <MacroRing label="Calories" color="#F5A524" ... />
    <MacroRing label="Protein" color="#E8671A" ... />
    {/* ... more rings */}
  </View>
</View>
```

**AFTER**:
```tsx
{/* Premium Daily Summary */}
<DailySummaryCard
  consumed={{
    calories: totals.calories,
    proteinG: totals.proteinG,
    carbsG: totals.carbsG,
    fatG: totals.fatG,
  }}
  targets={{
    calories: macroTargets?.calories ?? 2000,
    proteinG: macroTargets?.proteinG ?? 120,
    carbsG: macroTargets?.carbsG ?? 150,
    fatG: macroTargets?.fatG ?? 80,
  }}
/>

{/* Alternative: Compact horizontal progress bars */}
<View style={styles.macroBarContainer}>
  <MacroProgressBar
    label="Calories"
    target={macroTargets?.calories ?? 2000}
    consumed={totals.calories}
    unit=""
    color="#F5A524"
    colorMid="#F59E0B"
    colorFull="#EF4444"
  />
  <MacroProgressBar
    label="Protein"
    target={macroTargets?.proteinG ?? 120}
    consumed={totals.proteinG}
    unit="g"
    color="#EC4899"
    colorMid="#E11D48"
    colorFull="#EF4444"
  />
  <MacroProgressBar
    label="Carbs"
    target={macroTargets?.carbsG ?? 150}
    consumed={totals.carbsG}
    unit="g"
    color="#3B82F6"
    colorMid="#2563EB"
    colorFull="#F59E0B"
  />
  <MacroProgressBar
    label="Fat"
    target={macroTargets?.fatG ?? 80}
    consumed={totals.fatG}
    unit="g"
    color="#10B981"
    colorMid="#059669"
    colorFull="#EF4444"
  />
</View>
```

### Step 4: Update Styles

Add these styles to your `styles` object in MealPlanScreen.tsx:

```typescript
const styles = StyleSheet.create({
  // ... existing styles ...
  
  // Premium macro section
  macroBarContainer: {
    padding: 16,
    marginBottom: 16,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.md,
  },
  
  // Glassmorphic summary card (if using DailySummaryCard)
  summaryCardContainer: {
    marginBottom: 20,
  },
});
```

---

## 🎨 Design Decisions Explained

### Why These Changes?

| Component | Before | After | Why? |
|-----------|--------|-------|------|
| **Macro Display** | 4 large rings | Summary card + progress bars | Faster to scan, more context (remaining macros) |
| **Colors** | Generic bright | Gradient (green→yellow→red) | Visual feedback: green = safe, red = over |
| **Shadows** | Flat `rgba` | Elevation system | Premium depth, visual hierarchy |
| **Cards** | Solid colors | Glassmorphism | Modern, premium feel (iOS 15+ style) |

---

## 🔧 Customization Guide

### Change Color Palette

Edit `styles/premiumTheme.ts`:

```typescript
export const COLORS = {
  // Change these for your brand
  accent: '#E8A87C',      // Primary brand color
  accentDark: '#8F3A1F',  // Darker variant
  calories: '#F5A524',    // Macro colors
  protein: '#EC4899',
  carbs: '#3B82F6',
  fat: '#10B981',
};
```

### Adjust Progress Bar Colors

In MealPlanScreen.tsx, change the color props:

```tsx
<MacroProgressBar
  color="#FF6B6B"       // Green
  colorMid="#FFA500"    // Transitions through orange
  colorFull="#FF4444"   // Ends at red
/>
```

### Toggle Between Cards & Rings

**Use DailySummaryCard for:**
- Premium look, more information
- Smaller screens (portrait)
- Focused nutrition tracking

**Use MacroProgressBar for:**
- Minimal design
- Quick scanning
- More meal cards visible

---

## 🎬 Animation Setup (Optional)

To enable smooth animations on macro updates, you need react-native-reanimated:

### Reanimated Setup

1. **Install:**
   ```bash
   npm install react-native-reanimated
   ```

2. **Add to `babel.config.js`:**
   ```javascript
   module.exports = function (api) {
     api.cache(true);
     return {
       presets: ['babel-preset-expo'],
       plugins: [
         'react-native-reanimated/plugin', // Add this line
       ],
     };
   };
   ```

3. **Restart Expo:**
   ```bash
   expo start -c
   ```

If you skip this, progress bars still work — just without smooth animations. They'll update instantly instead.

---

## 📝 Integration Checklist

- [ ] Install `react-native-reanimated` (or skip animations)
- [ ] Copy `components/MacroProgressBar.tsx` to your project
- [ ] Copy `components/DailySummaryCard.tsx` to your project
- [ ] Copy `styles/premiumTheme.ts` to your project
- [ ] Import components in `MealPlanScreen.tsx`
- [ ] Replace macro ring section with new components
- [ ] Test on iOS and Android
- [ ] Adjust colors to match your brand
- [ ] Commit changes

---

## 🧪 Testing

### Test Cases:

1. **No meals logged** — Summary should show 0/target
2. **Partial progress** — Bars should fill 0-100% smoothly
3. **Over target** — Bar should turn red, show "over" status
4. **Daily summary** — Should display all 4 macros with correct percentages

### Test on Devices:

```bash
# iOS
expo run:ios

# Android
expo run:android
```

---

## 🚨 Common Issues

### Issue: Animations not working
**Solution:** Make sure `react-native-reanimated` is installed and babel.config.js is configured (see step 2 of Reanimated Setup).

### Issue: Colors look different on Android vs iOS
**Solution:** Use consistent RGB values, not HSL. Example:
```tsx
// ✅ Good
backgroundColor: '#E8A87C'
backgroundColor: 'rgba(232, 168, 124, 0.8)'

// ❌ Avoid
backgroundColor: 'hsl(20, 75%, 70%)'
```

### Issue: Progress bars jumping around
**Solution:** Ensure `totals` are being calculated correctly in your component. Add debug logging:
```tsx
console.log('Macro totals:', totals);
console.log('Targets:', macroTargets);
```

---

## 📖 API Reference

### MacroProgressBar Props

```typescript
interface MacroProgressBarProps {
  label: string;           // "Calories", "Protein", etc.
  target: number;          // 2000 (for calories), 120 (for protein)
  consumed: number;        // 1500 (what user has logged)
  unit: string;            // "" for calories, "g" for macros
  color: string;           // Green color code
  colorMid?: string;       // Yellow (optional)
  colorFull?: string;      // Red (optional)
  height?: number;         // Bar height in pixels (default 8)
  showPercentage?: boolean; // Show % complete (default true)
  showRemaining?: boolean;  // Show remaining amount (default true)
}
```

### DailySummaryCard Props

```typescript
interface DailySummaryCardProps {
  consumed: MacroSummary;  // { calories, proteinG, carbsG, fatG }
  targets: MacroTarget;    // Same structure
  onEdit?: () => void;     // Optional callback for edit button
}
```

---

## 🎨 Advanced: Custom Themes

Create multiple themes by creating new files:

```typescript
// styles/darkTheme.ts
export const DARK_COLORS = {
  background: '#000000',
  surfaceLight: '#111111',
  // ... etc
};

// styles/lightTheme.ts
export const LIGHT_COLORS = {
  background: '#FFFFFF',
  surfaceLight: '#F5F5F5',
  // ... etc
};
```

Then toggle in your component:

```tsx
const isDarkMode = useColorScheme() === 'dark';
const colors = isDarkMode ? DARK_COLORS : LIGHT_COLORS;
```

---

## 📞 Support

If you hit issues:

1. Check the **Common Issues** section above
2. Review component prop types (API Reference)
3. Verify all imports are correct
4. Check `babel.config.js` for Reanimated setup
5. Clear cache: `expo start -c`

---

## 🚀 Next Steps

After implementing:

1. **Test thoroughly** on your devices
2. **Gather feedback** from users
3. **Iterate** on colors/layout based on feedback
4. **Add animations** (swipe, long-press, etc.)
5. **Consider** dark/light mode support
6. **Optimize** performance on older devices

---

## File Structure

After implementation, your structure should look like:

```
SpiceStrong/
├── components/
│   ├── MacroProgressBar.tsx      ← NEW
│   ├── DailySummaryCard.tsx      ← NEW
│   ├── RecipeCard.tsx
│   └── ...
├── styles/
│   └── premiumTheme.ts           ← NEW
├── app/screens/
│   ├── MealPlanScreen.tsx        ← UPDATED
│   └── ...
└── ...
```

---

Happy designing! 🎨✨
