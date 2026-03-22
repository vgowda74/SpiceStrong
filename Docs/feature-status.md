# SpiceStrong Feature Status

Complete inventory of implemented features, in-progress work, disabled code, feature flags, and planned roadmap — all sourced from the actual codebase.

---

## Table of Contents

1. [Feature Status Matrix](#1-feature-status-matrix)
2. [Fully Implemented Features](#2-fully-implemented-features)
3. [Partially Implemented Features](#3-partially-implemented-features)
4. [Stubbed / Not Yet Implemented](#4-stubbed--not-yet-implemented)
5. [Feature Flags & Runtime Constants](#5-feature-flags--runtime-constants)
6. [Disabled Code & Workarounds](#6-disabled-code--workarounds)
7. [Environment-Dependent Features](#7-environment-dependent-features)
8. [Known Open Issues](#8-known-open-issues)
9. [Planned Roadmap (from codebase)](#9-planned-roadmap-from-codebase)

---

## 1. Feature Status Matrix

| Feature | Status | File(s) | Notes |
|---------|--------|---------|-------|
| Splash screen & onboarding | ✅ Done | `app/index.tsx` | Playfair Display logo, "Get Started" CTA |
| Protein selection (14 types) | ✅ Done | `ProteinSelectionScreen.tsx` | Veg/non-veg filter, search, card grid |
| Recipe list & browsing | ✅ Done | `RecipeListScreen.tsx` | Cards with hero image, ratings, nutrition |
| Recipe filters (difficulty, spice, time) | ✅ Done | `RecipeListScreen.tsx:372-391` | Advanced filter modal with pill toggles |
| Meal type tabs (All/Breakfast/Lunch/Favourites) | ✅ Done | `RecipeListScreen.tsx:64-72` | Tab bar with count badges |
| Recipe overview & detail | ✅ Done | `RecipeOverviewScreen.tsx` | Hero image, ingredients, tier selector |
| Serving tier selector (2-3 / 4-6) | ✅ Done | `RecipeOverviewScreen.tsx` | Toggle switches ingredient quantities |
| Step-by-step cooking mode | ✅ Done | `CookingModeScreen.tsx` | Swipe navigation, step images, tips |
| Cooking timers with notifications | ✅ Done | `CookingModeScreen.tsx:1027-1055` | Adjustable ±1min, alarm sound, haptics |
| Voice guidance (TTS) | ✅ Done | `src/utils/tts.ts` | ElevenLabs primary, expo-speech fallback |
| Ingredient checklist | ✅ Done | `IngredientChecklistScreen.tsx` | Radio buttons, progress bar, sections |
| Global shopping cart | ✅ Done | `IngredientChecklistScreen.tsx:185-236` | Persistent across recipes via AsyncStorage |
| Share shopping list | ✅ Done | `IngredientChecklistScreen.tsx:631` | Native Share API, grouped by recipe |
| AI recipe builder | ✅ Done | `AIRecipeBuilderScreen.tsx` | Claude API, rate-limited per protein |
| AI recipe rate limiting | ✅ Done | `AIRecipeBuilderScreen.tsx:24` | 1 free/protein (prod), unlimited (dev) |
| AI recipe result display | ✅ Done | `AIRecipeResultScreen.tsx` | Step images via DALL-E 3 |
| DALL-E image generation | ✅ Done | `imageGenerationService.ts` | Rate-limited 5/min, retry on 429/5xx |
| Recipe hero images (fal.ai) | ✅ Done | `onboard-recipes-v2.js` | Quantity-aware progressive prompts |
| Step image regeneration | ✅ Done | `regenerate-step-images.js` | Batch regeneration for all recipes |
| Community ratings & reviews | ✅ Done | `ratingsService.ts` | Supabase upsert, 1 rating/device/recipe |
| Community reviews modal | ✅ Done | `CommunityReviewsModal.tsx` | Bottom sheet, star distribution bars |
| Post-cook rating (1-5 stars) | ✅ Done | `CookingModeScreen.tsx:774-780` | Star selector on completion screen |
| Cook count tracking | ✅ Done | `recipeService.ts` | Atomic Supabase counter |
| Favourites system | ✅ Done | `ratingsFavourites.ts` | AsyncStorage toggle, filter tab |
| Local recipe storage | ✅ Done | `src/store/recipes.ts` | AsyncStorage CRUD |
| Recipe fingerprint dedup | ✅ Done | `recipeFingerprint.ts` | SHA-256, partial unique index |
| Stale-while-revalidate cache | ✅ Done | `recipeService.ts` | 1-hour TTL, background refresh |
| Built-in recipe fallback | ✅ Done | `builtInRecipes.ts` | 60+ recipes, works offline |
| Custom recipe entry | ✅ Done | `CustomRecipeScreen.tsx` | Manual ingredient/step input |
| Shareable recipe card | ✅ Done | `ShareableRecipeCard.tsx` | 1400×900 social media card |
| Haptic feedback | ✅ Done | `haptic-tab.tsx` | iOS Light impact on tab press |
| Confetti animation | ✅ Done | `CookingModeScreen.tsx:143-169` | On recipe completion |
| Pending recipe sync queue | ✅ Done | `recipeService.ts:430-566` | Retries on app startup |
| Device ID tracking | ✅ Done | `recipeService.ts:103` | Anonymous, persistent |
| Recipe generation from prompts | ✅ Done | `generate-recipes.js` | Excel prompts → Claude API → Excel |
| Recipe onboarding pipeline | ✅ Done | `onboard-recipes-v2.js` | Excel → Supabase + images |
| Claude classification (10 dims) | ✅ Done | `classifyRecipe.js` | Cuisine, dietary, allergen, fitness, etc. |
| Edamam nutrition analysis | ✅ Done | `getNutrition.js` | USDA-backed, cleanForEdamam() |
| Ingredient cleaning for Edamam | ✅ Done | `getNutrition.js:46-67` | Strips prep notes, vague quantities |
| Difficulty mapping | ✅ Done | `ingestRecipe.js` | Beginner→Easy, Advanced→Hard |
| Duplicate detection (onboarding) | ✅ Done | `onboard-recipes-v2.js` | Renames to `_duplicate.xlsx` |
| Pipeline classification in onboarding | ⚠️ Partial | `onboard-recipes-v2.js:760-775` | Runs but non-blocking on failure |
| Client-side classification (AI recipes) | ⚠️ Partial | `recipeService.ts:760-823` | Works for AI recipes only |
| Image cache pruning | ❌ Disabled | `_layout.tsx:6-7, 41-42` | TurboModule crash |
| Feedback SMS send | ⚠️ Partial | `FeedbackScreen.tsx` | Text compiled, no direct send |
| Feedback server upload | ❌ Stub | `FeedbackScreen.tsx:116-120` | Local AsyncStorage only |
| Pro/premium recipes | ❌ Stub | `recipeService.ts:491` | `is_pro: false` hardcoded |
| User authentication | ❌ Not started | — | Planned for v1.2 |
| Android optimization | ❌ Not started | — | Planned for v1.1 |

---

## 2. Fully Implemented Features

### Core Cooking Experience

**Protein Selection** — `app/screens/ProteinSelectionScreen.tsx`
- 14 protein categories (8 non-veg, 6 vegetarian)
- Veg/Non-veg filter toggle
- Search bar with live filtering
- Card grid layout with protein-per-100g stats
- Feature flag: `ENABLED_PROTEINS` (line 46) — empty array = all enabled

**Recipe Browsing** — `app/screens/RecipeListScreen.tsx`
- Per-protein recipe list with RecipeCard components
- Tab filters: All, Breakfast, Lunch & Dinner, Snacks, Favourites (lines 64-72)
- Advanced filter modal: difficulty, spice level, cook time (lines 372-391)
- Community ratings display with loading states
- In-memory ratings cache per component lifecycle (line 103)

**Guided Cooking Mode** — `app/screens/CookingModeScreen.tsx`
- Step-by-step navigation with swipe gestures
- Per-step images from Supabase or DALL-E
- Ingredient list per step (ingredientsUsed field)
- Chef tips display per step
- Adjustable cooking timers (±1 min buttons, lines 1027-1055)
- Alarm sound playback on timer complete (lines 120-141)
- Voice guidance via TTS (ElevenLabs → expo-speech fallback)
- Completion screen with confetti animation (lines 143-169)
- Star rating submission (1-5 stars, lines 774-780)
- Review text submission
- Cook count increment
- Stat cards (time, steps, protein)

**Ingredient Checklist** — `app/screens/IngredientChecklistScreen.tsx`
- Ingredient list grouped by category with emoji sections
- Radio button toggle (checked/unchecked with visual states)
- Progress bar tracking completion percentage
- Global shopping cart (AsyncStorage key: `globalShoppingList`, line 185)
- Cart bottom sheet with animated slide (lines 227-236)
- Cart bounce animation on add (line 211)
- Share cart via native Share API (line 631)
- View cart badge with item count
- Cart persists across recipes until manually cleared

**Pre-Cook Screen** — `app/screens/CookingStartScreen.tsx`
- Recipe overview with time, difficulty, servings
- Global cart items display (loaded from AsyncStorage, lines 32-43)
- Share cart grouped by recipe (lines 80-95)
- Clear cart with AsyncStorage cleanup (lines 97-100)
- Pulse animation on emoji (Animated.loop)
- Start cooking CTA with gradient button

### AI Features

**AI Recipe Builder** — `app/screens/AIRecipeBuilderScreen.tsx`
- Recipe name input with protein pre-selected
- Cuisine, meal type, dietary preference chips
- Additional notes text area
- Claude API integration for recipe generation
- Rate limiting: 1 free recipe per protein type in production (line 24)
- Limit modal with upgrade prompt
- Background recipe save with duplicate detection
- Status tracking: "building" → "ready"

**AI Recipe Result** — `app/screens/AIRecipeResultScreen.tsx`
- Generated recipe display with step images
- DALL-E 3 image generation for hero + steps
- Start cooking button to enter cooking mode

### Backend Pipeline

**Recipe Generation** — `scripts/generate-recipes.js`
- Reads prompts from Excel (1 column: recipe idea in plain English)
- Calls Claude API with detailed system prompt
- Outputs recipe Excel files matching onboarding format
- Supports `--dry-run`, `--row=N`, `--input=path` flags

**Recipe Onboarding** — `scripts/onboard-recipes-v2.js`
- Parses 4-sheet Excel template (Info, Ingredients, Steps, Nutrition)
- Generates SHA-256 fingerprint for dedup
- Checks existing recipes by fingerprint before insert
- Renames duplicates to `*_duplicate.xlsx`
- Inserts recipe row into Supabase
- Runs Claude classification + Edamam nutrition in parallel (lines 760-775)
- Updates recipe with classification results
- Generates hero image via fal.ai
- Generates step images via fal.ai with quantity-aware prompts
- Summary: inserted/duplicates/failures counts

**Step Image Regeneration** — `scripts/regenerate-step-images.js`
- Fetches all recipes from Supabase
- Builds progressive prompts with exact ingredient quantities
- Resolves quantities from tiered ingredients
- Previous-step context for realistic progression
- Supports `--dry-run`, `--recipe=id`, `--hero` flags

### Data & Caching

**Stale-While-Revalidate** — `services/recipeService.ts`
- Returns cached recipes instantly (< 1-hour TTL)
- Background Supabase refresh via Promise
- 3-tier fallback: cache → Supabase → built-in recipes
- Per-protein cache keys in AsyncStorage

**Community Ratings** — `services/ratingsService.ts`
- Supabase table availability check with caching (lines 60-75)
- Per-recipe ratings with distribution (5-star breakdown)
- Device-scoped rating upsert (one rating per device per recipe)
- Review submission with device ID tracking
- Graceful fallback to EMPTY_RATINGS if Supabase unavailable (line 86)

---

## 3. Partially Implemented Features

### Pipeline Classification in Onboarding

**Status:** Imports added, calls wired, but NON-BLOCKING on failure

**File:** `scripts/onboard-recipes-v2.js` (lines 27-28, 760-775)
```javascript
const { classifyRecipe } = require('./pipeline/classifyRecipe');
const { getNutrition } = require('./pipeline/getNutrition');

// Lines 760-775: Runs in parallel, falls back to individual on error
[classificationData, nutritionData] = await Promise.all([
  classifyRecipe(recipeName, flatIngredients, flatInstructions),
  getNutrition(flatIngredients, servingsCount),
]);
```
- Classification runs but warns on failure — doesn't block recipe insert
- Nutrition analysis warns on Edamam errors (555 low_quality) — doesn't block
- Recipe still loads successfully without classification/nutrition data

### Client-Side Recipe Classification

**Status:** Works for AI-generated recipes only, not called for curated recipes

**File:** `services/recipeService.ts` (lines 760-823)
- `classifyAndEnrichRecipe()` calls Claude API from the app
- Maps Claude's difficulty values to DB constraints (DIFFICULTY_MAP, lines 825-839)
- Called during AI recipe generation flow
- NOT called for curated/onboarded recipes

### Feedback System

**Status:** Local storage only, no server sync

**File:** `app/screens/FeedbackScreen.tsx`
- 5 structured questions + comments textarea (fully rendered)
- SMS body compilation with recipe name, answers (lines 31-62)
- Phone number hardcoded: `'4252468867'` (line 19)
- Saves to AsyncStorage under `spicestrong_feedback` key (lines 116-120)
- **Missing:** No upload to Supabase or remote analytics
- **Missing:** No automatic SMS sending (text generation only, uses Share API)

### Advanced Recipe Filters

**Status:** Phase 1 done, Phase 2-3 planned

**File:** `docs/advanced-recipe-filter-spec.md`
- ✅ Phase 1: Difficulty, Spice Level, Cooking Time — **IMPLEMENTED**
- ❌ Phase 2: Cuisine, Cooking Method, Diet Tags — columns exist in DB, UI not built
- ❌ Phase 3: Protein-specific cuts — needs more recipe data

---

## 4. Stubbed / Not Yet Implemented

### Premium / Pro Recipes

**Schema ready, logic not built**

- `is_pro` column exists in `recipes` table (default: `false`)
- `is_pro: false` hardcoded in AI recipe creation (`recipeService.ts:491`)
- No paywall, subscription check, or premium UI exists
- Planned for v2.0 (RevenueCat / StoreKit)

### User Authentication

**Not started — device ID used instead**

- No Supabase Auth integration
- Device ID generated once: `{platform}_{timestamp}_{random}` (`recipeService.ts:103`)
- RLS uses `device_id` not `auth.uid()`
- Planned for v1.2

### Feedback Server Upload

**Local only — no remote sync**

- Feedback accumulates in AsyncStorage indefinitely
- No background upload job
- No Supabase table for feedback data
- No analytics integration

### Meal Planning

**Not started**

- No meal plan screens, data models, or services
- Planned for v1.3

### Grocery List Export

**Not started**

- Global cart exists but no export to Apple Reminders / Google Keep
- Planned for v1.3

### Nutrition Tracking Dashboard

**Not started**

- Per-recipe nutrition exists but no aggregated tracking view
- Planned for v1.3

---

## 5. Feature Flags & Runtime Constants

### Active Feature Flags

| Flag | File | Line | Dev Value | Prod Value | Purpose |
|------|------|------|-----------|------------|---------|
| `MAX_FREE_AI_RECIPES_PER_PROTEIN` | `AIRecipeBuilderScreen.tsx` | 24 | `0` (unlimited) | `1` | Limits free AI recipes per protein type |
| `AI_ENABLED_PROTEINS` | `AIRecipeBuilderScreen.tsx` | 30 | `[]` (all) | `[]` (all) | Restrict which proteins support AI generation |
| `ENABLED_PROTEINS` | `ProteinSelectionScreen.tsx` | 46 | `[]` (all) | `[]` (all) | Restrict which proteins appear in selection |

### Dev/Prod Detection

```typescript
// Uses React Native's __DEV__ global
const MAX_FREE_AI_RECIPES_PER_PROTEIN = __DEV__ ? 0 : 1;
```

### Rate Limiting Implementation

```
AIRecipeBuilderScreen.tsx:
  Line 27: const AI_COUNT_KEY_PREFIX = 'aiRecipeCount_';
  Line 658-676: Check counter before allowing generation
  Line 713: Increment counter after successful generation
  Counter stored in AsyncStorage per protein (never resets)
```

### Premium Flag (Unused)

```
recipeService.ts line 491: is_pro: false  // hardcoded
supabase/schema.sql: is_pro BOOLEAN NOT NULL DEFAULT false
```
Schema supports premium but no business logic exists.

---

## 6. Disabled Code & Workarounds

### Image Cache Pruning — DISABLED

**File:** `app/_layout.tsx` (lines 6-7, 41-42)

```typescript
// pruneImageCache disabled — expo-file-system new API causes TurboModule crash
// import { pruneImageCache } from '../services/imageCacheService';

// Inside useEffect:
// pruneImageCache disabled — causes TurboModule crash
// pruneImageCache().catch(() => {});
```

**Impact:** Image files in `cached_recipe_images/` directory accumulate without pruning. The pruning function exists in `imageCacheService.ts` (deletes oldest files when count exceeds 200) but is never called.

**Root cause:** New expo-file-system API is incompatible with TurboModule architecture in current Expo version.

### Removed Image Cache Imports

Explicit caching imports were removed from several screens because `expo-image` handles caching automatically:

- `CookingModeScreen.tsx` line 37 — comment confirms expo-image auto-caching
- `RecipeListScreen.tsx` line 27 — removed manual cache import
- `RecipeOverviewScreen.tsx` line 26 — removed manual cache import

### Android WebP Animation

**File:** `android/gradle.properties` (line 54)
```
# Disabled by default because iOS doesn't support animated webp
expo.webp.animated=false
```

---

## 7. Environment-Dependent Features

| Variable | Feature | Required? | Fallback if Missing |
|----------|---------|-----------|---------------------|
| `EXPO_PUBLIC_SUPABASE_URL` | All Supabase operations | Yes | Built-in recipes only (offline mode) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Client Supabase queries | Yes | Built-in recipes only |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend scripts (admin) | Scripts only | Scripts fail |
| `EXPO_PUBLIC_ANTHROPIC_KEY` | AI recipe generation (client) | No | Alert shown, AI builder disabled |
| `ANTHROPIC_API_KEY` | Recipe generation + classification (scripts) | Scripts only | Scripts fail |
| `EXPO_PUBLIC_OPENAI_KEY` | DALL-E 3 hero images (client) | No | Falls back to emoji display |
| `FAL_KEY` | Step images (backend scripts) | Scripts only | Scripts fail |
| `EXPO_PUBLIC_ELEVENLABS_KEY` | TTS voice narration | No | Falls back to expo-speech (native TTS) |
| `EDAMAM_APP_ID` | Nutrition analysis | No | Warning logged, recipe loads without nutrition |
| `EDAMAM_APP_KEY` | Nutrition analysis | No | Warning logged, recipe loads without nutrition |

### Graceful Degradation Chain

```
Full experience (all keys present):
  Supabase recipes + Claude AI + DALL-E images + ElevenLabs TTS + Edamam nutrition

Partial (no AI keys):
  Supabase recipes + emoji fallback + native TTS + manual nutrition

Minimal (no Supabase):
  Built-in 60+ recipes + local AsyncStorage + emoji + native TTS

Offline:
  Cached recipes + built-in recipes + local images + native TTS
```

---

## 8. Known Open Issues

| # | Issue | Severity | Status | File(s) | Notes |
|---|-------|----------|--------|---------|-------|
| 1 | Image cache pruning disabled | Low | Workaround | `_layout.tsx:6-7` | TurboModule crash with expo-file-system |
| 2 | Some recipes show 0 calories | Medium | Open | Supabase data | Paneer bhurji + others with incomplete nutrition |
| 3 | Ingredient-step matching false positives | Low | Open | `regenerate-step-images.js` | "coriander" in description matches garnish |
| 4 | Feedback never uploaded to server | Low | By design | `FeedbackScreen.tsx` | Stores locally only, no remote sync |
| 5 | AI recipe count never resets | Low | By design | `AIRecipeBuilderScreen.tsx` | Accumulates per protein, persistent |
| 6 | No cache size monitoring | Low | Open | — | AsyncStorage + file system unbounded |
| 7 | Boilerplate tabs still in navigation | Cosmetic | Open | `(tabs)/_layout.tsx` | Home/Explore tabs from Expo template |
| 8 | Unused modal.tsx | Cosmetic | Open | `app/modal.tsx` | Expo template leftover |

### Previously Fixed Issues

| Issue | Fix | File |
|-------|-----|------|
| Difficulty CHECK constraint violation | Added DIFFICULTY_MAP (Beginner→Easy, etc.) | `ingestRecipe.js`, `onboard-recipes-v2.js` |
| Edamam 555 low_quality errors | Added `cleanForEdamam()` to strip prep notes | `getNutrition.js:46-67` |
| Fingerprint migration duplicate key (23505) | Deleted duplicate tandoori chicken first | Manual SQL |
| Paneer bhurji protein detection | Added fallback `resolveProtein(recipeName)` | `onboard-recipes-v2.js` |
| `protein_emoji` NOT NULL violation | Added PROTEIN_EMOJIS lookup map | `ingestRecipe.js` |
| Edamam Basic tier response format | Sum from `ingredients[].parsed[].nutrients` | `getNutrition.js` |

---

## 9. Planned Roadmap (from codebase)

### Pre-Launch Beta Backlog

**High Priority:**
- [ ] Fix 0 calories on nutrition card (paneer bhurji + others)
- [ ] Update paneer bhurji nutrition in Supabase
- [ ] AI-generated recipes should update classification categories after save
- [ ] Fix ingredient-to-step matching for auto-matched recipes

**Medium Priority:**
- [ ] Recipe search/filter by classification tags (dietary, allergen, fitness goal)
- [ ] Recipe difficulty filter on list screen (Phase 2 filters)
- [ ] Improve ingredient-step auto-matching accuracy

**Low Priority:**
- [ ] Custom recipe screen polish
- [ ] Remove boilerplate tabs (Home/Explore) from navigation
- [ ] Clean up unused `modal.tsx`

### v1.1 — Android Launch

- [ ] Android platform testing and fixes
- [ ] Android notification channel setup (already configured in code)
- [ ] Android-specific UI adjustments
- [ ] Play Store listing and metadata
- [ ] Feature parity verification

### v1.2 — Community & Social

- [ ] User accounts (Supabase Auth integration)
- [ ] Community recipe submissions
- [ ] Recipe reviews with text comments
- [ ] Social sharing (Instagram Stories, WhatsApp)
- [ ] User profiles with cooking history
- [ ] Follow other cooks

### v1.3 — Smart Features

- [ ] Meal planning (weekly/daily)
- [ ] Grocery list export (Apple Reminders, Google Keep)
- [ ] Nutrition tracking dashboard
- [ ] Recipe recommendations based on history
- [ ] Pantry management

### v2.0 — Premium

- [ ] Pro recipes (`is_pro` flag already in schema)
- [ ] Unlimited AI recipe generation (remove rate limit)
- [ ] Advanced nutrition tracking
- [ ] Custom meal plans
- [ ] Ad-free experience
- [ ] Subscription via RevenueCat / StoreKit

### Filter Phases (from `advanced-recipe-filter-spec.md`)

| Phase | Filters | Status |
|-------|---------|--------|
| Phase 1 (v1.0) | Difficulty, Spice Level, Cook Time | ✅ Done |
| Phase 2 (v1.2) | Cuisine, Cooking Method, Diet Tags | DB columns exist, UI not built |
| Phase 3 (v1.3) | Protein-specific cuts | Needs more recipe variety |
