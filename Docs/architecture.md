# SpiceStrong Architecture

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React Native | 0.81.5 |
| Platform | Expo | 54.0.33 |
| Routing | Expo Router (file-based) | 6.0.23 |
| Language | TypeScript (strict mode) | 5.9.2 |
| Backend | Supabase (PostgreSQL) | 2.99.1 |
| AI Classification | Claude API (Anthropic) | claude-sonnet-4-20250514 |
| AI Images | fal.ai (step images) + OpenAI DALL-E 3 (hero images) | — |
| Voice/TTS | ElevenLabs API (primary) + expo-speech (fallback) | — |
| Nutrition | Edamam Nutrition Analysis API (USDA-backed) | Basic tier |
| State | AsyncStorage (no Redux/Zustand/Context) | — |
| Animations | react-native-reanimated + gesture-handler | — |
| Notifications | expo-notifications | — |
| Fonts | Playfair Display 700 Bold (custom) | — |

**Not used:** Redux, Zustand, Context API, Firebase, web routing

---

## Folder Structure

```
SpiceStrong/
├── app/                              # Expo Router — file-based routing
│   ├── _layout.tsx                   # Root stack navigator + app startup
│   ├── index.tsx                     # Splash/landing screen
│   ├── modal.tsx                     # Generic modal (unused)
│   ├── (tabs)/                       # Bottom tab navigation
│   │   ├── _layout.tsx               # Tab bar config (Home + Explore)
│   │   ├── index.tsx                 # Home tab
│   │   └── explore.tsx               # Explore tab
│   └── screens/                      # All app screens
│       ├── ProteinSelectionScreen    # Select protein type (14 categories)
│       ├── RecipeListScreen          # Browse recipes by protein
│       ├── RecipeOverviewScreen      # Recipe detail + ingredient tiers
│       ├── CookingStartScreen        # Pre-cook prep + shopping list
│       ├── IngredientChecklistScreen # Ingredient checklist with cart
│       ├── CookingModeScreen         # Step-by-step guided cooking
│       ├── AIRecipeBuilderScreen     # AI recipe generation form
│       ├── AIRecipeResultScreen      # AI recipe output display
│       ├── CustomRecipeScreen        # Manual recipe entry
│       ├── AddRecipeScreen           # Alias for CustomRecipeScreen
│       ├── FeedbackScreen            # Post-cook rating & feedback
│       ├── SplashScreen              # Lightweight splash
│       └── RecipeCard.tsx            # Recipe card component
│
├── src/                              # Core business logic
│   ├── data/
│   │   ├── builtInRecipes.ts         # 60+ curated recipes (offline fallback)
│   │   ├── recipeImages.ts           # Image URL mappings
│   │   └── ingredientImages.ts       # Ingredient image mappings
│   ├── store/
│   │   ├── recipes.ts                # Recipe CRUD (AsyncStorage)
│   │   └── ratingsFavourites.ts      # Ratings, favourites, cook counts
│   ├── types/
│   │   └── index.ts                  # TypeScript interfaces
│   ├── utils/
│   │   ├── recipeFingerprint.ts      # SHA-256 dedup (expo-crypto)
│   │   ├── timerWarning.ts           # One-time volume warning
│   │   └── tts.ts                    # ElevenLabs + expo-speech TTS
│   └── theme/
│       └── index.ts                  # Colors, spacing, protein list
│
├── components/                       # Reusable UI components
│   ├── RecipeCard.tsx                # Recipe card with hero image
│   ├── ShareableRecipeCard.tsx       # Social media share format
│   ├── CommunityReviewsModal.tsx     # Ratings bottom sheet
│   ├── themed-text.tsx               # ThemedText (light/dark)
│   ├── themed-view.tsx               # ThemedView (light/dark)
│   ├── haptic-tab.tsx                # Tab with haptic feedback
│   ├── parallax-scroll-view.tsx      # Parallax scroll container
│   └── ui/                           # Icon components
│
├── services/                         # External API integrations
│   ├── recipeService.ts              # Central data layer (993 lines)
│   ├── supabase.ts                   # Supabase client init
│   ├── imageGenerationService.ts     # DALL-E 3 image generation
│   ├── imageCacheService.ts          # Local image file caching
│   └── ratingsService.ts             # Community ratings API
│
├── hooks/                            # Custom React hooks
│   ├── use-theme-color.ts            # Dynamic theme colors
│   └── use-color-scheme.ts           # System dark/light mode
│
├── constants/
│   └── theme.ts                      # Font definitions, tint colors
│
├── scripts/                          # Node.js backend pipeline
│   ├── generate-recipes.js           # Claude API → recipe Excel files
│   ├── onboard-recipes-v2.js         # Excel → Supabase + images
│   ├── regenerate-step-images.js     # Regenerate step images (fal.ai)
│   ├── backfill-fingerprints.js      # One-time fingerprint backfill
│   ├── lib/
│   │   └── recipeFingerprint.js      # Node.js SHA-256 fingerprint
│   └── pipeline/
│       ├── classifyRecipe.js         # Claude API classification
│       ├── getNutrition.js           # Edamam API nutrition
│       ├── ingestRecipe.js           # Full ingestion orchestrator
│       └── ingest-test.js            # Pipeline test harness
│
├── supabase/                         # Database schema & migrations
│   ├── schema.sql                    # Base schema (recipes + recipe_images)
│   └── migrations/
│       ├── add_recipe_fingerprint.sql
│       ├── add_recipe_classification_columns.sql
│       └── update_classification_tags.sql
│
├── Recipes/                          # Recipe data files
│   ├── input/                        # Excel recipe files for onboarding
│   └── prompts/                      # AI prompt files for generation
│
├── docs/                             # Project documentation
└── assets/images/                    # Static images, icons, ingredients
```

