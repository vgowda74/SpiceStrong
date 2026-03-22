# SpiceStrong Recipe Data Model

Complete reference for every recipe-related type, interface, JSONB structure, and database column used across the app, services, and pipeline scripts.

---

## Table of Contents

1. [Core TypeScript Types](#1-core-typescript-types)
2. [Store Types (AsyncStorage)](#2-store-types-asyncstorage)
3. [Built-In Recipe Types](#3-built-in-recipe-types)
4. [Supabase Service Types](#4-supabase-service-types)
5. [Ratings & Reviews Types](#5-ratings--reviews-types)
6. [Image Types](#6-image-types)
7. [Fingerprint Types](#7-fingerprint-types)
8. [Pipeline Return Types](#8-pipeline-return-types)
9. [Database Schema (39 Columns)](#9-database-schema-39-columns)
10. [JSONB Column Structures](#10-jsonb-column-structures)
11. [Real Data Examples](#11-real-data-examples)
12. [Data Flow Across Layers](#12-data-flow-across-layers)

---

## 1. Core TypeScript Types

**File:** `src/types/index.ts`

```typescript
export interface Protein {
  id: string;                    // "chicken", "paneer", "fish", etc.
  name: string;                  // "Chicken", "Paneer"
  emoji: string;                 // "🍗", "🧀"
  category: 'meat' | 'seafood' | 'vegetarian';
}

export interface Ingredient {
  name: string;                  // "Chicken breast"
  quantity: string;              // "500 g"
}

export interface CookingStep {
  id: string;
  title: string;                 // "Sauté Aromatics"
  description: string;           // "Heat oil and add cumin seeds..."
  timerSeconds?: number;         // 300 (5 minutes)
}

export interface Recipe {
  id: string;
  name: string;
  proteinId: string;
  proteinGrams: number;
  calories: number;
  ingredients: { [servingSize: string]: Ingredient[] };
  steps: CookingStep[];
  chefTip?: string;
  isCustom: boolean;
}

export type RootStackParamList = {
  Splash: undefined;
  ProteinSelection: undefined;
  RecipeList: { proteinId: string };
  RecipeDetail: { recipeId: string };
  CookingMode: { recipeId: string };
  CustomRecipe: { proteinId: string };
};
```

> **Note:** This `Recipe` interface is the original v1 type. The app primarily uses `SavedRecipe` (from store) and `BuiltInRecipe` (from data) which extend it with more fields.

---

## 2. Store Types (AsyncStorage)

**File:** `src/store/recipes.ts`

```typescript
// ─── Constants ───
export const QUANTITY_TIERS = ['2-3 servings', '4-6 servings'] as const;
export type QuantityTier = (typeof QUANTITY_TIERS)[number];

export const SERVINGS_PER_TIER: Record<QuantityTier, number> = {
  '2-3 servings': 2.5,
  '4-6 servings': 5,
};

export const TIER_FACTOR: Record<QuantityTier, number> = {
  '2-3 servings': 1,
  '4-6 servings': 2,
};

// ─── Types ───
export type MealType = 'breakfast' | 'lunch_dinner' | 'snack_dessert';

export type IngredientsByTier = Record<QuantityTier, { name: string; quantity: string }[]>;

export interface IngredientGroup {
  emoji: string;                 // "🧅"
  category: string;              // "Aromatics"
  items: { name: string; quantity: string }[];
}

export interface CookingStep {
  title: string;                 // "Sauté Aromatics"
  description: string;           // "Heat oil in a pan. Add cumin seeds..."
  emoji?: string;                // "🧅"
  timerMinutes?: number;         // 5
  tip?: string;                  // "Don't let the garlic burn"
  ingredientsUsed?: string;      // "Oil, Cumin seeds, Onion" (comma-separated names)
  cookingMethod?: string;        // "stir-fry"
}

export interface SavedRecipe {
  id: string;                    // "curated-chicken-pepper-chicken"
  name: string;                  // "SpiceStrong Pepper Chicken"
  proteinId: string;             // "chicken"
  proteinName: string;           // "Chicken"
  proteinEmoji: string;          // "🍗"
  description?: string;          // "Tender chicken with bold pepper flavor..."
  ingredients: IngredientsByTier; // { "2-3 servings": [...], "4-6 servings": [...] }
  steps: CookingStep[];
  chefTip: string;               // "Toast the peppercorns for extra aroma"
  createdAt: number;             // Date.now() timestamp
  mealType?: MealType;
  status?: 'building' | 'ready'; // "building" while AI generates
  communityCookCount?: number;   // From Supabase cook_count
  aiNutrition?: {
    calories: number;
    proteinG: number;
    fatG: number;
    carbsG: number;
    fiberG: number;
    sugarG: number;
    sodiumMg: number;
  };
}
```

---

## 3. Built-In Recipe Types

**File:** `src/data/builtInRecipes.ts`

```typescript
export interface NutritionInfo {
  calories: number;              // Per "2-3 servings" batch (divide by 2.5 for per-serving)
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  cholesterolMg?: number;
  saturatedFatG?: number;
  ironMg?: number;
  calciumMg?: number;
}

export interface BuiltInRecipe extends SavedRecipe {
  timeMinutes: number;           // 30
  difficulty: 'Easy' | 'Medium' | 'Hard';
  proteinPer100g: number;        // 31 (grams protein per 100g of main ingredient)
  gradient: readonly [string, string]; // ["#5D1E0F", "#C0392B"]
  caloriesPerServing?: number;
  proteinGPerServing?: number;
  netCarbsG?: number;
  nutrition?: NutritionInfo;
}
```

### Protein Master List

**File:** `src/theme/index.ts`

| id | name | emoji | proteinPer100g | category |
|----|------|-------|----------------|----------|
| chicken | Chicken | 🍗 | 31 | meat |
| fish | Fish | 🐟 | 22 | seafood |
| lamb | Lamb | 🥩 | 26 | meat |
| goat | Goat | 🐐 | 27 | meat |
| pork | Pork | 🥩 | 27 | meat |
| beef | Beef | 🥩 | 26 | meat |
| prawns | Prawns | 🦐 | 24 | seafood |
| eggs | Eggs | 🥚 | 13 | vegetarian |
| paneer | Paneer | 🧀 | 18 | vegetarian |
| tofu | Tofu | 🟫 | 17 | vegetarian |
| soy | Soy | 🫘 | 36 | vegetarian |
| beans | Beans & Lentils | 🫘 | 22 | vegetarian |
| milk | Dairy | 🥛 | 3 | vegetarian |
| whey | Protein Powder | 💪 | 80 | vegetarian |

---

## 4. Supabase Service Types

**File:** `services/recipeService.ts`

```typescript
interface SupabaseRecipeRow {
  id: string;
  name: string;
  protein_id: string;
  protein_name: string;
  protein_emoji: string;
  description: string | null;
  chef_tip: string | null;
  meal_type: string | null;
  ingredients: unknown;          // JSONB → IngredientsByTier
  steps: unknown;                // JSONB → CookingStep[]
  time_minutes: number | null;
  difficulty: string | null;
  protein_per_100g: number | null;
  gradient: unknown;             // JSONB → [string, string]
  nutrition: unknown;            // JSONB → NutritionInfo
  ai_nutrition: unknown;         // JSONB → aiNutrition
  source: 'curated' | 'ai';
  is_active: boolean;
  is_pro: boolean;
  spice_level: string | null;
  cuisine: string | null;
  status: string | null;
  device_id: string | null;
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
  cook_count?: number;
  recipe_images?: SupabaseImageRow[];
}

interface SupabaseImageRow {
  id: string;                    // UUID
  recipe_id: string;             // FK → recipes.id
  image_type: 'hero' | 'step' | 'ingredient';
  step_index: number | null;     // 0-based for steps, null for hero
  storage_url: string;           // Supabase Storage public URL
}

interface RecipeImageUrls {
  heroUrl: string | null;
  stepUrls: Record<number, string>;  // { 0: "https://...", 1: "https://..." }
}

export interface RecipeSyncResult {
  success: boolean;
  duplicate?: boolean;           // true if fingerprint collision (Postgres 23505)
  message?: string;
}
```

---

## 5. Ratings & Reviews Types

**File:** `services/ratingsService.ts`

```typescript
export interface ReviewItem {
  id: string;
  username: string;              // "Chef_abc123"
  rating: number;                // 1-5
  comment: string;
  createdAt: string;             // ISO date string
}

export interface RecipeRatings {
  averageRating: number;         // 0-5
  totalCount: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;  // { 1: 0, 2: 1, 3: 5, 4: 12, 5: 8 }
  reviews: ReviewItem[];
}

// Default empty state
const EMPTY_RATINGS: RecipeRatings = {
  averageRating: 0,
  totalCount: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  reviews: [],
};
```

---

## 6. Image Types

**File:** `services/imageGenerationService.ts`

```typescript
export interface ImageResult {
  url: string | null;
  error?: string;
}

export interface RecipeImageResults {
  dishImage: string | null;                        // Local file URI for hero
  ingredientImages: Record<string, string | null>; // ingredient_name → URI
  stepImages: Record<string, string | null>;       // step_index → URI
}
```

**File:** `src/data/recipeImages.ts`

```typescript
export interface RecipeImageSet {
  card: ImageSourcePropType;                       // require('./hero.jpg')
  steps: Record<number, ImageSourcePropType>;      // { 0: require('./step_0.jpg') }
}
```

---

## 7. Fingerprint Types

**File:** `src/utils/recipeFingerprint.ts` (client — expo-crypto)
**File:** `scripts/lib/recipeFingerprint.js` (server — Node.js crypto)

```typescript
interface IngredientItem {
  name?: string;
  ingredient_name?: string;      // Alternative field name
  quantity?: string;
}

type IngredientsByTier = Record<string, IngredientItem[]>;

interface FingerprintableRecipe {
  ingredients: IngredientItem[] | IngredientsByTier;
  steps: unknown[];              // Only .length is used
}
```

**Algorithm:**
```
fingerprint = SHA256(
  sorted_normalized_ingredient_names.join('|') + '|' + step_count
)
```

- Ingredient names: lowercased, trimmed, deduplicated
- Quantities stripped — only core ingredient name matters
- Tiered ingredients: uses "2-3 servings" tier
- Handles both `{ name }` and `{ ingredient_name }` data shapes

---

## 8. Pipeline Return Types

### Classification (Claude API)

**File:** `scripts/pipeline/classifyRecipe.js`

```javascript
// classifyRecipe(recipeName, ingredients, instructions) returns:
{
  cuisine_type: string,
  // Allowed: "Indian", "South Indian", "North Indian", "Korean", "Japanese",
  //   "Chinese", "Vietnamese", "Thai", "Filipino", "Mediterranean", "Italian",
  //   "Greek", "Lebanese", "Turkish", "American", "Mexican", "Brazilian", "AI Fusion"

  spice_level: string,
  // Allowed: "No spice", "Mild", "Medium", "Hot", "Extra hot"

  difficulty: string,
  // Allowed: "Beginner", "Intermediate", "Advanced", "Chef level"
  // ⚠️ Must be mapped before DB insert:
  //   Beginner → Easy, Intermediate → Medium, Advanced → Hard, Chef level → Hard

  cook_time_bucket: string,
  // Allowed: "Under 15 min", "15-30 min", "30-60 min", "1-2 hours", "2+ hours"

  meal_type: string[],
  // Allowed: ["Breakfast", "Lunch", "Dinner", "Snack", "Pre-workout",
  //   "Post-workout", "Meal prep", "Bulk cooking"]

  dietary_tags: string[],
  // Allowed: ["High protein", "Low fat", "Low carb", "Keto", "Low calorie",
  //   "Low cholesterol", "Low sodium", "Low sugar", "High fiber"]
  // Threshold: "High protein" only if >= 30g/serving

  allergen_tags: string[],
  // Allowed: ["Gluten free", "Dairy free", "Nut free", "Egg free", "Soy free",
  //   "Shellfish free", "Vegetarian", "Vegan", "Paleo", "Whole30"]
  // Uses "free-from" labels (not "contains" labels)

  cooking_method: string,
  // Allowed: "Grilled", "Baked", "Stovetop", "Air fryer", "Slow cooker",
  //   "Instant pot", "Steamed", "Stir-fried", "Raw / No cook", "Smoked",
  //   "Broiled", "Pan-seared"

  fitness_goal: string[],
  // Allowed: ["Muscle gain", "Fat loss", "Maintenance", "Endurance",
  //   "Recovery", "Weight loss", "Body recomp"]

  storage_tags: string[],
  // Allowed: ["Freezer friendly", "Fridge 3-5 days", "Make ahead",
  //   "Meal prep ready", "Kid friendly", "Office lunch"]
}
```

### Nutrition (Edamam API)

**File:** `scripts/pipeline/getNutrition.js`

```javascript
// getNutrition(ingredientStrings, servings) returns:
{
  calories: number,       // per serving, rounded integer
  protein_g: number,      // per serving, 1 decimal place
  carbs_g: number,        // per serving, 1 decimal place
  fat_g: number,          // per serving, 1 decimal place
  fiber_g: number,        // per serving, 1 decimal place
}
```

---

## 9. Database Schema (39 Columns)

### `recipes` Table

| # | Column | Type | Nullable | Default | Constraint | Source |
|---|--------|------|----------|---------|------------|--------|
| 1 | id | TEXT | NO | — | PRIMARY KEY | All |
| 2 | name | TEXT | NO | — | — | All |
| 3 | protein_id | TEXT | NO | — | — | All |
| 4 | protein_name | TEXT | NO | — | — | All |
| 5 | protein_emoji | TEXT | NO | '' | — | All |
| 6 | description | TEXT | YES | — | — | All |
| 7 | chef_tip | TEXT | YES | — | — | Curated |
| 8 | meal_type | TEXT | YES | — | CHECK: breakfast/lunch_dinner/snack_dessert | All |
| 9 | ingredients | JSONB | NO | '{}' | — | All |
| 10 | steps | JSONB | NO | '[]' | — | All |
| 11 | time_minutes | INT | YES | — | — | All |
| 12 | difficulty | TEXT | YES | — | CHECK: Easy/Medium/Hard | All |
| 13 | protein_per_100g | NUMERIC | YES | — | — | Curated |
| 14 | gradient | JSONB | YES | — | — | Curated |
| 15 | nutrition | JSONB | YES | — | — | Curated |
| 16 | ai_nutrition | JSONB | YES | — | — | AI |
| 17 | source | TEXT | NO | 'curated' | CHECK: curated/ai | All |
| 18 | is_active | BOOLEAN | NO | true | — | All |
| 19 | is_pro | BOOLEAN | NO | false | — | All |
| 20 | spice_level | TEXT | YES | — | — | Pipeline |
| 21 | cuisine | TEXT | YES | — | — | Legacy |
| 22 | device_id | TEXT | YES | — | — | AI |
| 23 | status | TEXT | YES | — | CHECK: building/ready | All |
| 24 | cook_count | INT | NO | 0 | — | Runtime |
| 25 | tags | JSONB | YES | — | — | Legacy |
| 26 | fingerprint | TEXT | YES | — | Partial UNIQUE (WHERE NOT NULL) | Pipeline |
| 27 | created_at | TIMESTAMPTZ | NO | now() | — | Auto |
| 28 | serving_size | TEXT | YES | — | — | Pipeline |
| 29 | recipe_source | TEXT | YES | 'native' | — | Pipeline |
| 30 | cuisine_type | TEXT | YES | — | B-tree index | Pipeline |
| 31 | cook_time_bucket | TEXT | YES | — | B-tree index | Pipeline |
| 32 | meal_type_tags | JSONB | YES | — | GIN index | Pipeline |
| 33 | dietary_tags | JSONB | YES | — | GIN index | Pipeline |
| 34 | allergen_tags | JSONB | YES | — | GIN index | Pipeline |
| 35 | cooking_method | TEXT | YES | — | B-tree index | Pipeline |
| 36 | fitness_goal | JSONB | YES | — | GIN index | Pipeline |
| 37 | storage_tags | JSONB | YES | — | — | Pipeline |
| 38 | calories | INTEGER | YES | — | B-tree index | Pipeline |
| 39 | protein_g | NUMERIC | YES | — | B-tree index | Pipeline |
| 40 | carbs_g | NUMERIC | YES | — | — | Pipeline |
| 41 | fat_g | NUMERIC | YES | — | — | Pipeline |
| 42 | fiber_g | NUMERIC | YES | — | — | Pipeline |
| 43 | community_rating | NUMERIC | YES | 0 | — | Runtime |
| 44 | review_count | INTEGER | YES | 0 | — | Runtime |
| 45 | is_ai_generated | BOOLEAN | YES | false | — | Pipeline |
| 46 | is_published | BOOLEAN | YES | false | — | Pipeline |

### `recipe_images` Table

| Column | Type | Nullable | Constraint |
|--------|------|----------|------------|
| id | UUID | NO | PRIMARY KEY, auto-generated |
| recipe_id | TEXT | NO | FK → recipes.id ON DELETE CASCADE |
| image_type | TEXT | NO | CHECK: hero/step/ingredient |
| step_index | INT | YES | null for hero, 0-based for steps |
| storage_url | TEXT | NO | Supabase Storage public URL |
| created_at | TIMESTAMPTZ | NO | DEFAULT now() |

**Unique constraint:** `(recipe_id, image_type, step_index)`

---

## 10. JSONB Column Structures

### `ingredients` — IngredientsByTier

```json
{
  "2-3 servings": [
    { "name": "Chicken breast", "quantity": "500 g" },
    { "name": "Ginger-garlic paste", "quantity": "1 tsp" },
    { "name": "Kashmiri red chili powder", "quantity": "2 tsp" },
    { "name": "Salt", "quantity": "to taste" }
  ],
  "4-6 servings": [
    { "name": "Chicken breast", "quantity": "1 kg" },
    { "name": "Ginger-garlic paste", "quantity": "2 tsp" },
    { "name": "Kashmiri red chili powder", "quantity": "4 tsp" },
    { "name": "Salt", "quantity": "to taste" }
  ]
}
```

**Alternate format** (pipeline-inserted recipes):
```json
["400g chicken breast", "2 tsp black pepper", "1 tbsp olive oil"]
```

### `steps` — CookingStep[]

```json
[
  {
    "emoji": "🥩",
    "title": "Marinate the Chicken",
    "description": "In a bowl, combine chicken with turmeric, chili powder, and salt. Mix well and set aside for 10 minutes.",
    "timerMinutes": 10,
    "tip": "Score the chicken pieces for better marinade absorption",
    "ingredientsUsed": "Chicken breast, Turmeric powder, Red chili powder, Salt",
    "cookingMethod": "marinate"
  },
  {
    "emoji": "🧅",
    "title": "Sauté Aromatics",
    "description": "Heat 1 tbsp oil in a pan. Add cumin seeds and let them splutter. Add chopped onions and cook until golden brown.",
    "timerMinutes": 5,
    "ingredientsUsed": "Oil, Cumin seeds, Onion",
    "cookingMethod": "stir-fry"
  }
]
```

### `nutrition` — NutritionInfo

Per **batch** (2-3 servings). Divide by 2.5 for per-serving values.

```json
{
  "calories": 285,
  "proteinG": 38,
  "fatG": 10,
  "carbsG": 12,
  "fiberG": 4,
  "sugarG": 6,
  "sodiumMg": 520,
  "cholesterolMg": 85,
  "saturatedFatG": 2,
  "ironMg": 4.2,
  "calciumMg": 180
}
```

### `gradient` — Color Pair

```json
["#5D1E0F", "#C0392B"]
```

### `dietary_tags` — String Array (GIN indexed)

```json
["High protein", "Low fat", "Low carb"]
```

### `allergen_tags` — String Array (GIN indexed)

```json
["Gluten free", "Nut free", "Egg free", "Soy free", "Shellfish free"]
```

### `meal_type_tags` — String Array (GIN indexed)

```json
["Lunch", "Dinner", "Meal prep"]
```

### `fitness_goal` — String Array (GIN indexed)

```json
["Muscle gain", "Fat loss", "Body recomp"]
```

### `storage_tags` — String Array

```json
["Freezer friendly", "Fridge 3-5 days", "Make ahead", "Meal prep ready"]
```

---

## 11. Real Data Examples

### Complete Curated Recipe (from Supabase)

```json
{
  "id": "curated-chicken-highprotein-murgh-saagwala-chicken-in-green-spinac",
  "name": "High-Protein Murgh Saagwala (Chicken in Green Spinach Gravy)",
  "protein_id": "chicken",
  "protein_name": "Chicken",
  "protein_emoji": "🍗",
  "description": "Tender chicken pieces simmered in a vibrant, creamy spinach gravy with authentic Indian spices. A protein-packed, low-fat version of the classic dish.",
  "chef_tip": null,
  "meal_type": "lunch_dinner",

  "ingredients": {
    "2-3 servings": [
      { "name": "Boneless chicken breast", "quantity": "500 g" },
      { "name": "Fresh spinach (palak)", "quantity": "300 g" },
      { "name": "Onion (finely chopped)", "quantity": "1 medium" },
      { "name": "Tomato (chopped)", "quantity": "1 medium" },
      { "name": "Ginger-garlic paste", "quantity": "1 tbsp" },
      { "name": "Green chili", "quantity": "1-2" },
      { "name": "Turmeric powder", "quantity": "0.5 tsp" },
      { "name": "Red chili powder", "quantity": "1 tsp" },
      { "name": "Coriander powder", "quantity": "1 tsp" },
      { "name": "Garam masala", "quantity": "0.5 tsp" },
      { "name": "Cumin seeds", "quantity": "1 tsp" },
      { "name": "Oil", "quantity": "1 tbsp" },
      { "name": "Salt", "quantity": "to taste" }
    ],
    "4-6 servings": [
      { "name": "Boneless chicken breast", "quantity": "1 kg" },
      { "name": "Fresh spinach (palak)", "quantity": "600 g" }
    ]
  },

  "steps": [
    {
      "emoji": "🥩",
      "title": "Marinate the Chicken",
      "description": "In a bowl, mix chicken pieces with turmeric, red chili powder, and salt. Set aside for 10 minutes.",
      "timerMinutes": 10,
      "cookingMethod": "marinate",
      "ingredientsUsed": "Chicken breast, Turmeric powder, Red chili powder, Salt"
    },
    {
      "emoji": "🥬",
      "title": "Blanch the Spinach",
      "description": "Boil spinach for 2 minutes, drain, and blend into a smooth paste with green chili.",
      "timerMinutes": 3,
      "cookingMethod": "boil",
      "ingredientsUsed": "Fresh spinach, Green chili"
    }
  ],

  "gradient": ["#5D1E0F", "#C0392B"],
  "nutrition": {
    "fatG": 10, "carbsG": 12, "fiberG": 4, "ironMg": 4.2,
    "sugarG": 6, "calories": 285, "proteinG": 38, "sodiumMg": 520,
    "calciumMg": 180, "cholesterolMg": 85, "saturatedFatG": 2
  },
  "ai_nutrition": {},

  "time_minutes": 35,
  "difficulty": "Medium",
  "protein_per_100g": 31,
  "source": "curated",
  "is_active": true,
  "is_pro": false,
  "device_id": null,
  "status": "ready",
  "cook_count": 0,
  "spice_level": "Medium",
  "tags": [],
  "fingerprint": null,

  "cuisine_type": "Indian",
  "cook_time_bucket": "30-60 min",
  "meal_type_tags": ["Lunch", "Dinner", "Meal prep"],
  "dietary_tags": ["High protein", "Low fat", "Low carb"],
  "allergen_tags": ["Gluten free", "Nut free", "Egg free", "Soy free", "Shellfish free"],
  "cooking_method": "Stovetop",
  "fitness_goal": ["Muscle gain", "Fat loss", "Body recomp"],
  "storage_tags": ["Freezer friendly", "Fridge 3-5 days", "Make ahead", "Meal prep ready"],
  "calories": 411,
  "protein_g": 52.4,
  "carbs_g": 14.6,
  "fat_g": 16.5,
  "fiber_g": 5.9,

  "serving_size": null,
  "recipe_source": "native",
  "community_rating": 0,
  "review_count": 0,
  "is_ai_generated": false,
  "is_published": false,
  "created_at": "2026-03-21T11:48:29.923002+00:00"
}
```

### Recipe Image Rows

```json
[
  {
    "id": "a1b2c3d4-...",
    "recipe_id": "curated-chicken-highprotein-murgh-saagwala-chicken-in-green-spinac",
    "image_type": "hero",
    "step_index": null,
    "storage_url": "https://dqghnktxrhsvdkgcjsmc.supabase.co/storage/v1/object/public/recipe-images/.../hero.jpg",
    "created_at": "2026-03-21T11:48:30.123+00:00"
  },
  {
    "id": "e5f6g7h8-...",
    "recipe_id": "curated-chicken-highprotein-murgh-saagwala-chicken-in-green-spinac",
    "image_type": "step",
    "step_index": 0,
    "storage_url": "https://dqghnktxrhsvdkgcjsmc.supabase.co/storage/v1/object/public/recipe-images/.../step_0.jpg",
    "created_at": "2026-03-21T11:48:31.456+00:00"
  }
]
```

---

## 12. Data Flow Across Layers

### Recipe ID Patterns

| Source | ID Format | Example |
|--------|-----------|---------|
| Curated (Excel) | `curated-{protein_id}-{slug}` | `curated-chicken-pepper-chicken` |
| AI (user-generated) | `ai-{protein_id}-{timestamp}` | `ai-paneer-1711012345678` |
| Pipeline (ingested) | `native-{slug}` | `native-pepper-chicken` |

### Field Name Mapping (TypeScript → Supabase)

| TypeScript (SavedRecipe) | Supabase Column | Notes |
|--------------------------|-----------------|-------|
| `proteinId` | `protein_id` | camelCase → snake_case |
| `proteinName` | `protein_name` | |
| `proteinEmoji` | `protein_emoji` | |
| `chefTip` | `chef_tip` | |
| `mealType` | `meal_type` | |
| `timeMinutes` | `time_minutes` | Only on BuiltInRecipe |
| `proteinPer100g` | `protein_per_100g` | Only on BuiltInRecipe |
| `communityCookCount` | `cook_count` | |
| `aiNutrition` | `ai_nutrition` | |
| `createdAt` | `created_at` | number (ms) → ISO string |

### Nutrition: Two Sources, Two Columns

| Column | Source | Scope | Used By |
|--------|--------|-------|---------|
| `nutrition` (JSONB) | Excel spreadsheet | Per batch (2-3 servings) | Curated recipes, NutritionCard |
| `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g` | Edamam API | Per serving | Pipeline-enriched recipes |
| `ai_nutrition` (JSONB) | Claude API estimate | Per serving | AI-generated recipes |

### Difficulty Mapping (Pipeline → DB)

| Claude Returns | DB Stores | Mapping |
|----------------|-----------|---------|
| Beginner | Easy | `DIFFICULTY_MAP['Beginner']` |
| Intermediate | Medium | `DIFFICULTY_MAP['Intermediate']` |
| Advanced | Hard | `DIFFICULTY_MAP['Advanced']` |
| Chef level | Hard | `DIFFICULTY_MAP['Chef level']` |

### Serving Tier Math

| Tier | Servings | Factor | To get per-serving nutrition |
|------|----------|--------|------------------------------|
| 2-3 servings | 2.5 | 1× | `nutrition.calories / 2.5` |
| 4-6 servings | 5.0 | 2× | `nutrition.calories / 5.0` |

---

## Deprecated / Removed Columns

| Column | Status | Replaced By |
|--------|--------|-------------|
| `macro_tags` | DROPPED | Live numeric filtering from `protein_g`, `fat_g`, etc. |
| `allergens` | RENAMED | `allergen_tags` (migration: update_classification_tags.sql) |
| `tags` | Legacy | `dietary_tags`, `allergen_tags`, `fitness_goal` (pipeline columns) |
| `cuisine` | Legacy | `cuisine_type` (pipeline column, more specific values) |
