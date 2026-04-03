# Implementation Prompt: Image-First Recipe Import + Profile Menu Entry

## Session Setup

Before making any code changes, create a git commit:
```bash
git add -A && git commit -m "before: image-first add recipe flow with profile menu entry"
```

---

## Feature Overview

Three changes, in this order:

1. **Move "Add Your Recipe" to the ProfileMenu** — remove it from `RecipeListScreen` and add it as a new menu item in `components/ProfileMenu.tsx`
2. **Image-first flow in `AddRecipeScreen`** — prepend a new step: upload a photo → Claude Vision extracts the recipe → pre-filled editable review UI. If skipped, fall through to the existing 5-step manual wizard.
3. **Auto-classify on save** — after saving, call `classifyAndEnrichRecipe()` (already exists in `services/recipeService.ts`) to check protein density and categorize. If the recipe fails the 6.4g protein/100 cal threshold, save it under a "My Recipes" bucket instead of the chosen protein.

---

## Codebase Context

### Navigation

- **Router**: Expo Router v6 file-based. `app/_layout.tsx` defines a `<Stack screenOptions={{ headerShown: false }} />` with no named routes — any file under `app/screens/` is automatically a valid route path.
- **Navigate to a screen**: `router.push({ pathname: '/screens/AddRecipeScreen', params: { ... } })`
- **No changes to `app/_layout.tsx` are needed.**

### Theming (always follow this)

Use `src/theme/index.ts`:
```typescript
import { Colors, Spacing } from '../../src/theme';
// Colors.primary = '#E85D26' (orange)
// Colors.background = '#0F0F0F'
// Colors.surface = '#1A1A1A'
// Colors.text = '#FFFFFF'
// Colors.textSecondary = '#999999'
// Colors.border = '#333333'
```

### Claude API Pattern (already used in this codebase)

All Claude calls use direct fetch — **no SDK import needed**:

```typescript
const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',  // Required for React Native
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [...] }],
  }),
});
const data = await response.json();
const text = data.content?.[0]?.text || '';
```

**For vision (image input)**, the `content` array has image blocks before text:

```typescript
messages: [{
  role: 'user',
  content: [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',  // or 'image/png'
        data: base64String,         // base64-encoded image, NO data: URI prefix
      },
    },
    {
      type: 'text',
      text: 'Extract the recipe from this image...',
    },
  ],
}]
```

See `services/recipeReviewService.ts:375-440` for the exact pattern used in this codebase.

### expo-image-picker (already installed)

```typescript
import * as ImagePicker from 'expo-image-picker';

// Launch image library
const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  allowsEditing: false,
  quality: 0.8,
  base64: true,  // Request base64 directly — avoids file system reads
});

if (!result.canceled && result.assets[0]) {
  const { uri, base64 } = result.assets[0];
  // base64 is already the raw base64 string (no data: URI prefix)
}
```

`AddRecipeScreen.tsx:15` already imports `expo-image-picker`: `import * as ImagePicker from 'expo-image-picker';`

### Recipe Data Model

From `src/store/recipes.ts`:

```typescript
export type QuantityTier = '2-3 servings' | '4-6 servings';
export type MealType = 'breakfast' | 'lunch_dinner' | 'snack_dessert';
export type IngredientsByTier = Record<QuantityTier, { name: string; quantity: string }[]>;

export interface CookingStep {
  title: string;
  description: string;
  emoji?: string;
  timerMinutes?: number;
  tip?: string;
  ingredientsUsed?: string;
  cookingMethod?: string;
  photoUri?: string;
  photoStorageUrl?: string;
}

export interface SavedRecipe {
  id: string;
  name: string;
  proteinId: string;          // e.g. 'chicken', 'paneer'
  proteinName: string;        // e.g. 'Chicken', 'Paneer'
  proteinEmoji: string;
  description?: string;
  ingredients: IngredientsByTier;
  steps: CookingStep[];
  chefTip: string;
  createdAt: number;
  mealType?: MealType;
  status?: 'building' | 'ready' | 'pending_review' | 'rejected';
  source?: 'curated' | 'ai' | 'user';
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  cuisine?: string;
  timeMinutes?: number;
  reviewResult?: { score: number; issues: string[]; suggestions: string[] };
  aiNutrition?: {
    calories: number; proteinG: number; fatG: number;
    carbsG: number; fiberG: number; sugarG: number; sodiumMg: number;
  };
  spiceLevel?: string;
  cuisineType?: string;
  cookTimeBucket?: string;
  dietaryTags?: string[];
  allergenTags?: string[];
  cookingMethod?: string;
  fitnessGoal?: string[];
  storageTags?: string[];
}
```