---

## Supabase Schema

### `recipes` Table

**Core Columns:**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `curated-{protein}-{slug}` or `native-{slug}` |
| name | TEXT NOT NULL | Recipe display name |
| protein_id | TEXT | chicken, paneer, fish, etc. |
| protein_name | TEXT | Display name |
| protein_emoji | TEXT NOT NULL | e.g., "🍗" |
| description | TEXT | 1-2 sentence overview |
| chef_tip | TEXT | Pro cooking tip |
| meal_type | TEXT | breakfast / lunch_dinner / snack_dessert |
| ingredients | JSONB | `{ "2-3 servings": [{name, quantity}], "4-6 servings": [...] }` |
| steps | JSONB | `[{ title, description, emoji, timerMinutes, tip, ingredientsUsed }]` |
| time_minutes | INT | Total cook time |
| difficulty | TEXT | CHECK: Easy / Medium / Hard only |
| protein_per_100g | NUMERIC | Protein density of main ingredient |
| gradient | JSONB | `["#hex1", "#hex2"]` for UI |
| nutrition | JSONB | `{ calories, proteinG, fatG, carbsG, fiberG, sugarG, sodiumMg }` |
| source | TEXT | "curated" / "ai" |
| is_active | BOOLEAN | Soft delete |
| is_pro | BOOLEAN | Premium flag |
| spice_level | TEXT | Mild / Medium / Hot |
| cuisine | TEXT | e.g., "Indian", "Bengali" |
| status | TEXT | "ready" / "building" |
| device_id | TEXT | For device-specific AI recipes |
| cook_count | INT DEFAULT 0 | Community cook counter |
| fingerprint | TEXT | SHA-256 dedup (partial unique index) |

**Classification Columns (pipeline-enriched):**
| Column | Type | Notes |
|--------|------|-------|
| cuisine_type | TEXT | "North Indian", "South Indian", etc. |
| cook_time_bucket | TEXT | "Under 15 min", "30-45 min", etc. |
| meal_type_tags | JSONB | `["Lunch", "Dinner"]` |
| dietary_tags | JSONB | `["High protein", "Gluten free"]` |
| allergen_tags | JSONB | `["Dairy free", "Nut free"]` (free-from labels) |
| cooking_method | TEXT | "Stir fry", "Air fry", etc. |
| fitness_goal | JSONB | `["Muscle gain", "Fat loss"]` |
| storage_tags | JSONB | `["Freezer friendly", "Office lunch"]` |
| calories | NUMERIC | Per serving (Edamam USDA) |
| protein_g, carbs_g, fat_g, fiber_g | NUMERIC | Per serving |

