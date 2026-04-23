# SpiceStrong API & Service Inventory

> Last updated: 2026-04-18

## Section 1: External Third-Party APIs

### Anthropic Claude

| Endpoint | Method | Model | Files | Purpose |
|----------|--------|-------|-------|---------|
| `api.anthropic.com/v1/messages` | POST | claude-sonnet-4-20250514 | AddRecipeScreen, AIRecipeBuilderScreen, ScanLabelScreen, ScanMenuScreen, MealPlanScreen, ProgressReportScreen, FitnessProfileScreen, recipeReviewService, fridgeScanService | Recipe generation, nutrition label reading, menu scanning, recipe review, fridge/receipt scanning |
| `api.anthropic.com/v1/messages` | POST | claude-haiku-4-5-20251001 | MyPantryScreen, GroceryListScreen, ingredientInfoService, fridgeScanService | Nutrition IQ reports, ingredient education, receipt/list scanning |

**Env vars**: `EXPO_PUBLIC_ANTHROPIC_KEY`

### Edamam

| Endpoint | Method | Files | Purpose |
|----------|--------|-------|---------|
| `api.edamam.com/api/nutrition-details` | POST | services/nutritionService.ts | Analyze ingredient list and return macronutrient breakdown |
| `api.edamam.com/api/food-database/v2/parser` | GET | app/screens/ScanLabelScreen.tsx | Barcode UPC lookup for nutrition data |
| `api.edamam.com/api/food-database/nutrients-from-image` | POST | services/edamamVisionService.ts | Food photo analysis for nutrition extraction |

**Env vars**: `EXPO_PUBLIC_EDAMAM_APP_ID`, `EXPO_PUBLIC_EDAMAM_APP_KEY`, `EXPO_PUBLIC_EDAMAM_FOOD_APP_ID`, `EXPO_PUBLIC_EDAMAM_FOOD_APP_KEY`

### fal.ai (Flux Image Generation)

| Endpoint | Method | Model | Files | Purpose |
|----------|--------|-------|-------|---------|
| `queue.fal.run/fal-ai/flux/dev` | POST | Flux Dev | services/imageGenerationService.ts | Hero dish images (~$0.025/image) |
| `queue.fal.run/fal-ai/flux/schnell` | POST | Flux Schnell | services/imageGenerationService.ts | Step cooking images (~$0.003/image) |

**Env vars**: `EXPO_PUBLIC_FAL_KEY`, `FAL_KEY`

### Open Food Facts (Free)

| Endpoint | Method | Files | Purpose |
|----------|--------|-------|---------|
| `world.openfoodfacts.org/api/v0/product/{barcode}.json` | GET | app/screens/ScanLabelScreen.tsx | Free barcode fallback when Edamam lookup fails |

**Env vars**: None (free, no key required)

### Unused / Dead Integrations

| Service | Env Var | Status |
|---------|---------|--------|
| ElevenLabs | `EXPO_PUBLIC_ELEVENLABS_KEY` | Defined in .env but never called in code |
| OpenAI | `EXPO_PUBLIC_OPENAI_KEY` | Defined in .env but never called in code |

---

## Section 2: Supabase Database Operations

**Client**: `@supabase/supabase-js` v2.99.1
**URL**: `EXPO_PUBLIC_SUPABASE_URL`
**Auth**: `EXPO_PUBLIC_SUPABASE_ANON_KEY` (client), `SUPABASE_SERVICE_ROLE_KEY` (scripts/admin)

### Tables

| Table | SELECT | INSERT | UPDATE | UPSERT | DELETE | Primary Files | Purpose |
|-------|:------:|:------:|:------:|:------:|:------:|---------------|---------|
| `recipes` | X | X | X | X | | recipeService.ts, RecipeListScreen.tsx | Store curated, AI, and user recipes |
| `recipe_images` | X | X | | | X | recipeService.ts, RecipeListScreen.tsx | Hero and step image URLs per recipe |
| `ratings` | X | | | X | | ratingsService.ts | Community 1-5 star ratings (device-based) |
| `reviews` | X | | | X | | ratingsService.ts | Text reviews with comments |
| `recipe_rating_summary` | X | | | | | ratingsService.ts | Aggregate rating view (DB view) |
| `meal_plan` | X | X | | | X | mealPlanService.ts | User meal plan entries by date |
| `user_dietary_restrictions` | X | X | X | | | dietaryService.ts | Allergy and dietary preference tags |
| `ingredient_info` | X | | | X | | ingredientInfoService.ts | Cached ingredient education (shared) |
| `barcode_cache` | X | | | X | | ScanLabelScreen.tsx | Cached barcode nutrition data (shared) |