**Protein IDs** (from `src/theme/index.ts`):
```
chicken, fish, lamb, goat, pork, beef, prawns, eggs, paneer, tofu, soy, beans, milk, whey
```

### Classification & Protein Density Rule

`services/recipeService.ts` exports `classifyAndEnrichRecipe(recipe: SavedRecipe): Promise<boolean>`.

This function:
1. Calls Claude with `CLASSIFICATION_SYSTEM_PROMPT` (lines 881–942)
2. Returns classification fields: `cuisine_type`, `spice_level`, `dietary_tags`, etc.
3. Also updates Supabase with `protein_g`, `calories`, etc. from `recipe.aiNutrition`

**The 6.4g/100 cal threshold** is enforced in `REVIEW_SYSTEM_PROMPT` (`services/recipeReviewService.ts:68`):
> Protein density: proteinG / calories * 100 >= 6.4

For the auto-classification on save, check this from `recipe.aiNutrition`:
```typescript
const proteinDensity = (aiNutrition.proteinG / aiNutrition.calories) * 100;
const meetsThreshold = proteinDensity >= 6.4;
```

If `aiNutrition` is absent (user didn't provide macros), skip the check and save normally.

### How `AddRecipeScreen` Currently Works

File: `app/screens/AddRecipeScreen.tsx`

- **5-step wizard**: `'basics' | 'ingredients' | 'steps' | 'hero' | 'review'`
- **Route params it accepts**: `proteinId`, `proteinName`, `proteinEmoji`, `editRecipeId?`
- **On submit** (step `'review'`): calls `saveAIRecipe(recipe)` then `submitRecipeForReview(recipe)` (background)
- The screen already imports `expo-image-picker` and uses it in the `'hero'` step
- Styles use inline `StyleSheet.create` — follow the same dark theme pattern from the existing styles in the file

### Where "Add Your Recipe" Is Currently Triggered

`app/screens/RecipeListScreen.tsx:878-891`:
```tsx
<TouchableOpacity
  style={styles.actionCard}
  onPress={() =>
    router.push({
      pathname: '/screens/AddRecipeScreen',
      params: { proteinId, proteinName, proteinEmoji },
    })
  }
>
  <Ionicons name="create-outline" size={18} color="#E85D26" style={{ marginBottom: 4 }} />
  <Text style={styles.actionCardTitle}>Add Your Recipe</Text>
  <Text style={styles.actionCardSub}>Share your own creation</Text>
</TouchableOpacity>
```
This sits inside a `<View style={styles.actionBtnRow}>` alongside the AI Builder card. **Remove just this one `<TouchableOpacity>` block** — keep the AI Builder card.

Also in `RecipeListScreen.tsx:587-595` there's an "Edit" button that goes to `AddRecipeScreen` with an `editRecipeId`. **Keep this one.**

### ProfileMenu Current State

File: `components/ProfileMenu.tsx`

The `MENU_ITEMS` array (line 119–126):
```typescript
const MENU_ITEMS: MenuItem[] = [
  { icon: 'scan-outline',     label: 'Scan My Grocery',      onPress: handleScanGrocery },
  { icon: 'basket-outline',   label: 'My Pantry',            onPress: handleMyPantry },
  { icon: 'sparkles-outline', label: 'Auto Meal Plan',       onPress: handleAutoMealPlan },
  { icon: 'calendar-outline', label: 'Meal Calendar',        onPress: handleMealPlan },
  { icon: 'cart-outline',     label: 'Grocery List',         onPress: handleGroceryList },
  { icon: 'leaf-outline',     label: 'Dietary Restrictions', onPress: handleDietary },
];
```

Add a new item: **"Add Your Recipe"** with icon `'add-circle-outline'`.

Because `AddRecipeScreen` now requires `proteinId/proteinName/proteinEmoji` params but the Profile Menu has no protein context, **pass empty/generic defaults**:
```typescript
router.push({
  pathname: '/screens/AddRecipeScreen',
  params: {
    proteinId: '',
    proteinName: '',
    proteinEmoji: '🍽️',
    fromMenu: 'true',  // signal to the screen that protein is unknown
  },
});
```
The screen will handle the `fromMenu` param — when present, it shows a protein picker at the start of the image-extraction review flow (see below).

---

## Change 1: ProfileMenu — Add "Add Your Recipe"

**File**: `components/ProfileMenu.tsx`

1. Add a handler function before `MENU_ITEMS`:
```typescript
const handleAddRecipe = () => {
  closeMenu(() => router.push({
    pathname: '/screens/AddRecipeScreen',
    params: { proteinId: '', proteinName: '', proteinEmoji: '🍽️', fromMenu: 'true' },
  }));
};
```

2. Add a new entry to `MENU_ITEMS` — insert it between "Grocery List" and "Dietary Restrictions":
```typescript
{ icon: 'add-circle-outline', label: 'Add Your Recipe', onPress: handleAddRecipe },
```

The existing render loop handles dividers automatically — no other changes needed.

---

## Change 2: RecipeListScreen — Remove "Add Your Recipe" Button

**File**: `app/screens/RecipeListScreen.tsx`

Remove only this `TouchableOpacity` block (lines 878–891). Keep everything else, especially the AI Builder card and the Edit button (lines 587–595 that pass `editRecipeId`).

After removal, the `<View style={styles.actionBtnRow}>` will contain only the AI Builder card. That's fine — it'll stretch to fill the row.

---

## Change 3: AddRecipeScreen — Image-First Flow

**File**: `app/screens/AddRecipeScreen.tsx`

This is the main work. The changes are:

### 3a. New route params

Update the params type to include `fromMenu`:
```typescript
const params = useLocalSearchParams<{
  proteinId: string;
  proteinName: string;
  proteinEmoji: string;
  editRecipeId?: string;
  fromMenu?: string;       // 'true' when coming from profile menu (no protein context)
}>();
const fromMenu = params.fromMenu === 'true';
```

### 3b. New wizard step: `'image_import'`

Add `'image_import'` as the **first** step in the wizard (prepend it):

```typescript
type WizardStep = 'image_import' | 'basics' | 'ingredients' | 'steps' | 'hero' | 'review';
const WIZARD_STEPS: WizardStep[] = ['image_import', 'basics', 'ingredients', 'steps', 'hero', 'review'];
const STEP_LABELS = ['Import', 'Basics', 'Ingredients', 'Steps', 'Photo', 'Review'];
```

When `isEditing` is true (has `editRecipeId`), skip to `'basics'` as before — the image import step is only for new recipes.

### 3c. New state for image import

```typescript
// Image import state
const [importImageUri, setImportImageUri] = useState<string | null>(null);
const [importImageBase64, setImportImageBase64] = useState<string | null>(null);
const [extracting, setExtracting] = useState(false);
const [extractionDone, setExtractionDone] = useState(false);
const [extractionError, setExtractionError] = useState<string | null>(null);

// When fromMenu and no protein selected yet
const [selectedProteinId, setSelectedProteinId] = useState(params.proteinId || '');
const [selectedProteinName, setSelectedProteinName] = useState(params.proteinName || '');
const [selectedProteinEmoji, setSelectedProteinEmoji] = useState(params.proteinEmoji || '🍽️');
```

### 3d. Image import step UI

Render this when `currentStep === 'image_import'`. It has two modes:

**Mode A — Before image selected** (show upload prompt):
- Full-screen centered layout on dark background
- Large camera/image icon (use `Ionicons name="image-outline"` size 64, color `#E85D26`)
- Title: "Import from a photo"
- Subtitle: "Upload a screenshot or photo of a recipe and we'll extract it for you"
- Primary button: "Upload Photo" → calls `handlePickImage()`
- Secondary link: "Skip — enter recipe manually" → calls `goToManualEntry()`
- If `fromMenu === true`, show a protein picker above the upload section (scrollable horizontal row of protein chips from `PROTEINS` in `src/theme/index.ts`). The user must select a protein before they can proceed.

**Mode B — After image selected, before extraction** (show preview + confirm):
- Show the selected image in a rounded preview card (use `<Image>` from `expo-image`, `contentFit="cover"`)
- Button: "Extract Recipe from Photo" (orange, full-width) → calls `handleExtractRecipe()`
- Link: "Choose a different photo" → re-calls `handlePickImage()`
- Show `extractionError` in red if set

**Mode C — Extracting** (loading state):
- `<ActivityIndicator>` + text "Extracting recipe..." centered

**Mode D — Extraction done** → automatically advance to `'basics'` step with pre-filled state, then show the review UI (see 3f)

### 3e. Image picking and Claude extraction

```typescript
const handlePickImage = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.8,
    base64: true,
  });
  if (!result.canceled && result.assets[0]) {
    setImportImageUri(result.assets[0].uri);
    setImportImageBase64(result.assets[0].base64 || null);
    setExtractionError(null);
    setExtractionDone(false);
  }
};

const handleExtractRecipe = async () => {
  if (!importImageBase64) return;
  if (fromMenu && !selectedProteinId) {
    Alert.alert('Select a protein', 'Please select the protein type before extracting.');
    return;
  }
  setExtracting(true);
  setExtractionError(null);
  try {
    const extracted = await extractRecipeFromImage(importImageBase64);
    // Pre-fill wizard state from extracted data
    setRecipeName(extracted.name || '');
    setDescription(extracted.description || '');
    setMealType(extracted.mealType || null);
    setDifficulty(extracted.difficulty || null);
    setCookTime(extracted.cookTime || '');
    setCuisine(extracted.cuisine || null);
    if (extracted.ingredients) setIngredientsByTier(extracted.ingredients);
    if (extracted.steps?.length > 0) setSteps(extracted.steps);
    setExtractionDone(true);
    // Advance to review mode
    setCurrentStep('basics');
    setFromImageExtraction(true);  // triggers the review UI instead of wizard UI
  } catch (err: any) {
    setExtractionError(err.message || 'Could not extract recipe. Try a clearer photo.');
  } finally {
    setExtracting(false);
  }
};

const goToManualEntry = () => {
  setCurrentStep('basics');
  setFromImageExtraction(false);
};
```

Add `const [fromImageExtraction, setFromImageExtraction] = useState(false);` to state.

### 3f. Claude Vision extraction function

Add this outside the component (it's a pure async function):

```typescript
const RECIPE_EXTRACTION_PROMPT = `You are a recipe extraction engine. The user has provided an image of a recipe (screenshot, photo of a book, handwritten note, or dish photo). Extract the recipe into a structured JSON format.

If the image shows a finished dish (not a recipe with text), infer a reasonable recipe for that dish.

Return ONLY this JSON (no markdown, no preamble):
{
  "name": "Recipe name",
  "description": "1-2 sentence description mentioning the protein and cuisine style",
  "mealType": "breakfast" | "lunch_dinner" | "snack_dessert",
  "difficulty": "Easy" | "Medium" | "Hard",
  "cookTime": "30 min",
  "cuisine": "Indian" | "Thai" | "Mediterranean" | "Chinese" | "Mexican" | "American" | "Other",
  "ingredients": {
    "2-3 servings": [
      { "name": "Ingredient name", "quantity": "precise quantity e.g. 500g or 2 tbsp" }
    ],
    "4-6 servings": [
      { "name": "Ingredient name", "quantity": "exactly 2x the 2-3 serving quantity" }
    ]
  },
  "steps": [
    {
      "title": "Step title",
      "description": "Detailed description mentioning exact quantities of each ingredient used",
      "emoji": "🔥",
      "timerMinutes": 5,
      "ingredientsUsed": "comma-separated list of ingredients used in this step"
    }
  ]
}

Rules:
- Maximum 15 ingredients (count oil, salt, water)
- Minimum 4 steps, maximum 8 steps
- Every quantity must be precise — no "to taste", "some", "a pinch", etc.
- 4-6 serving quantities must be exactly 2x the 2-3 serving quantities
- If you cannot determine a precise quantity, use a reasonable estimate
- The "ingredientsUsed" field must list every ingredient mentioned in that step's description`;

async function extractRecipeFromImage(base64: string): Promise<{
  name: string;
  description: string;
  mealType: string | null;
  difficulty: string | null;
  cookTime: string;
  cuisine: string | null;
  ingredients: IngredientsByTier;
  steps: CookingStep[];
}> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
  if (!apiKey) throw new Error('No API key configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: RECIPE_EXTRACTION_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64,
            },
          },
          {
            type: 'text',
            text: 'Extract the recipe from this image. Follow the JSON schema exactly.',
          },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err.slice(0, 100)}`);
  }

  const data = await response.json();
  let text = (data.content?.[0]?.text || '').trim();
  // Strip markdown fences
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(text);

  // Normalize
  return {
    name: parsed.name || '',
    description: parsed.description || '',
    mealType: parsed.mealType || null,
    difficulty: parsed.difficulty || null,
    cookTime: parsed.cookTime || '',
    cuisine: parsed.cuisine || null,
    ingredients: parsed.ingredients || { '2-3 servings': [], '4-6 servings': [] },
    steps: (parsed.steps || []).map((s: any) => ({
      title: s.title || '',
      description: s.description || '',
      emoji: s.emoji || '🔥',
      timerMinutes: s.timerMinutes || undefined,
      ingredientsUsed: s.ingredientsUsed || '',
    })),
  };
}
```