### `recipe_images` Table
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| recipe_id | TEXT FK | References recipes.id |
| image_type | TEXT | hero / step / ingredient |
| step_index | INT | 0-based for steps, null for hero |
| storage_url | TEXT | Supabase Storage public URL |

### Indexes
- **GIN** on JSONB arrays: dietary_tags, allergen_tags, fitness_goal, meal_type_tags
- **B-tree** on: cuisine_type, cook_time_bucket, cooking_method, calories, protein_g
- **Partial unique** on: `fingerprint WHERE fingerprint IS NOT NULL`

### Functions
- `increment_cook_count(p_recipe_id TEXT)` — Atomic counter increment

---

## RLS Rules

| Table | Policy | Operation | Rule |
|-------|--------|-----------|------|
| recipes | Read active recipes | SELECT | `is_active = true` |
| recipes | Insert AI recipes | INSERT | `source = 'ai' AND device_id IS NOT NULL` |
| recipes | Update own AI recipes | UPDATE | `source = 'ai' AND device_id IS NOT NULL` |
| recipe_images | Read recipe images | SELECT | `true` (public) |
| recipe_images | Insert recipe images | INSERT | `true` (public) |

**Auth model:** No `auth.uid()` — uses `device_id` for anonymous device-scoped access. Client uses anon key; scripts use service role key.

---

## API Integrations

### Supabase (Backend + Storage)
```
Client:  EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
Scripts: EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```
- PostgreSQL database for recipes, images, ratings
- Storage buckets for recipe hero/step images
- No auth (device_id based tracking)

### Claude API (Anthropic)
- **Recipe generation:** `scripts/generate-recipes.js` — full recipe from natural language prompt
- **Classification:** `scripts/pipeline/classifyRecipe.js` — 10-dimension auto-tagging
- **Model:** claude-sonnet-4-20250514
- **Integration:** Raw `fetch` to `https://api.anthropic.com/v1/messages` (no SDK)
- **Env:** `ANTHROPIC_API_KEY` / `EXPO_PUBLIC_ANTHROPIC_KEY`

### OpenAI DALL-E 3 (Hero Images)
- **Used in:** `services/imageGenerationService.ts`
- **Purpose:** Generate dish hero images + AI recipe step images (client-side)
- **Rate limiting:** 5 images/min with delays, 2 retries on 429/5xx
- **Env:** `EXPO_PUBLIC_OPENAI_KEY`

### fal.ai (Step Images — Backend)
- **Used in:** `scripts/onboard-recipes-v2.js`, `scripts/regenerate-step-images.js`
- **Purpose:** Generate cooking step images with quantity-aware progressive prompts
- **Context:** Each step prompt includes previous step state + exact ingredient quantities
- **Env:** `FAL_KEY`

### ElevenLabs (Text-to-Speech)
- **Used in:** `src/utils/tts.ts`
- **Voice:** Rachel (21m00Tcm4TlvDq8ikWAM)
- **Fallback:** expo-speech (native TTS) if ElevenLabs fails
- **Cache:** In-memory Map<textHash, localFileURI> for audio files
- **Env:** `EXPO_PUBLIC_ELEVENLABS_KEY`

### Edamam Nutrition API
- **Used in:** `scripts/pipeline/getNutrition.js`
- **Tier:** Basic Multilingual ($29/mo)
- **Response format:** Nutrients inside `ingredients[].parsed[].nutrients` (not top-level)
- **Cleaning:** `cleanForEdamam()` strips prep notes, vague quantities before sending
- **Env:** `EDAMAM_APP_ID`, `EDAMAM_APP_KEY`

---

## AsyncStorage Caching Strategy

### Cache Keys Inventory