### Storage

| Bucket | Operations | Files | Purpose |
|--------|-----------|-------|---------|
| `recipe-images` | Upload, getPublicUrl | recipeService.ts | Recipe hero and step images |

**Upload paths**: `{recipeId}/hero.png`, `{recipeId}/step_{N}.png`

### Direct REST API Usage

| Endpoint | Method | Files | Purpose |
|----------|--------|-------|---------|
| `{SUPABASE_URL}/rest/v1/recipes?id=eq.{id}` | PATCH | RecipeListScreen.tsx | Admin soft-delete (bypass RLS with service key) |

---

## Section 3: Supabase Edge Functions

**None** — all API calls are made client-side. No edge functions exist in `supabase/functions/`.

> **Security note**: API keys (Anthropic, Edamam, fal.ai) are exposed in the client bundle via `EXPO_PUBLIC_*` env vars. For production hardening, consider moving sensitive API calls behind Supabase Edge Functions.

---

## Section 4: Summary Statistics

| Metric | Count |
|--------|-------|
| External API providers (active) | **4** (Anthropic, Edamam, fal.ai, Open Food Facts) |
| External API providers (unused) | **2** (ElevenLabs, OpenAI) |
| Distinct external API endpoints | **7** |
| Supabase tables | **9** |
| Supabase storage buckets | **1** |
| Supabase Edge Functions | **0** |
| Client-side API calls | **All** |
| Active environment variables | **10** |
| Unused environment variables | **2** |

### Cost Breakdown Per Feature

| Feature | APIs Used | Approx Cost Per Use |
|---------|----------|-------------------|
| AI Recipe (SpiceBuilder) | Claude Sonnet + fal.ai Dev + fal.ai Schnell | ~$0.09 |
| Nutrition Label Scan (photo) | Claude Sonnet + Claude Sonnet (summary) | ~$0.03 |
| Nutrition Label Scan (barcode) | Edamam/OFF + Claude Sonnet (summary) | ~$0.01 |
| Restaurant Menu Scan | Claude Sonnet | ~$0.03 |
| Meal Plan Generation | Claude Sonnet | ~$0.05 |
| Nutrition IQ Report | Claude Haiku | ~$0.003 |
| Ingredient Info Lookup | Claude Haiku (first time, then cached) | ~$0.003 |
| Recipe Review/Validation | Claude Sonnet (text + vision) | ~$0.05 |
| Fridge/Receipt/List Scan | Claude Haiku | ~$0.01 |
| Curated Recipe (browsing) | Supabase only | $0 |

---

## Section 5: Dependency Map

### SpiceBuilder AI Recipe
```
User selects protein/cuisine/macros
  -> Claude Sonnet (generate recipe JSON)
  -> Edamam Nutrition API (validate macros)
  -> Supabase: recipes (INSERT)
  -> fal.ai Flux Dev (hero image) [background]
  -> fal.ai Flux Schnell (step images) [background]
  -> Supabase: recipe_images (INSERT)
  -> Supabase Storage: recipe-images bucket (UPLOAD)
```

### Nutrition Label Scanner
```
User photographs label OR scans barcode
  Photo path:
    -> Claude Sonnet Vision (extract nutrition + ingredients)
    -> Claude Sonnet (AI summary with protein tier rating)
  Barcode path:
    -> Supabase: barcode_cache (SELECT - check cache first)
    -> Edamam Food DB (barcode UPC lookup)
    -> Open Food Facts (fallback if Edamam misses)
    -> Supabase: barcode_cache (UPSERT - save for future)
    -> Claude Sonnet (AI summary)
```

### Restaurant Menu Scanner
```
User photographs restaurant menu
  -> Claude Sonnet Vision (extract menu items + nutrition)
```