### 3g. Extracted recipe review UI

When `fromImageExtraction === true` and `currentStep !== 'image_import'`, replace the standard step-by-step wizard UI with a **review/confirm layout**.

The review layout shows all extracted data in a scrollable list of tappable/editable sections. Each section has a header and tappable fields. When a field is tapped, it becomes an inline `<TextInput>`.

Structure:

```
┌─────────────────────────────────────┐
│ ← Back   Extracted Recipe   ✓ Save  │
├─────────────────────────────────────┤
│ [Imported photo thumbnail]          │
│ "Tap any field to edit"             │
├─────────────────────────────────────┤
│ BASICS                              │
│ Name: [tappable/editable]           │
│ Description: [tappable/editable]    │
│ Meal type: [chip picker]            │
│ Difficulty: [chip picker]           │
│ Cook time: [tappable/editable]      │
│ Cuisine: [chip picker]              │
├─────────────────────────────────────┤
│ INGREDIENTS (2-3 servings)          │
│ • 500g Chicken Breast [editable]    │
│ • 2 tbsp Oil [editable]             │
│ + Add ingredient                    │
├─────────────────────────────────────┤
│ STEPS                               │
│ 1. Marinate [editable title/desc]   │
│ 2. Cook [editable title/desc]       │
├─────────────────────────────────────┤
│ [Save Recipe] button (full width)   │
└─────────────────────────────────────┘
```

