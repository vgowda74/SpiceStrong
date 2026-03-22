# SpiceStrong — Project Context for AI Assistants

Read this document first. It tells you everything you need to safely and effectively work on this codebase.

---

## 1. What This App Is

**SpiceStrong** is a high-protein Indian recipe app built with React Native + Expo. It helps fitness-conscious home cooks discover, cook, and track protein-rich Indian meals with guided cooking, AI-generated recipes, smart grocery lists, and USDA-backed nutrition data.

**Target users:** Gym-goers, bodybuilders, meal preppers, and health-conscious people who love Indian food but want higher protein, lower fat versions of classic dishes.

**Platforms:** iOS (primary), Android (v1.1). No web version.

**Current version:** 1.0.0 (beta)

---

## 2. Core User Flow

```
Splash → Protein Selection (14 types) → Recipe List → Recipe Overview
                                              ↓
                                    Cooking Start → Ingredient Checklist → Cooking Mode → Feedback
                                              ↓
                                    AI Recipe Builder → AI Recipe Result → Cooking Mode
```

**Key screens:**
- **ProteinSelectionScreen** — Choose from 14 protein categories (chicken, paneer, fish, etc.)
- **RecipeListScreen** — Browse recipes with filters (difficulty, spice, cook time, favourites)
- **RecipeOverviewScreen** — Ingredient list with 2-3 / 4-6 serving toggle
- **CookingModeScreen** — Step-by-step guided cooking with timers, voice, images, haptics
- **AIRecipeBuilderScreen** — Generate custom recipes via Claude API (rate-limited: 1 free per protein)
- **IngredientChecklistScreen** — Global shopping cart that persists across recipes

---

## 3. Tech Stack & Why