| Key Pattern | Data | TTL | Written | Invalidated |
|-------------|------|-----|---------|-------------|
| `spicestrong_recipes` | SavedRecipe[] | None | On recipe create/update | On delete |
| `spicestrong_recipe_cache_{proteinId}` | Merged recipes per protein | **1 hour** | After Supabase fetch | Stale-while-revalidate |
| `spicestrong_recipe_cache_meta_{proteinId}` | `{lastFetched: timestamp}` | — | With cache | With cache |
| `spicestrong_recipe_img_urls_{recipeId}` | `{heroUrl, stepUrls}` | None | After image fetch | On recipe delete |
| `spicestrong_ai_images_{recipeId}` | Local file URIs for AI images | None | After DALL-E generation | Never |
| `spicestrong_ratings` | `Record<recipeId, 1-5>` | None | On rate | On re-rate |
| `spicestrong_favourites` | `string[]` recipeIds | None | On toggle | On toggle |
| `spicestrong_cook_counts` | `Record<recipeId, count>` | None | On cook complete | Never |
| `spicestrong_device_id` | `{platform}_{timestamp}_{random}` | None | Once on first launch | Never |
| `spicestrong_pending_sync` | `string[]` recipeIds | None | On sync failure | On successful sync |
| `spicestrong_feedback` | Feedback objects array | None | On submit | Never |
| `spicestrong_timer_warning_shown` | `"true"` | None | Once on dismiss | Never |
| `aiRecipeCount_{proteinId}` | Count string | None | On AI generation | Never |
| `globalShoppingList` | `Record<ingredient, recipeName>` | None | On ingredient toggle | Manual clear |

### Caching Pattern: Stale-While-Revalidate

```
fetchRecipesByProtein(proteinId)
  ├── Return cached recipes immediately (< 1 hour old)
  ├── Fire background Supabase fetch (Promise)
  ├── On success: update cache, return fresh data
  └── On failure: cached data still served, no crash
```

### Data Fallback Chain

```
1. AsyncStorage cache (per-protein, 1-hour TTL)
    ↓ (cache miss or stale)
2. Supabase query (live data)
    ↓ (network failure)
3. Built-in recipes (src/data/builtInRecipes.ts — 60+ recipes, always available)
```

### File System Cache (Non-AsyncStorage)

| Directory | Purpose | Pruning |
|-----------|---------|---------|
| `ai_recipe_images/` | DALL-E generated images (local URIs) | None |
| `cached_recipe_images/` | Downloaded Supabase images | Prune at 200+ files (DISABLED — TurboModule crash) |

---

## Key Architectural Decisions

### 1. AsyncStorage-Only State (No Redux/Zustand)
**Decision:** All persistent state via AsyncStorage with function-based access patterns.
**Rationale:** Lightweight, no boilerplate, persistent by default. Recipe data is mostly read-once-per-screen, not globally reactive.

### 2. Offline-First with Built-In Fallback
**Decision:** 60+ curated recipes bundled in `builtInRecipes.ts`. App works fully offline.
**Rationale:** Cooking happens in kitchens with poor connectivity. Supabase data is a bonus, not a requirement.

### 3. Device ID Instead of Auth
**Decision:** Anonymous device tracking via `{platform}_{timestamp}_{random}` stored in AsyncStorage.
**Rationale:** No login friction for v1.0. Users can cook immediately. Auth planned for v1.2.

### 4. Stale-While-Revalidate Caching
**Decision:** Return cached data instantly, refresh in background.
**Rationale:** Zero-wait recipe browsing. Fresh data arrives silently within seconds.

### 5. Dual Image Generation (DALL-E + fal.ai)
**Decision:** Client-side AI recipes use DALL-E 3 (OpenAI). Backend onboarding uses fal.ai.
**Rationale:** DALL-E for quality hero images. fal.ai for bulk step image generation (faster, cheaper at scale).

### 6. ElevenLabs → expo-speech Fallback
**Decision:** TTS tries ElevenLabs first (natural voice), falls back to native expo-speech.
**Rationale:** Premium voice quality when network allows, always-available fallback for cooking mode.

### 7. SHA-256 Fingerprint Dedup
**Decision:** Deterministic hash of sorted ingredient names + step count.
**Rationale:** Catches duplicates regardless of formatting, ordering, or quantity differences. Works at 1000+ recipe scale.