**Inline editing pattern** — use a `useState<string | null>` for which field is being edited. When tapped, render a `<TextInput autoFocus>` in place of the `<Text>`.

Alternatively (simpler), just pre-fill the existing wizard form fields and let users edit inline in each wizard step — but add a summary banner at the top of each step saying "✓ Extracted from photo — review and edit". The user taps "Next" through each step, editing as needed. This reuses all the existing wizard step UIs with no new layout needed.

**Recommended approach** (simpler, less code): Use the existing 5 wizard steps but prepopulated. Add:
- A banner at the top of each step: `"✓ Extracted from photo — review and edit below"`
- Keep the "Next" / "Back" buttons as-is

This means `fromImageExtraction` just affects whether the banner shows — no new review layout needed. The banner dismisses when the user reaches `'review'`.

### 3h. Protein selection when coming from menu

When `fromMenu === true` and no `selectedProteinId`, show a protein selector in the `'image_import'` step before the upload option.

Use `PROTEINS` from `src/theme/index.ts`:
```typescript
import { PROTEINS } from '../../src/theme';
```

Render as a horizontal `ScrollView` of tappable chips. When one is selected, set `selectedProteinId`, `selectedProteinName`, `selectedProteinEmoji`. After extraction, use these values as the recipe's `proteinId`, `proteinName`, `proteinEmoji`.