### Recipe Import from Photo
```
User photographs cookbook/recipe card
  -> Claude Sonnet Vision (extract recipe)
  -> Claude Sonnet (auto-fix for protein standards)
  -> Edamam Nutrition API (validate macros)
  -> fal.ai Flux (hero + step images) [background]
  -> Supabase: recipes (INSERT)
```

### Meal Plan Generation
```
User sets calorie/protein targets
  -> Claude Sonnet (generate weekly plan)
  -> Supabase: meal_plan (INSERT)
```

### Ingredient Education
```
User taps ingredient in pantry/shopping list
  -> Supabase: ingredient_info (SELECT - check cache)
  -> Claude Haiku (generate education text) [on cache miss]
  -> Supabase: ingredient_info (UPSERT - save for all users)
```

### Nutrition IQ Reports
```
User taps "Nutrition IQ" on pantry/shopping screen
  -> Claude Haiku (analyze items against protein quality tiers)
```

### Fridge / Receipt / List Scanner
```
User photographs fridge, receipt, or handwritten list
  -> Claude Haiku Vision (identify items)
  -> AsyncStorage: pantry or grocery list (SAVE)
```

### Community Ratings
```
User rates a recipe after cooking
  -> Supabase: ratings (UPSERT)
  -> Supabase: reviews (UPSERT)
  -> Supabase: recipe_rating_summary (SELECT - display)
```

### Freemium Limits
```
User triggers AI feature
  -> AsyncStorage: usage count (CHECK)
  -> If limit reached: show PaywallModal
  -> If allowed: proceed + AsyncStorage: usage count (INCREMENT)
```

---

## Section 6: File Reference

### Services with API Integrations (8 files)

| File | APIs |
|------|------|
| `services/supabase.ts` | Supabase client init |
| `services/recipeService.ts` | Supabase (recipes, images, storage) |
| `services/nutritionService.ts` | Edamam Nutrition Details |
| `services/edamamVisionService.ts` | Edamam Food Photo |
| `services/imageGenerationService.ts` | fal.ai Flux (Dev + Schnell) |
| `services/ingredientInfoService.ts` | Claude Haiku + Supabase cache |
| `services/fridgeScanService.ts` | Claude Sonnet/Haiku Vision |
| `services/recipeReviewService.ts` | Claude Sonnet (text + vision) |

### Screens with Direct API Calls (10 files)

| File | APIs |
|------|------|
| `app/screens/AddRecipeScreen.tsx` | Claude Sonnet |
| `app/screens/AIRecipeBuilderScreen.tsx` | Claude Sonnet, fal.ai |
| `app/screens/ScanLabelScreen.tsx` | Claude Sonnet, Edamam, Open Food Facts, Supabase |
| `app/screens/ScanMenuScreen.tsx` | Claude Sonnet |
| `app/screens/MealPlanScreen.tsx` | Claude Sonnet, Edamam |
| `app/screens/MyPantryScreen.tsx` | Claude Haiku |
| `app/screens/GroceryListScreen.tsx` | Claude Haiku |
| `app/screens/FitnessProfileScreen.tsx` | Claude Sonnet |
| `app/screens/ProgressReportScreen.tsx` | Claude Sonnet |
| `app/screens/RecipeListScreen.tsx` | Supabase REST |

### Scripts with API Integrations (4 files)

| File | APIs |
|------|------|
| `scripts/generate-recipes.js` | Claude Sonnet |
| `scripts/onboard-recipes-v2.js` | Supabase, fal.ai, Claude, Edamam |
| `scripts/regenerate-step-images.js` | Supabase, fal.ai |
| `scripts/pipeline/getNutrition.js` | Edamam |

---

## Section 7: Caching Strategy

| Data | Local Cache | Shared Cache | TTL |
|------|------------|-------------|-----|
| Recipes per protein | AsyncStorage | Supabase | 1 hour |
| Recipe images | expo-file-system | Supabase Storage | Permanent |
| Ingredient info | AsyncStorage | Supabase `ingredient_info` | Permanent |
| Barcode nutrition | - | Supabase `barcode_cache` | Permanent |
| Dietary restrictions | AsyncStorage | Supabase | Session |
| Meal plans | AsyncStorage | Supabase | Per date |
| Usage counts | AsyncStorage | - | Monthly (free) / Yearly (premium) |
| Device ID | AsyncStorage | - | Permanent |
