# SpiceStrong Roadmap

## Current Version: 1.0.0 (Beta)

### What's Built (v1.0)

**Core Experience:**
- [x] Protein selection screen (14 protein types)
- [x] Recipe list with cards, ratings, nutrition badges
- [x] Recipe overview with ingredient tiers (2-3 / 4-6 servings)
- [x] Guided cooking mode (step-by-step with images)
- [x] Cooking timers with push notifications
- [x] Haptic feedback on interactions
- [x] Voice guidance (expo-speech)
- [x] Community cook count tracking
- [x] Post-cook feedback & rating system

**AI Features:**
- [x] AI recipe builder (Claude API)
- [x] AI recipe result screen with step images
- [x] Rate limiting per protein type (1 free per protein in prod)
- [x] Recipe fingerprint deduplication (SHA-256)

**Backend Pipeline:**
- [x] Recipe generation from prompts (Claude API → Excel)
- [x] Recipe onboarding from Excel (onboard-recipes-v2.js)
- [x] 10-dimension classification (Claude API)
- [x] USDA nutrition analysis (Edamam API)
- [x] AI step image generation (fal.ai)
- [x] Step image regeneration with quantity-aware prompts
- [x] Fingerprint dedup at DB level (partial unique index)

**Design:**
- [x] Dark warm copper-brown theme
- [x] Playfair Display typography
- [x] Orange accent (#E85D26)
- [x] Recipe card gradients
- [x] Shareable recipe card for social media

---

### Beta Backlog (Pre-Launch)

**High Priority:**
- [ ] Share Cart on Great Choice page (share grocery list after ingredient selection)
- [ ] Global grocery cart (persistent across recipes until manually cleared)
- [ ] Fix ingredients per cooking step (some existing recipes show wrong ingredients)
- [ ] Fix 0 calories on nutrition card (paneer bhurji + others with incomplete data)
- [ ] Update paneer bhurji nutrition in Supabase (300 cal for whole batch too low)
- [ ] Integrate classifyRecipe + getNutrition into onboard-recipes-v2.js (imports added, wiring incomplete)
- [ ] AI-generated recipes should update newly created classification categories

**Medium Priority:**
- [ ] Recipe search/filter by classification tags (dietary, allergen, fitness goal)
- [ ] Favorites/bookmarks system
- [ ] Recipe difficulty filter on list screen
- [ ] Improve ingredient-to-step matching for auto-matched recipes

**Low Priority:**
- [ ] Custom recipe screen polish
- [ ] Remove boilerplate tabs (Home/Explore) from navigation
- [ ] Clean up unused modal.tsx

---

### v1.1 — Android Launch

- [ ] Android platform testing and fixes
- [ ] Android notification channel setup (already configured)
- [ ] Android-specific UI adjustments
- [ ] Play Store listing and metadata
- [ ] Feature parity verification

---

### v1.2 — Community & Social

- [ ] User accounts (Supabase Auth integration)
- [ ] Community recipe submissions
- [ ] Recipe reviews with text comments
- [ ] Social sharing (Instagram Stories, WhatsApp)
- [ ] User profiles with cooking history
- [ ] Follow other cooks

---

### v1.3 — Smart Features

- [ ] Meal planning (weekly/daily)
- [ ] Grocery list export (Apple Reminders, Google Keep)
- [ ] Nutrition tracking dashboard
- [ ] Recipe recommendations based on history
- [ ] Pantry management (what's in my kitchen)

---

### v2.0 — Premium

- [ ] Pro recipes (is_pro flag already in schema)
- [ ] Unlimited AI recipe generation
- [ ] Advanced nutrition tracking
- [ ] Custom meal plans
- [ ] Ad-free experience
- [ ] Subscription via RevenueCat / StoreKit

---

## Known Issues

| Issue | Status | Notes |
|-------|--------|-------|
| expo-file-system TurboModule crash | Workaround | pruneImageCache disabled in _layout.tsx |
| Some recipes show 0 calories | Open | Paneer bhurji + others with incomplete nutrition |
| Ingredient-step matching false positives | Open | "coriander" in description matching garnish ingredient |
| Difficulty CHECK constraint | Fixed | Mapping added: Beginner→Easy, Intermediate→Medium, etc. |
| Edamam 555 low_quality errors | Fixed | Added cleanForEdamam() to strip prep notes |

---

## Feature Flags

| Flag | File | Dev | Prod |
|------|------|-----|------|
| MAX_FREE_AI_RECIPES_PER_PROTEIN | AIRecipeBuilderScreen.tsx | 0 (unlimited) | 1 |
| AI_ENABLED_PROTEINS | AIRecipeBuilderScreen.tsx | [] (all) | [] (all) |
| ENABLED_PROTEINS | ProteinSelectionScreen.tsx | [] (all) | [] (all) |