If the user skips to manual entry (`fromMenu === true`, no protein selected), show a protein picker as the first section in the `'basics'` step — the user must choose before they can proceed past Basics.

---

## Change 4: Auto-Classification on Save

**File**: `app/screens/AddRecipeScreen.tsx`

Find the submit handler (the function that runs when the user taps "Submit" on the `'review'` step). It currently calls:
```typescript
await saveAIRecipe(recipe);
submitRecipeForReview(recipe); // background, no await
```

`submitRecipeForReview` already calls `classifyAndEnrichRecipe` internally (see `services/recipeReviewService.ts:635`). So classification already happens — **you don't need to add a separate call**.

**What you DO need to add** is the protein-density check for routing: when `fromMenu === true`, the recipe may not be assigned to a valid protein. After the recipe is built, check:

```typescript
// Determine proteinId to save under
let finalProteinId = selectedProteinId || proteinId;
let finalProteinName = selectedProteinName || proteinName;
let finalProteinEmoji = selectedProteinEmoji || proteinEmoji;

// If no protein was selected (fromMenu skipped protein step), route to a generic bucket
if (!finalProteinId) {
  finalProteinId = 'my_recipes';
  finalProteinName = 'My Recipes';
  finalProteinEmoji = '📖';
}

// Check protein density if nutrition is available
if (aiNutrition && aiNutrition.calories > 0 && aiNutrition.proteinG > 0) {
  const density = (aiNutrition.proteinG / aiNutrition.calories) * 100;
  if (density < 6.4) {
    // Doesn't meet SpiceStrong threshold — save but show info
    Alert.alert(
      "Saved to My Recipes",
      `"${recipeName}" has been saved, but it doesn't meet our minimum protein density (6.4g per 100 cal). It's saved under My Recipes instead of ${finalProteinName}.`,
      [{ text: 'OK' }]
    );
    finalProteinId = 'my_recipes';
    finalProteinName = 'My Recipes';
    finalProteinEmoji = '📖';
  }
}
```