### 8. Serving Tier Architecture
**Decision:** Ingredients stored in two tiers: "2-3 servings" and "4-6 servings".
**Rationale:** Indian home cooking scales in multiples. Avoids math errors from auto-scaling. Nutritionist-verified quantities per tier.

### 9. Image Caching via Local File System
**Decision:** Download images to device file system, store URIs in AsyncStorage.
**Rationale:** DALL-E URLs expire after 1 hour. Local files persist. Cooking mode works offline.

### 10. Pipeline Architecture (Generate → Onboard → Classify → Enrich)
**Decision:** Separate scripts for each pipeline stage, composable via CLI.
**Rationale:** Each stage can run independently, retry on failure, or be skipped. Classification and nutrition run in parallel via `Promise.all`.

---

## App Startup Flow

```
app/_layout.tsx (Root Layout)
  │
  ├── 1. Stack navigator initialized (headerShown: false)
  ├── 2. Request notification permissions
  ├── 3. Create Android "Cooking Timer" channel (MAX importance)
  ├── 4. Background: refreshRecipeCache() → fetch all recipes from Supabase
  ├── 5. Background: syncPendingAIRecipes() → retry failed syncs
  └── 6. (DISABLED) pruneImageCache() — TurboModule crash
```

---

## Recipe Ingestion Pipeline

```
Step 1: Generate (optional)
  Recipes/prompts/*.xlsx → node scripts/generate-recipes.js → Recipes/input/*.xlsx

Step 2: Onboard
  Recipes/input/*.xlsx → node scripts/onboard-recipes-v2.js
    ├── Parse Excel (4 sheets: Info, Ingredients, Steps, Nutrition)
    ├── Generate fingerprint → check for duplicates
    ├── Insert recipe row → Supabase
    ├── Parallel: classifyRecipe() + getNutrition()
    ├── Update recipe with classification + nutrition data
    ├── Generate hero image → fal.ai → Supabase Storage
    ├── Generate step images → fal.ai → Supabase Storage
    └── Duplicate files renamed to *_duplicate.xlsx

Step 3: Regenerate Images (optional)
  node scripts/regenerate-step-images.js
    ├── Fetch all recipes from Supabase
    ├── Build quantity-aware progressive prompts per step
    ├── Generate images → fal.ai → Supabase Storage
    └── Update recipe_images table
```

---

## Environment Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Client + Scripts | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Client | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Scripts only | Admin access |
| `EXPO_PUBLIC_ANTHROPIC_KEY` | Client | Claude API (in-app AI recipes) |
| `ANTHROPIC_API_KEY` | Scripts | Claude API (pipeline) |
| `EXPO_PUBLIC_OPENAI_KEY` | Client | DALL-E 3 image generation |
| `FAL_KEY` | Scripts | fal.ai image generation |
| `EXPO_PUBLIC_ELEVENLABS_KEY` | Client | TTS voice narration |
| `EDAMAM_APP_ID` | Scripts | Nutrition API |
| `EDAMAM_APP_KEY` | Scripts | Nutrition API |

---

## Feature Flags

| Flag | File | Dev | Prod |
|------|------|-----|------|
| `MAX_FREE_AI_RECIPES_PER_PROTEIN` | AIRecipeBuilderScreen.tsx | 0 (unlimited) | 1 |
| `AI_ENABLED_PROTEINS` | AIRecipeBuilderScreen.tsx | [] (all) | [] (all) |
| `ENABLED_PROTEINS` | ProteinSelectionScreen.tsx | [] (all) | [] (all) |
| `pruneImageCache` | _layout.tsx | DISABLED | DISABLED |

---

## Known Issues

| Issue | Status | Notes |
|-------|--------|-------|
| Image pruning disabled | Workaround | TurboModule crash with new expo-file-system |
| Feedback never uploaded | Open | Stored locally, no server sync |
| AI recipe count never resets | Open | Accumulates per protein, never cleared |
| No cache size monitoring | Open | Unbounded growth possible |
