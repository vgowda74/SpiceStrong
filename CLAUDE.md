# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## App Info

SpiceStrong is a guided high-protein cooking app — users select a protein, browse recipes, and follow step-by-step cooking mode with timers.

- React Native + Expo (~54), Expo Router v6 (file-based routing)
- iOS primary target; Android in v1.1
- No web version

## Session Rules

- Do NOT open any browser or localhost URLs
- Do NOT take any screenshots
- Do NOT wait for any bundle to load
- Do NOT build or compile the app
- Only edit source files directly
- Confirm changes by showing updated file contents only
- At the start of every session, before making any code changes, do a git commit with message `before: [task description]` to preserve the current state

## Commands

```bash
npx expo start          # Start dev server (scan QR with Expo Go or use simulator)
npm run lint            # ESLint via expo lint
npm run reset-project   # Resets app/ to starter state (destructive)
```

No test runner is configured.

## Architecture

### Routing (`app/`)

Expo Router file-based routing. Entry point is `app/index.tsx` (splash/landing), which pushes imperatively to screens.

```
app/
  index.tsx                    # Landing/splash — entry point
  _layout.tsx                  # Root Stack layout; requests notification perms, seeds cache on mount
  (tabs)/                      # Legacy tab shell (unused by main flow)
  screens/
    ProteinSelectionScreen.tsx
    RecipeListScreen.tsx
    RecipeOverviewScreen.tsx
    CookingStartScreen.tsx
    IngredientChecklistScreen.tsx
    CookingModeScreen.tsx       # Step-by-step cooking with timers
    AIRecipeBuilderScreen.tsx   # Voice + text recipe generation
    AIRecipeResultScreen.tsx
    AddRecipeScreen.tsx
    RecipeFilterScreen.tsx
    CustomRecipeScreen.tsx
    FeedbackScreen.tsx
```

### Data Layer

Recipe data has three tiers, resolved in this priority order:

1. **Supabase** (`services/recipeService.ts`) — stale-while-revalidate; Supabase rows cached to AsyncStorage with 1-hour TTL
2. **Built-in curated recipes** (`src/data/builtInRecipes.ts`) — static data shipped with the app
3. **User-created local recipes** — stored in AsyncStorage via `src/store/recipes.ts` (key: `spicestrong_recipes`)

`src/store/recipes.ts` is the canonical type source (`SavedRecipe`, `CookingStep`, `IngredientsByTier`, etc.) and re-exports Supabase-backed helpers by dynamically importing `services/recipeService`.

### Serving Tiers

Recipes have two quantity tiers: `'2-3 servings'` and `'4-6 servings'`. The 4-6 tier is always exactly 2x the 2-3 tier. Nutrition is stored as batch totals for the 2-3 tier; `getCompletionStats()` in `src/store/recipes.ts` converts to per-serving values.

### AI Recipe Generation

`app/screens/AIRecipeBuilderScreen.tsx` calls `@fal-ai/client` with the system prompt from `src/prompts/spiceBuilderPrompt.ts`. That prompt file is shared between the in-app builder and `scripts/generate-recipes.js` — **do not modify it without considering both consumers**.

### Services (`services/`)

| File | Purpose |
|------|---------|
| `supabase.ts` | Supabase client; needs `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` env vars |
| `recipeService.ts` | Supabase fetch + AsyncStorage cache + pending AI recipe sync |
| `recipeReviewService.ts` | Claude-based recipe review for user-submitted recipes |
| `ratingsService.ts` | Community ratings/favourites via Supabase |
| `imageGenerationService.ts` | fal.ai image generation for recipes |
| `imageCacheService.ts` | Local image cache (note: `pruneImageCache` is disabled — causes TurboModule crash with current expo-file-system API) |
| `nutritionService.ts` | Edamam nutrition pipeline |

### Theming

- **App theme**: `src/theme/index.ts` — dark copper-brown palette (`background: #0F0F0F`, `primary: #E85D26`). Use this for all new screens.
- **Legacy theme**: `constants/theme.ts` — light/dark Colors used only by the legacy `(tabs)` shell and `ThemedText`/`ThemedView` components.
- Font: `PlayfairDisplay_700Bold` (loaded via expo-font); always specify `Platform.select` fallback.

### Path Alias

`@/` maps to the project root (configured in `tsconfig.json`). Use `@/components/...`, `@/src/...`, etc.