Note: The `aiNutrition` is typically populated by `submitRecipeForReview` in the background after save, so at the point of initial save it may be empty. In that case, skip the density check silently — classification will still happen in the background and if the recipe ends up in Supabase, `classifyAndEnrichRecipe` will add the correct tags.

For user-submitted recipes (manual entry or image import), `aiNutrition` is only populated if the user explicitly enters macro values in the wizard. If they didn't, skip the density check.

---

## Files to Modify (Summary)

| File | Change |
|------|--------|
| `components/ProfileMenu.tsx` | Add `handleAddRecipe` handler + `'Add Your Recipe'` menu item |
| `app/screens/RecipeListScreen.tsx` | Remove the "Add Your Recipe" `TouchableOpacity` block (lines 878–891) |
| `app/screens/AddRecipeScreen.tsx` | Add `'image_import'` wizard step, image picker, Claude Vision extraction, `fromMenu` param handling, protein picker for menu-entry path |

**No other files need to change.** The navigation stack auto-discovers routes. `classifyAndEnrichRecipe` and `submitRecipeForReview` already exist and work correctly.

---

## Critical Don'ts

- Do NOT modify `src/prompts/spiceBuilderPrompt.ts` — it's shared with `scripts/generate-recipes.js`
- Do NOT add a new route file — `AddRecipeScreen.tsx` is already routable
- Do NOT install any new packages — `expo-image-picker`, `expo-image`, `@expo/vector-icons`, and `expo-router` are all already installed
- Do NOT use `fetch` for image data — use `expo-image-picker`'s built-in `base64: true` option
- Do NOT use a `data:image/jpeg;base64,...` URI in the Claude API payload — pass only the raw base64 string
- Do NOT modify the Supabase schema — `my_recipes` is a client-side proteinId, not a DB table change; `classifyAndEnrichRecipe` will just fail gracefully if proteinId doesn't match a real protein

---

## Testing Checklist (after implementation)

1. Open app → tap profile icon → "Add Your Recipe" appears in menu
2. Tap "Add Your Recipe" from menu → `image_import` step shown with protein picker
3. Select a protein → upload a photo → "Extract Recipe from Photo" → loading state shown
4. Extraction completes → basics/ingredients/steps are pre-filled → user can edit each field
5. Submit → recipe saves correctly with the chosen protein
6. Open a protein page (e.g. Chicken) → "Add Your Recipe" button is GONE from the action row; only "Build with SpiceBuilder" remains
7. Edit button on user recipes in RecipeListScreen still works
8. Skip image → "enter manually" link → normal 5-step wizard appears unchanged
9. From protein page, tapping AI Builder still works (unchanged)
