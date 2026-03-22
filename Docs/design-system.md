# SpiceStrong Design System

Complete visual specification covering color tokens, typography, spacing, shadows, gradients, reusable components, navigation structure, animations, and established patterns.

---

## Table of Contents

1. [Color Tokens](#1-color-tokens)
2. [Typography](#2-typography)
3. [Spacing & Layout](#3-spacing--layout)
4. [Border Radius](#4-border-radius)
5. [Shadows & Elevation](#5-shadows--elevation)
6. [Gradients](#6-gradients)
7. [Navigation Structure](#7-navigation-structure)
8. [Reusable Components](#8-reusable-components)
9. [Screen-Level Patterns](#9-screen-level-patterns)
10. [Animations](#10-animations)
11. [Modal & Bottom Sheet Patterns](#11-modal--bottom-sheet-patterns)
12. [Icons & Emoji](#12-icons--emoji)
13. [Conventions & Rules](#13-conventions--rules)
14. [Theme Files Reference](#14-theme-files-reference)

---

## 1. Color Tokens

### Primary Brand

| Token | Hex | rgba | Usage |
|-------|-----|------|-------|
| **Accent Orange** | `#E85D26` | — | Primary CTA, highlights, active states, brand identity |
| **Accent Light** | `#FF7A45` | — | Lighter accent variant |
| **Cream** | `#F5ECD7` | — | Logo "Strong" text, light accent |
| **CTA Gradient Start** | `#F07030` | — | Button gradient left/top |
| **CTA Gradient End** | `#C84A10` | — | Button gradient right/bottom |

### Dark Warm Tones (Core Theme)

| Token | Hex | Usage |
|-------|-----|-------|
| **Background** | `#0F0F0F` | App background (near-black) |
| **Surface** | `#1A1A1A` | Card surfaces, elevated backgrounds |
| **Surface Light** | `#252525` | Slightly lighter surface |
| **Header Brown** | `#2A1005` | Screen headers, timer display |
| **Search Brown** | `#3D1A0A` | Search fields, image placeholders |
| **Card Dark** | `#1A0A00` | Modal backgrounds, deep cards |
| **Hero Brown** | `#8B4513` | Default hero gradient start |
| **Deep Brown** | `#5D2E0C` | Default hero gradient end |
| **Modal BG** | `#1A1008` | Community reviews modal background |
| **Modal Dark** | `#2A1810` | Filter/ingredient modal background |
| **Sheet Dark** | `#1E1E1E` | Bottom sheet background |

### Light Surfaces

| Token | Hex | Usage |
|-------|-----|-------|
| **Page Background** | `#FAF7F2` | Body/page backgrounds (light mode) |
| **Surface Warm** | `#FDF8F3` | Tip cards, warm surfaces |
| **Info Card** | `rgba(255,255,255,0.95)` | Recipe overview info card |
| **Tip Card** | `#FFF8ED` | Chef's tip background |
| **Emoji Circle** | `#FFF3E0` | Protein card emoji background |
| **Stat Badge** | `#FFF3ED` | Recipe overview stat badges |

### Text Colors

| Token | Value | Usage |
|-------|-------|-------|
| **Primary** | `#FFFFFF` | Main text on dark backgrounds |
| **Primary (light)** | `#11181C` | Main text on light backgrounds |
| **Secondary** | `#999999` | Muted/secondary text |
| **Tertiary** | `rgba(255,255,255,0.45)` | Section headers, labels |
| **Disabled** | `rgba(255,255,255,0.35)` | Checked-off ingredient names |
| **Placeholder** | `#9CA3AF` | Input placeholders, greeting text |
| **Dark Brown Text** | `#2D1A0E` | Chef tip header on light cards |
| **Dark Brown Body** | `#3D2A1A` | Chef tip body on light cards |
| **Stat Brown** | `#8B4513` | Stat badge text |
| **Link Blue** | `#0a7ea4` | Hyperlinks (ThemedText link type) |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| **Success** | `#4CAF50` | Cart button, add-to-cart, success states |
| **Success Dark** | `#388E3C` | Cart button active/pressed |
| **Danger** | `#FF6B6B` | Delete button, clear cart |
| **Warning Orange** | `#FFB347` | Badge backgrounds, building state |
| **Star Gold** | `#FFD700` | Rating stars (selected) |
| **Star Grey** | `#888888` | Rating stars (unselected) |

### Rating Star Scale

| Stars | Hex | Color |
|-------|-----|-------|
| 5★ | `#4CAF50` | Green |
| 4★ | `#8BC34A` | Light Green |
| 3★ | `#FFC107` | Yellow |
| 2★ | `#FF9800` | Orange |
| 1★ | `#F44336` | Red |

### Glass & Transparency Tokens

| Token | Value | Usage |
|-------|-------|-------|
| **Glass** | `rgba(255,255,255,0.1)` | Glass cards, chips, preview cards |
| **Glass Active** | `rgba(255,255,255,0.12)` | Hovered/focused glass |
| **Glass Strong** | `rgba(255,255,255,0.15)` | Back buttons, stat cards |
| **Border Light** | `rgba(255,255,255,0.2)` | Card borders, dividers |
| **Border Subtle** | `rgba(255,255,255,0.08)` | Separator lines, bottom borders |
| **Border Orange** | `rgba(232,93,38,0.35)` | Modal accent borders, checked cards |
| **Overlay Light** | `rgba(0,0,0,0.15)` | Splash image overlay |
| **Overlay Medium** | `rgba(0,0,0,0.35)` | Header overlays |
| **Overlay Dark** | `rgba(0,0,0,0.55)` | Timer complete overlay |
| **Overlay Modal** | `rgba(0,0,0,0.6)` | Modal backdrops |
| **Header Orange** | `rgba(180,60,10,0.75)` | RecipeList header tint |

### Special Contexts

| Context | Colors | Usage |
|---------|--------|-------|
| **Cooking Mode** | `#1B4A2E`, `#2D5A3D` | Forest green cards in active cooking |
| **Share Card** | `#7B1A1A` (banner), `#9B2C2C` (step badges) | Deep red for shareable recipe cards |
| **Share Card Cream** | `rgba(245,230,200,0.92)` | Ingredient/step list background |
| **Share Card Brown** | `#3D1A0A` | Ingredient text |

---

## 2. Typography

### Font Families

| Font | Platform | Usage |
|------|----------|-------|
| `PlayfairDisplay_700Bold` | iOS & Android | Logo, completion title, cooking start title |
| `Georgia` (italic) | iOS | ShareableRecipeCard title, decorative headings |
| `serif` | Android fallback | Same as Georgia |
| `system-ui` | iOS body | All UI text |
| `ui-serif` / `ui-rounded` / `ui-monospace` | iOS special | Serif, rounded, mono text |
| System default | Android body | All UI text |

### Type Scale

| Size | Weight | Usage | Example |
|------|--------|-------|---------|
| **58px** | 700 (Playfair) | App logo | "Spice" / "Strong" |
| **48px** | 800 | Big rating number | "4.5" in reviews modal |
| **40px** | — | Rating stars (cooking complete) | ⭐⭐⭐⭐⭐ |
| **34px** | bold | Completion title | "Recipe Complete!" |
| **32px** | 800, bold | Screen titles, timer text | "Pepper Chicken", "05:30" |
| **30px** | bold | Step title (cooking mode) | "Sauté Aromatics" |
| **24px** | 800 | Stat card values | "35 min" |
| **22px** | 800 | Section headings, modal title | "Community Ratings" |
| **20px** | 700-800, bold | Recipe name, subtitles | Recipe card title |
| **18px** | 700-800 | Button text, section headers | "Get Started", "Start Cooking" |
| **17px** | 400-600 | Step description, body large | Cooking instructions |
| **16px** | 400-700 | Body default, labels, inputs | Ingredient names, search input |
| **15px** | 600-700 | Body medium, header title | Navigation title text |
| **14px** | 600-700 | Labels, stat text, review text | Step label, time/difficulty |
| **13px** | 600-700 | Small labels, descriptions | Card description, stat badges |
| **12px** | 500-700 | Section headers, uppercase labels | "AROMATICS", greeting text |
| **11px** | 500-700 | Captions, stat labels, pills | Protein pill, tab counts |
| **10px** | — | Micro text | Small badges |

### Font Weights Used

| Weight | CSS | Usage |
|--------|-----|-------|
| 900 | `'900'` | Extra bold titles (rare) |
| 800 | `'800'` | Primary headings, card titles, button text |
| 700 / bold | `'700'` / `'bold'` | Section headers, labels, step titles |
| 600 | `'600'` | Semi-bold body, stat text, secondary labels |
| 500 | `'500'` | Medium weight body text |
| 400 | `'400'` | Regular body, descriptions |
| 300 | `'300'` | Timer text (light) |

### Letter Spacing

| Value | Usage |
|-------|-------|
| `3.5` | Logo subtitle "GUIDED HIGH-PROTEIN COOKING" |
| `3.0` | Uppercase greeting labels |
| `1.5` | Section headers (e.g., "AROMATICS") |
| `1.0` | Step labels, stat labels |
| `0.8` | Header title, uppercase labels |
| `0.5` | Subtle spacing on body |
| `0.3` | Light spacing |

### ThemedText Variants

Defined in `components/themed-text.tsx`:

| Type | fontSize | lineHeight | fontWeight | Extra |
|------|----------|------------|------------|-------|
| `default` | 16 | 24 | — | — |
| `defaultSemiBold` | 16 | 24 | 600 | — |
| `title` | 32 | 32 | bold | — |
| `subtitle` | 20 | — | bold | — |
| `link` | 16 | 30 | — | color: `#0a7ea4` |

---

## 3. Spacing & Layout

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Tight gaps, dot spacing, SPACE constant |
| `sm` | 8px | Small gaps, pill padding, row gaps |
| `md` | 16px | Standard padding, content gaps, horizontal padding |
| `lg` | 24px | Section spacing, container padding, modal padding |
| `xl` | 32px | Content padding (parallax view) |

### Screen Layout Values

| Property | Value | Usage |
|----------|-------|-------|
| Header paddingTop | 52-60px | Safe area + status bar |
| Header paddingBottom | 8-24px | Varies by screen |
| Content paddingHorizontal | 16-24px | Body content padding |
| Footer paddingBottom | 34-36px (iOS) / 16px (Android) | Safe area bottom |
| Section marginBottom | 14-24px | Between content sections |
| Card marginHorizontal | 16px | RecipeCard margins |
| Card marginVertical | 8px | RecipeCard vertical spacing |

### Key Dimensions

| Element | Value |
|---------|-------|
| Hero image height (RecipeCard) | 160px |
| Hero image height (RecipeOverview) | 220px |
| Step image height (CookingMode) | 260px |
| Protein card height | 120px |
| Protein card width | `(screenWidth - 56) / 2` |
| Primary button height | 54-60px |
| Tab icon size | 28px |
| Avatar size | 36px |
| Protein emoji circle | 52×52px |
| Cart button | 46×46px |
| Favourite button | 36×36px |
| Modal close button | 32×32px |
| Progress bar height | 4px |
| Separator | `StyleSheet.hairlineWidth` or 1px |
| Handle bar | 36-40w × 4h |
| ShareableRecipeCard | 1400×900px |

---

## 4. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| **Sheet** | 28px | Modal/bottom sheet top corners |
| **XL** | 24-25px | Filter pills, tier selector, modals, bottom sheets |
| **LG** | 20px | Recipe cards, tip cards, info cards, CARD_RADIUS |
| **MD-LG** | 18px | Chips, secondary pills |
| **MD** | 16px | Buttons, inputs, containers, nutrition boxes, review cards |
| **MD-SM** | 14px | Navigation buttons, small cards, step images |
| **SM** | 12px | Small badges, search inputs, stat badges, protein pills |
| **XS** | 10-11px | Ingredient icons, radio buttons (circle) |
| **Tiny** | 8px | Minor elements, image thumbnails |
| **Dot** | 3-4px | Progress dots, small checkboxes |
| **Circle** | 50% of dimension | Avatar (18px), emoji circle (26px), cart button (23px) |

---

## 5. Shadows & Elevation

### iOS Shadows

**Strong (Elevated modals, hero elements):**
```javascript
// Orange glow (CTA buttons, modals)
{ shadowColor: '#E85D26', shadowOpacity: 0.3-0.5, shadowRadius: 8-20,
  shadowOffset: { width: 0, height: 4-8 } }

// Deep black (overlays, cards)
{ shadowColor: '#000', shadowOpacity: 0.28-0.4, shadowRadius: 12-20,
  shadowOffset: { width: 0, height: -8 } }  // negative for upward shadow
```

**Medium (Cards, elevated surfaces):**
```javascript
// Standard card shadow
{ shadowColor: '#000', shadowOpacity: 0.15-0.25, shadowRadius: 4-12,
  shadowOffset: { width: 0-3, height: 4-6 } }

// Orange accent card
{ shadowColor: '#E85D26', shadowOpacity: 0.3-0.4, shadowRadius: 8-12,
  shadowOffset: { width: 0, height: 4 } }

// Cooking mode protein icon
{ shadowColor: '#FF8C00', shadowOpacity: 0.3, shadowRadius: 12,
  shadowOffset: { width: 0, height: 0 } }
```

**Light (Subtle depth):**
```javascript
{ shadowColor: '#000', shadowOpacity: 0.08-0.15, shadowRadius: 2-4,
  shadowOffset: { width: 0, height: 2 } }
```

**Cart button glow:**
```javascript
{ shadowColor: '#4CAF50', shadowOpacity: 0.6, shadowRadius: 8,
  shadowOffset: { width: 0, height: 0 } }
```

**Text shadows:**
```javascript
{ textShadowColor: 'rgba(0,0,0,0.2-0.5)',
  textShadowOffset: { width: 0-2, height: 1-4 },
  textShadowRadius: 2-8 }
```

### Android Elevation

| Level | Value | Usage |
|-------|-------|-------|
| Subtle | 3 | Favourite button |
| Standard | 6-8 | Cards, protein cards, pressed cards |
| Strong | 14-16 | Modals, elevated overlays |
| Maximum | 24 | Active modals |

### RecipeCard Border Depth Effect

Instead of shadow alone, cards use multi-sided borders for a 3D feel:
```javascript
borderBottomWidth: 4, borderBottomColor: '#D4D4D4',
borderRightWidth: 2, borderRightColor: '#E0E0E0',
```

---

## 6. Gradients

All gradients use `expo-linear-gradient` (`LinearGradient`).

### Primary CTA Button

```javascript
colors={['#F07030', '#C84A10']}
start={{ x: 0, y: 0 }}
end={{ x: 1, y: 0 }}    // horizontal, left → right
```
Used on: "Get Started", "Start Cooking", main action buttons.

### Hero Image Default (Recipe Card)

```javascript
colors={[gradient[0] || '#8B4513', gradient[1] || '#5D2E0C']}
// Per-recipe gradient pair stored in DB
```

### Hero Gloss Effect (RecipeCard overlay)

```javascript
colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0)']}
start={{ x: 0, y: 0 }}
end={{ x: 0, y: 1 }}    // vertical, top → bottom
```

### Hero Text Overlay (bottom fade)

```javascript
colors={['transparent', 'rgba(0,0,0,0.7)']}
// vertical bottom-up for readable text on images
```

---

## 7. Navigation Structure

### Root Layout (`app/_layout.tsx`)

```
Stack Navigator (headerShown: false)
├── index.tsx → Splash screen (entry point)
├── (tabs)/ → Tab navigator
│   ├── index.tsx → Home tab
│   └── explore.tsx → Explore tab
├── screens/ProteinSelectionScreen
├── screens/RecipeListScreen
├── screens/RecipeOverviewScreen
├── screens/CookingStartScreen
├── screens/IngredientChecklistScreen
├── screens/CookingModeScreen
├── screens/AIRecipeBuilderScreen
├── screens/AIRecipeResultScreen
├── screens/CustomRecipeScreen
├── screens/AddRecipeScreen (alias → CustomRecipeScreen)
├── screens/FeedbackScreen
├── screens/SplashScreen
└── modal.tsx (unused)
```

### Tab Layout (`app/(tabs)/_layout.tsx`)

```javascript
tabBarActiveTintColor: Colors[colorScheme].tint
tabBarButton: HapticTab                          // Haptic feedback on press
headerShown: false

Tabs:
  'index'   → Home    → IconSymbol('house.fill',     size: 28)
  'explore' → Explore → IconSymbol('paperplane.fill', size: 28)
```

### User Flow

```
Splash → ProteinSelection → RecipeList → RecipeOverview
                                             ├── CookingStart → IngredientChecklist → CookingMode → FeedbackScreen
                                             └── (or) AIRecipeBuilder → AIRecipeResult → CookingMode
```

### App Startup (`_layout.tsx` useEffect)

```
1. Request notification permissions
2. Create Android "Cooking Timer" channel
   - importance: MAX
   - vibrationPattern: [0, 250, 250, 250]
   - lightColor: '#E85D26'
3. refreshRecipeCache() — background Supabase fetch
4. syncPendingAIRecipes() — retry failed AI recipe syncs
5. (DISABLED) pruneImageCache() — TurboModule crash
```

---

## 8. Reusable Components

### Core Themed Components

| Component | File | Props | Purpose |
|-----------|------|-------|---------|
| **ThemedText** | `components/themed-text.tsx` | `lightColor?`, `darkColor?`, `type` | Text with auto light/dark color |
| **ThemedView** | `components/themed-view.tsx` | `lightColor?`, `darkColor?` | View with auto light/dark background |
| **HapticTab** | `components/haptic-tab.tsx` | `BottomTabBarButtonProps` | Tab button with iOS haptic feedback |
| **IconSymbol** | `components/ui/icon-symbol.tsx` | `name`, `size`, `color`, `weight?` | SF Symbols (iOS) / Material Icons (Android) |
| **Collapsible** | `components/ui/collapsible.tsx` | `title`, `children` | Expandable section with chevron |
| **ExternalLink** | `components/external-link.tsx` | `href`, standard Link props | Opens URL in in-app browser |
| **ParallaxScrollView** | `components/parallax-scroll-view.tsx` | `headerImage`, `headerBackgroundColor` | Parallax header (height: 250px) |

### IconSymbol Mappings (SF Symbols → Material Icons)

| SF Symbol (iOS) | Material Icon (Android) |
|-----------------|------------------------|
| `house.fill` | `home` |
| `paperplane.fill` | `send` |
| `chevron.left.forwardslash.chevron.right` | `code` |
| `chevron.right` | `chevron-right` |

### Recipe Components

| Component | File | Purpose |
|-----------|------|---------|
| **RecipeCard** | `components/RecipeCard.tsx` | Recipe browsing card with hero, rating, nutrition |
| **ShareableRecipeCard** | `components/ShareableRecipeCard.tsx` | 1400×900 social media share card |
| **CommunityReviewsModal** | `components/CommunityReviewsModal.tsx` | Bottom sheet with ratings & reviews |

### RecipeCard Props

```typescript
interface RecipeCardProps {
  name: string;
  description?: string;
  time?: string;                       // "30 min"
  protein?: string;                    // "38g"
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  rating?: string;                     // "4.5"
  communityCount?: number;
  communityLoading?: boolean;
  cookCount?: number;
  emoji: string;                       // "🍗"
  imageSource?: ImageSourcePropType;   // Hero image
  isFavorite: boolean;
  onPress: () => void;
  onFavoriteToggle: () => void;
  onRatingPress?: () => void;
  accentColors: readonly [string, string]; // Gradient pair
  actionRow?: ReactNode;               // Custom top-right overlay
  nutrition?: CardNutrition;
  isBuilding?: boolean;                // Show "Crafting..." overlay
}
```

### RecipeCard Visual Structure

```
Pressable (borderRadius: 20, overflow: hidden)
├── [if isBuilding] Building Overlay (rgba(26,10,0,0.9))
│   └── 👨‍🍳 "Crafting Your Recipe" + animated dots
└── Hero Wrap (height: 160)
    └── LinearGradient (accentColors[0] → [1])
        ├── Gloss overlay (white → transparent)
        ├── Hero image OR emoji (80px) with glow circle
        ├── Stats pill (top-left): "💪 38g" (rgba(0,0,0,0.55))
        ├── Rating pill (top-right): "⭐ 4.5 (12)" or "⭐ New"
        ├── Favourite button (top-left): ★/☆ (36×36 white circle)
        └── Bottom text overlay (transparent → rgba(0,0,0,0.7))
            ├── Title (fontSize: 20, fontWeight: 800, white)
            └── Description (fontSize: 13, white 90% opacity)
```

### ShareableRecipeCard Layout (1400×900)

```
ImageBackground (splash-bg.jpg)
├── Overlay (rgba(60,30,10,0.55))
├── Title Banner (bg: #7B1A1A, Georgia italic, fontSize: 40)
├── Hero Dish Photo (rotated 4°, 170×170, white border)
├── Description + Stats ("💪 38g • 🔥 285 kcal")
├── Two-Column Body
│   ├── LEFT: Ingredients (bg: cream, max 12, with thumbnails 36×36)
│   └── RIGHT: Instructions (bg: cream, max 7, step circles #9B2C2C)
└── Footer: "SpiceStrong" + "www.spicestrong.app"
```

### CommunityReviewsModal Layout

```
Modal (slide, transparent)
└── Backdrop (rgba(0,0,0,0.6), justify: flex-end)
    └── Sheet (bg: #1A1008, borderTopRadius: 28, maxHeight: 85%)
        ├── Handle bar (40×4, white 25% opacity)
        ├── Header: "Community Ratings" + recipe name
        ├── Summary: Big rating (48px, gold) + distribution bars
        ├── Divider
        ├── Reviews FlatList
        │   └── Review Cards (bg: white 6%, borderRadius: 16)
        │       └── Avatar (36×36, bg: #E85D26) + username + stars + comment
        ├── [if empty] "Be the first to review" (💬)
        └── Close Button (bg: white 10%, borderRadius: 16)
```

---

## 9. Screen-Level Patterns

### Consistent Screen Header

```javascript
// Pattern used across all screens
{
  paddingTop: 52-60,        // Safe area
  paddingHorizontal: 16-24,
  paddingBottom: 8-24,
  backgroundColor: varies,  // Screen-specific tint
}
```

### Back Button Pattern

```javascript
// Absolute positioned, top-left
{
  position: 'absolute',
  left: 16-20,
  top: 52,
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: 'rgba(0,0,0,0.4)',  // or rgba(255,255,255,0.15)
}
```

### Bottom Action Bar

```javascript
// Fixed at bottom, safe area aware
{
  position: 'absolute',
  bottom: 0,
  left: 0, right: 0,
  backgroundColor: 'rgba(0,0,0,0.5-0.95)',
  paddingHorizontal: 16-20,
  paddingTop: 12,
  paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  borderTopWidth: 1,
  borderTopColor: 'rgba(255,255,255,0.08)',
}
```

### Tier Selector (2-3 servings / 4-6 servings)

```javascript
// Toggle buttons in a row
{
  flex: 1,
  paddingVertical: 12,
  borderRadius: 25,
  // Inactive:
  backgroundColor: 'rgba(255,255,255,0.12)',
  // Active:
  backgroundColor: '#E85D26',
}
```

### Glass Card Pattern

```javascript
{
  backgroundColor: 'rgba(255,255,255,0.1-0.12)',
  borderRadius: 16-20,
  padding: 14-20,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.2)',
}
```

### Chip/Pill Pattern

```javascript
// Inactive
{
  backgroundColor: 'rgba(255,255,255,0.1)',
  paddingHorizontal: 12-18,
  paddingVertical: 8-12,
  borderRadius: 18-28,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.2)',
}
// Active
{
  backgroundColor: '#E85D26',
  borderColor: '#E85D26',
}
```

### Section Header Pattern

```javascript
{
  fontSize: 12,
  fontWeight: '700',
  color: 'rgba(255,255,255,0.45)',
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  marginTop: 20,
  marginBottom: 10,
}
```

### Ingredient Card Pattern (IngredientChecklistScreen)

```javascript
// Unchecked
{
  backgroundColor: 'rgba(80, 40, 20, 0.55)',
  borderRadius: 16,
  paddingVertical: 12,
  paddingHorizontal: 14,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.4)',
}
// Checked
{
  backgroundColor: 'rgba(232, 93, 38, 0.18)',
  borderColor: 'rgba(232, 93, 38, 0.35)',
}
// Text: strikethrough + reduced opacity
```

### Tip Box Pattern

```javascript
{
  backgroundColor: 'rgba(255,255,255,0.08)',  // or '#FFF8ED' on light bg
  borderRadius: 16,
  padding: 16,
  borderLeftWidth: 4,
  borderLeftColor: '#E85D26',
}
```

---

## 10. Animations

All animations use `react-native/Animated` (not Reanimated, except ParallaxScrollView).

### Pulse Animation (CookingStartScreen)

```javascript
// Emoji pulse loop
Animated.loop(
  Animated.sequence([
    Animated.timing(pulseAnim, { toValue: 1.08, duration: 800 }),
    Animated.timing(pulseAnim, { toValue: 1.0,  duration: 800 }),
  ])
)
// Applied as: transform: [{ scale: pulseAnim }]
```

### Cart Bounce (IngredientChecklistScreen)

```javascript
Animated.sequence([
  Animated.timing(cartBounce, { toValue: 1.3, duration: 100 }),
  Animated.timing(cartBounce, { toValue: 1.0, duration: 100 }),
])
// Applied to cart button scale
```

### Cart Sheet Slide (IngredientChecklistScreen)

```javascript
// Open:  Animated.timing(cartSheetAnim, { toValue: 1, duration: 300 })
// Close: Animated.timing(cartSheetAnim, { toValue: 0, duration: 200 })
```

### Timer Complete Slide (CookingModeScreen)

```javascript
// Show: Spring animation
Animated.spring(timerCompleteSlide, {
  toValue: 0,              // slide to visible
  tension: 65,
  friction: 11,
})
// Dismiss:
Animated.timing(timerCompleteSlide, {
  toValue: 300,            // slide off-screen
  duration: 200,
})
```

### Confetti (CookingModeScreen completion)

```javascript
// Per particle:
opacity:    1.0 → 0.0
translateY: 0   → 400px
duration:   variable per particle
```

### Press State (RecipeCard)

```javascript
// Pressed: scale 0.98, reduced shadow
transform: [{ scale: 0.98 }]
shadowOpacity: 0.08  // reduced from 0.25
elevation: 6         // reduced from 8
```

### Parallax (ParallaxScrollView)

```javascript
// Uses react-native-reanimated
HEADER_HEIGHT = 250
translateY: [-HEIGHT, 0, HEIGHT] → [-HEIGHT/2, 0, HEIGHT*0.75]
scale:      [-HEIGHT, 0, HEIGHT] → [2, 1, 1]
```

---

## 11. Modal & Bottom Sheet Patterns

### Standard Bottom Sheet

```javascript
// Container
{
  backgroundColor: varies,          // #1A1008, #2A1810, #1E1E1E
  borderTopLeftRadius: 24-28,
  borderTopRightRadius: 24-28,
  maxHeight: '70-85%',
  padding: 24,
}

// Backdrop
{
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.5-0.6)',
  justifyContent: 'flex-end',
}

// Handle bar (always present)
{
  width: 36-40,
  height: 4,
  backgroundColor: 'rgba(255,255,255,0.2-0.3)',
  borderRadius: 2,
  alignSelf: 'center',
  marginTop: 12,
  marginBottom: 8,
}
```

### Centered Modal (AI limit, ingredient modal)

```javascript
{
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.6)',
  justifyContent: 'center',
  padding: 24,
}

// Card inside
{
  backgroundColor: '#1A0A00',
  borderRadius: 24,
  padding: 28,
  borderWidth: 1.5,
  borderColor: 'rgba(232,93,38,0.35)',
  // iOS shadow with orange glow
}

// Close button (always top-right)
{
  position: 'absolute',
  top: 14,
  right: 16,
  width: 32,
  height: 32,
  borderRadius: 16,
  backgroundColor: 'rgba(255,255,255,0.1)',
}
```

---

## 12. Icons & Emoji

### Ionicons Usage (from `@expo/vector-icons`)

| Icon | Size | Context |
|------|------|---------|
| `cart` | 18-20 | Cart button, view cart |
| `checkmark-circle` | 22 | Ingredient added to cart |
| `share-outline` | 18 | Share button |
| `trash-outline` | 18 | Delete/clear button |

### Emoji by Category

| Category | Emojis |
|----------|--------|
| **Proteins** | 🍗 🐟 🥩 🐐 🥓 🦐 🥚 🧀 🌱 🟫 🫘 🫛 🥛 💪 |
| **Cooking** | 🔥 🧅 🥩 🍳 🧂 🌶️ 🫕 |
| **Actions** | 👨‍🍳 🧺 🍰 ⏱️ 💬 |
| **Status** | ⭐ ✓ ✕ |
| **Steps** | Emoji per step stored in recipe data |

### Icon Pattern Rule

> **Always use Ionicons** from `@expo/vector-icons` for interactive UI elements.
> **Never use emoji** for buttons or icons — emoji renders inconsistently across devices.
> **Emoji is OK** for decorative/display purposes (protein labels, step indicators, cooking emojis).

---

## 13. Conventions & Rules

### Styling

- All styles via `StyleSheet.create()` — no CSS-in-JS, no NativeWind, no Tailwind
- Colors use hex `#RRGGBB` or `rgba()` — never named colors
- All measurements in logical pixels (dp) — no density conversion
- Platform checks via `Platform.OS === 'ios'` for safe area padding

### Interaction States

| State | Visual Change |
|-------|---------------|
| **Pressed** | `scale: 0.98`, reduced shadow, `activeOpacity: 0.7-0.85` |
| **Disabled** | `opacity: 0.3-0.6` |
| **Checked** | Background + border color change, text strikethrough + opacity |
| **Active tab/pill** | `backgroundColor: '#E85D26'`, `borderColor: '#E85D26'` |
| **Inactive tab/pill** | `backgroundColor: 'rgba(255,255,255,0.1-0.2)'` |
| **Loading** | "⭐ ···" placeholder text |
| **Building** | Animated dots overlay with "Crafting Your Recipe" |

### Color Pairing Rules

| Background | Text Color | Accent |
|------------|-----------|--------|
| Dark (`#0F0F0F`, `#1A0A00`) | White `#FFFFFF` | Orange `#E85D26` |
| Glass (`rgba white 0.1`) | White `#FFFFFF` | Orange `#E85D26` |
| Light (`#FAF7F2`, `#FFF8ED`) | Dark brown `#2D1A0E` | Orange `#E85D26` |
| White card | Dark `#11181C` | Brown `#8B4513` |
| Success button | White `#FFFFFF` | — |
| Danger button | White `#FFFFFF` | — |

### Haptic Feedback

- Tab press: `Haptics.impactAsync(ImpactFeedbackStyle.Light)` (iOS only)
- Used in `HapticTab` component, applied to all bottom tabs

---

## 14. Theme Files Reference

| File | Purpose |
|------|---------|
| `src/theme/index.ts` | **Primary theme** — Colors, Spacing, Protein list |
| `constants/theme.ts` | **Legacy theme** — Light/dark color scheme, font definitions |
| `hooks/use-theme-color.ts` | Hook: resolves color from props or theme |
| `hooks/use-color-scheme.ts` | Hook: re-exports React Native `useColorScheme` |
| `components/themed-text.tsx` | ThemedText with 5 type variants |
| `components/themed-view.tsx` | ThemedView with auto background |
| `components/haptic-tab.tsx` | Tab button with haptic feedback |
| `components/ui/icon-symbol.tsx` | Cross-platform icon (SF Symbols / Material) |
| `components/ui/icon-symbol.ios.tsx` | iOS-specific SF Symbols implementation |
| `components/RecipeCard.tsx` | Main recipe card (CARD_RADIUS=20, HERO_HEIGHT=160) |
| `components/ShareableRecipeCard.tsx` | Social share card (1400×900) |
| `components/CommunityReviewsModal.tsx` | Ratings bottom sheet modal |