| Choice | Technology | Why |
|--------|-----------|-----|
| **Framework** | React Native 0.81.5 + Expo 54 | Cross-platform mobile, managed workflow |
| **Routing** | Expo Router 6 (file-based) | Type-safe, convention over configuration |
| **Language** | TypeScript 5.9 (strict mode) | Catches errors at compile time |
| **Backend** | Supabase (PostgreSQL) | Free tier, real-time, RLS, storage, no server needed |
| **State** | AsyncStorage only | Lightweight, persistent, no Redux boilerplate |
| **AI Generation** | Claude API (raw fetch) | Best quality for recipe generation + classification |
| **Hero Images** | OpenAI DALL-E 3 (client) | High quality food photography |
| **Step Images** | fal.ai (backend scripts) | Faster + cheaper for bulk generation |
| **Voice** | ElevenLabs → expo-speech fallback | Natural voice when online, native TTS offline |
| **Nutrition** | Edamam API (USDA-backed) | Accurate, per-ingredient analysis |
| **Caching** | Stale-while-revalidate | Instant UI, fresh data in background |
| **Dedup** | SHA-256 fingerprint | Deterministic, handles 1000+ recipes |
| **Icons** | Ionicons (`@expo/vector-icons`) | Consistent across devices (NOT emoji for buttons) |
| **Font** | Playfair Display 700 Bold | Premium feel for branding |
| **Theme** | Dark warm copper-brown (#E85D26 accent) | Matches Indian spice aesthetic |

**Deliberately NOT used:**
- Redux / Zustand / Context API — AsyncStorage is sufficient
- Firebase — Supabase is more flexible
- CSS-in-JS / NativeWind / Tailwind — StyleSheet.create is the standard
- Web routing — iOS/Android only app
- Supabase Auth — device ID tracking for v1.0, auth planned for v1.2

---

## 4. Project Structure

```
SpiceStrong/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root stack + app startup logic
│   ├── index.tsx                 # Splash screen
│   ├── (tabs)/                   # Bottom tabs (Home, Explore)
│   └── screens/                  # All app screens (13 files)
├── src/                          # Core business logic
│   ├── store/recipes.ts          # Recipe CRUD + types (CRITICAL)
│   ├── store/ratingsFavourites.ts # Ratings, favourites, cook counts
│   ├── data/builtInRecipes.ts    # 60+ offline recipes (fallback)
│   ├── utils/recipeFingerprint.ts # SHA-256 dedup (expo-crypto)
│   ├── utils/tts.ts              # ElevenLabs + expo-speech
│   └── theme/index.ts            # Colors, spacing, protein list
├── components/                   # Reusable UI (RecipeCard, modals, themed)
├── services/                     # API integrations
│   ├── recipeService.ts          # Central data layer (993 lines)
│   ├── supabase.ts               # Supabase client
│   ├── imageGenerationService.ts # DALL-E 3 integration
│   ├── imageCacheService.ts      # Local image caching
│   └── ratingsService.ts         # Community ratings
├── scripts/                      # Backend Node.js pipeline
│   ├── generate-recipes.js       # Prompts → Claude → Excel
│   ├── onboard-recipes-v2.js     # Excel → Supabase + images
│   ├── regenerate-step-images.js # Batch step image regen
│   └── pipeline/                 # classify, nutrition, ingest
├── supabase/                     # Schema + migrations
├── Recipes/                      # Excel recipe files + prompts
└── docs/                         # Project documentation
```

---

## 5. Coding Conventions

### Import Ordering
```typescript
// 1. React hooks
import React, { useState, useEffect } from 'react';
// 2. React Native components (grouped)
import { View, Text, StyleSheet, Platform } from 'react-native';
// 3. Expo/third-party
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
// 4. (blank line)
// 5. Local imports
import { saveRecipe, type SavedRecipe } from '../../src/store/recipes';
import { saveAIRecipe, type RecipeSyncResult } from '../../services/recipeService';
```

### Exports
- **Named exports only** — no default exports in services or stores
- Type imports use `type` keyword: `import { type SavedRecipe }`
- `export async function nameHere()` for service functions
- `export interface` for types

### Functions
- Exported: `export async function name(): Promise<T>`
- Private helpers: `async function name(): Promise<T>`
- Event handlers in components: `const handleX = async () => {}`

### Error Handling
```typescript
// Pattern 1: Return fallback (most common)
try {
  const { error } = await supabase.from('recipes').select('id').limit(1);
  return !error;
} catch {
  return false;
}

// Pattern 2: Silent catch for non-critical ops
try { await cacheImageUrls(id, urls); } catch { /* non-critical */ }

// Pattern 3: Specific error codes
if (error?.code === '23505' && error.message?.includes('fingerprint')) {
  return { success: false, duplicate: true };
}
```

### Logging
```typescript
// ALWAYS prefix with [SpiceStrong]
console.log(`[SpiceStrong] Recipe synced: ${recipe.id}`);
console.warn(`[SpiceStrong] Cache failed for ${key}:`, err);
console.error(`[SpiceStrong] API error (${status}):`, text);
```

### Styling
- All styles via `StyleSheet.create()` — never inline objects
- Colors use hex `#RRGGBB` or `rgba()` — never named colors
- Spacing from theme: `xs(4), sm(8), md(16), lg(24), xl(32)`
- Use Ionicons for interactive UI elements, emoji only for decorative display

### State Management
- No Redux/Zustand/Context — only AsyncStorage + React hooks
- Immutable updates: `setX(prev => ({ ...prev, field: newVal }))`
- All store functions are async with try/catch and fallback values

---

## 6. Things You Must NEVER Change or Break

### Database Constraints
These are enforced by PostgreSQL CHECK constraints. Violating them crashes inserts.

| Column | Allowed Values | Constraint |
|--------|---------------|------------|
| `difficulty` | `'Easy'`, `'Medium'`, `'Hard'` | CHECK constraint |
| `source` | `'curated'`, `'ai'` | CHECK constraint |
| `meal_type` | `'breakfast'`, `'lunch_dinner'`, `'snack_dessert'` | CHECK constraint |
| `status` | `'building'`, `'ready'` | CHECK constraint |
| `image_type` | `'hero'`, `'step'`, `'ingredient'` | CHECK constraint |
| `protein_emoji` | Any non-null string | NOT NULL DEFAULT '' |
| `fingerprint` | Unique when not null | Partial UNIQUE index |

### Serving Tier Constants
These control ALL nutrition math. Changing them breaks every nutrition display.

```typescript
// src/store/recipes.ts — DO NOT MODIFY
QUANTITY_TIERS = ['2-3 servings', '4-6 servings']
SERVINGS_PER_TIER = { '2-3 servings': 2.5, '4-6 servings': 5 }
TIER_FACTOR = { '2-3 servings': 1, '4-6 servings': 2 }
```

Nutrition is stored per **batch** (2-3 servings total), not per serving. Per-serving = `batch / 2.5`.

### AsyncStorage Keys
Renaming any key loses user data permanently. These are the canonical keys:

```
spicestrong_recipes                        # All saved recipes
spicestrong_recipe_cache_{proteinId}       # Per-protein cache
spicestrong_recipe_cache_meta_{proteinId}  # Cache timestamps
spicestrong_pending_sync                   # Failed sync queue
spicestrong_recipe_img_urls_{recipeId}     # Image URL cache
spicestrong_device_id                      # Permanent device ID
spicestrong_ratings                        # User ratings map
spicestrong_favourites                     # Favourite recipe IDs
spicestrong_cook_counts                    # Cook count map
spicestrong_feedback                       # Local feedback store
spicestrong_timer_warning_shown            # One-time flag
spicestrong_ai_images_{recipeId}           # Local AI image URIs
aiRecipeCount_{proteinId}                  # AI generation counter
globalShoppingList                         # Persistent cart
```

### Recipe ID Patterns
Filtering logic depends on these prefixes. Changing them breaks recipe categorization.

```
spicestrong-*   → built-in seed recipes
curated-*       → onboarded from Excel
native-*        → pipeline-ingested
(anything else) → AI-generated
```

### Fingerprint Algorithm
Must produce identical hashes in both TypeScript (`expo-crypto`) and Node.js (`crypto`):

```
SHA-256( sorted_lowercase_ingredient_names.join('|') + '|' + step_count )
```

### RLS Policies
These control data access. Breaking them either exposes data or blocks operations:

- Read recipes: `is_active = true` (public)
- Insert/update AI recipes: `source = 'ai' AND device_id IS NOT NULL`
- Read/insert images: public (no restrictions)

### Difficulty Mapping
Claude returns different values than the DB accepts. This mapping is required:

```
Beginner → Easy
Intermediate → Medium
Advanced → Hard
Chef level → Hard
```

### API Endpoints (Hardcoded)
```
https://api.anthropic.com/v1/messages          # Claude API
https://api.openai.com/v1/images/generations   # DALL-E 3
https://api.elevenlabs.io/v1/text-to-speech/*  # ElevenLabs TTS
https://api.edamam.com/api/nutrition-details    # Edamam
```

---

## 7. Environment Variables

| Variable | Required | Used By | Purpose |
|----------|----------|---------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Client + Scripts | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client | Public anon key (RLS enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Scripts only | Backend scripts | Admin access (bypasses RLS) |
| `EXPO_PUBLIC_ANTHROPIC_KEY` | No | Client | AI recipe generation in-app |
| `ANTHROPIC_API_KEY` | Scripts only | Pipeline scripts | Recipe generation + classification |
| `EXPO_PUBLIC_OPENAI_KEY` | No | Client | DALL-E hero images |
| `FAL_KEY` | Scripts only | Backend scripts | fal.ai step images |
| `EXPO_PUBLIC_ELEVENLABS_KEY` | No | Client | TTS voice narration |
| `EDAMAM_APP_ID` | No | Scripts | Nutrition analysis |
| `EDAMAM_APP_KEY` | No | Scripts | Nutrition analysis |

**Graceful degradation:** App works with only Supabase keys. Missing AI/TTS keys just disable those features — the app never crashes.

---

## 8. Key Architectural Patterns

### Stale-While-Revalidate Caching
```
fetchRecipesByProtein(proteinId):
  1. Return cached recipes instantly (< 1-hour TTL)
  2. Fire background Supabase fetch
  3. Update cache when fresh data arrives
  4. If Supabase fails → cached data still served
  5. If no cache → built-in 60+ recipes (always available)
```

### Offline-First
The app never crashes without internet. Fallback chain:
```
Supabase live data → AsyncStorage cache → Built-in recipes (bundled in app)
```

### Device ID (No Auth)
```typescript
// Generated once, stored forever
deviceId = `${Platform.OS}_${Date.now()}_${random8chars}`
```
Used for: recipe ownership, rating dedup, sync tracking. No login required.

### Recipe Ingestion Pipeline
```
Prompts Excel → generate-recipes.js (Claude API)
    ↓
Recipe Excel → onboard-recipes-v2.js
    ├── Fingerprint dedup check
    ├── Insert recipe → Supabase
    ├── classifyRecipe() + getNutrition() (parallel)
    ├── Update recipe with classification data
    └── Generate hero + step images → Supabase Storage
```

---

## 9. Session Rules (from CLAUDE.md)

**ALWAYS do these:**
- Git commit before making changes: `git commit -m "before: [task description]"`
- Only edit source files directly
- Confirm changes by showing updated file contents

**NEVER do these:**
- Do NOT start any dev server or expo server
- Do NOT run `npx expo start` or any expo commands
- Do NOT open any browser or localhost URLs
- Do NOT take screenshots
- Do NOT wait for any bundle to load
- Do NOT build or compile the app

---

## 10. Common Tasks & Where to Look

| Task | Key File(s) |
|------|-------------|
| Add a new screen | `app/screens/NewScreen.tsx` + update navigation in `_layout.tsx` |
| Add a new protein type | `src/theme/index.ts` (PROTEINS array) + emoji mapping |
| Change recipe card UI | `components/RecipeCard.tsx` |
| Modify cooking flow | `app/screens/CookingModeScreen.tsx` |
| Update DB schema | `supabase/migrations/new_migration.sql` + `supabase/schema.sql` |
| Add a recipe via Excel | Place in `Recipes/input/`, run `node scripts/onboard-recipes-v2.js` |
| Generate recipes from prompts | Place prompts in `Recipes/prompts/`, run `node scripts/generate-recipes.js` |
| Regenerate step images | `node scripts/regenerate-step-images.js` |
| Change theme colors | `src/theme/index.ts` (Colors object) |
| Fix nutrition data | Update in Supabase directly or re-run Edamam via pipeline |
| Add classification tags | Update `scripts/pipeline/classifyRecipe.js` allowed values |
| Modify caching behavior | `services/recipeService.ts` (CACHE_TTL_MS, fetch functions) |
| Change AI rate limits | `AIRecipeBuilderScreen.tsx` line 24 (MAX_FREE_AI_RECIPES_PER_PROTEIN) |

---

## 11. Known Gotchas

1. **Nutrition is per-batch, not per-serving.** The `nutrition` JSONB stores totals for "2-3 servings". Divide by 2.5 for per-serving. The pipeline `calories`/`protein_g` columns ARE per-serving (from Edamam).

2. **Two ingredient formats exist.** Curated recipes: `{ "2-3 servings": [{name, quantity}] }`. Pipeline recipes: `["400g chicken", "2 tsp pepper"]`. Code must handle both.

3. **Difficulty mismatch.** Claude returns `Beginner/Intermediate/Advanced/Chef level`. DB only accepts `Easy/Medium/Hard`. Always map before insert.

4. **Image cache pruning is disabled.** `_layout.tsx` lines 6-7, 41-42 — commented out due to TurboModule crash with expo-file-system.

5. **`allergen_tags` not `allergens`.** Column was renamed. Old code might reference `allergens` — always use `allergen_tags`.

6. **`macro_tags` was dropped.** Don't add it back. Dietary filtering uses live numeric thresholds from `protein_g`, `fat_g`, etc.

7. **Edamam Basic tier has different response format.** Nutrients are inside `ingredients[].parsed[].nutrients`, NOT top-level `totalNutrients`.

8. **Fingerprint must match across platforms.** The Node.js (`scripts/lib/recipeFingerprint.js`) and TypeScript (`src/utils/recipeFingerprint.ts`) versions must produce identical SHA-256 hashes.

9. **AI recipe count never resets.** The `aiRecipeCount_{proteinId}` counter in AsyncStorage accumulates forever. No per-day or per-week reset.

10. **Feedback is local only.** `FeedbackScreen.tsx` saves to AsyncStorage but never uploads anywhere. No Supabase table exists for feedback.

---

## 12. Git & Version Control

- **Branch:** `master` (single branch)
- **Remote:** None configured (local repo only)
- **Commit convention:** `before: [task description]` at start of each session
- **Never force push, amend, or rebase** without explicit request
- **.gitignore:** Excludes `node_modules/`, `.expo/`, `.env`, `android/`
