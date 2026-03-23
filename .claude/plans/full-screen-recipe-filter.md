# Full-Screen Recipe Filter with Two Tabs

## Overview
Replace the current bottom-sheet filter modal in RecipeListScreen with a full-screen filter experience featuring two tabs: **Quick Build** (common filters) and **Advanced** (detailed MyFitnessPal-style filters).

## Architecture

### New File: `app/screens/RecipeFilterScreen.tsx`
A dedicated full-screen filter page that receives the current filter state via route params and returns selected filters back to RecipeListScreen.

### Navigation Flow
```
RecipeListScreen → tap filter icon → navigate to RecipeFilterScreen
    ↓
RecipeFilterScreen (full screen, two tabs)
    ↓
User selects filters → taps "Apply Filters (N)"
    ↓
Navigate back to RecipeListScreen with filter params
```

## Tab 1: Quick Build

### Sections:
1. **Fitness Goal** (single select)
   - 🔥 Fat Loss | 💪 Muscle Gain | ⚖️ Balanced | 🥑 Keto | 🏃 High Energy
   - Selecting a goal auto-fills macro ranges below

2. **Macros Per Serving** (single select per macro)
   - Protein: Under 20g | 20-29g | 30-39g | 40g+
   - Carbs: Under 20g | 20-50g | 50g+
   - Fat: Under 10g | 10-19g | 20g+
   - Auto-filled when fitness goal is selected, but user can override

3. **Spice Level** (single select)
   - Mild | Medium | Hot | Extra Hot

4. **Cooking Time** (single select)
   - Under 15 min | 15-30 min | 30-60 min | 1 hour+

5. **Difficulty** (single select)
   - Easy | Medium | Hard

6. **Meat Type** (single select, shown only for non-veg proteins)
   - Varies by protein: Drumstick/Boneless/Bone-in/Minced for Chicken, Fillet/Whole for Fish, etc.

## Tab 2: Advanced

### Sections:
1. **Dietary Preferences** (multi-select checkboxes)
   - Low Carb | Gluten Free | Low Fat | Dairy Free | Vegan | Sugar Free | Paleo | Whole30 | Keto | Halal

2. **Allergens to Avoid** (multi-select checkboxes)
   - Nuts | Soy | Shellfish | Dairy | Eggs | Gluten | Sesame | Mustard

3. **Cooking Method** (single select)
   - Stir Fry | Curry | Grilled | Baked | Air Fryer | Slow Cook | Pressure Cooker | Tandoor | Steamed | Pan-seared

4. **Cuisine** (single select)
   - Indian | Thai | Mediterranean | Chinese | Mexican | American | Japanese | Korean | Middle Eastern

5. **Calorie Range** (single select)
   - Under 300 | 300-500 | 500-700 | 700+

6. **Meal Prep** (multi-select checkboxes)
   - Meal prep friendly | One-pot | No marination needed | Kid friendly | Budget friendly

## Bottom Action Bar (Fixed)
```
[ Clear All ]                    [ Apply Filters (6) ]
```
- **Clear All**: Text button, left-aligned, resets all filters on both tabs
- **Apply Filters (N)**: Orange solid button, right-aligned, N = total active filter count across both tabs
- Bottom bar is always visible (fixed position), content scrolls above it

## Implementation Steps

### Step 1: Create RecipeFilterScreen.tsx
- Full-screen with dark background matching app theme
- Two tab buttons at top: "Quick Build" | "Advanced"
- ScrollView for filter content per tab
- Fixed bottom bar with Clear All + Apply Filters
- All filter state managed locally, only applied on "Apply Filters" tap

### Step 2: Update RecipeListScreen.tsx
- Remove the existing filter Modal (lines 492-580)
- Add new filter state variables for all new filters (fitness goal, macros, dietary tags, allergens, cooking method, cuisine, calories, meal prep)
- Update filter icon to navigate to RecipeFilterScreen with current filter state as params
- Listen for returned filter params when navigating back
- Update the `listData` useMemo to filter by all new criteria
- Update `activeFilterCount` to count all active filters

### Step 3: Update Filter Logic
- Fitness goal maps to protein_g/carbsG/fatG ranges
- Macro filters check aiNutrition fields on each recipe
- Dietary/allergen tags check against recipe's dietary_tags/allergen_tags arrays
- Cooking method checks cooking_method field
- Cuisine checks cuisine or cuisine_type field
- Calorie range checks aiNutrition.calories
- Meal prep checks storage_tags array

### Step 4: Protein-Aware Filtering
- Meat type options change based on proteinId (chicken gets drumstick/boneless/bone-in, fish gets fillet/whole, etc.)
- Some filters are hidden for certain proteins (no "meat type" for veg proteins)

## Files Changed
1. **NEW**: `app/screens/RecipeFilterScreen.tsx` — Full-screen filter with two tabs
2. **MODIFIED**: `app/screens/RecipeListScreen.tsx` — Remove old modal, add new state vars, navigate to filter screen, updated filtering logic

## Design Spec
- Background: #0F0F0F or #1A0A00
- Tab active: #E85D26 underline, white text
- Tab inactive: rgba(255,255,255,0.5) text
- Section headers: 12px uppercase, rgba(255,255,255,0.5), letter-spacing 1
- Filter chips: glass style rgba(255,255,255,0.1), border rgba(255,255,255,0.2)
- Active chip: rgba(232,93,38,0.2) bg, #E85D26 border
- Checkboxes: Ionicons checkbox-outline / checkbox, #E85D26 when checked
- Clear All: rgba(255,255,255,0.5) text, no background
- Apply Filters: #E85D26 solid background, white text, borderRadius 12
