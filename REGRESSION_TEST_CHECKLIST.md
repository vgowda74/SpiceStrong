# SpiceStrong Regression Test Checklist

**Build Version:** ___________  
**Tester:** ___________  
**Date:** ___________  
**Platform:** ☐ iOS  ☐ Android  ☐ Both  
**Device:** ___________  

---

## 🧪 Automated E2E Tests

Run before manual testing:

```bash
# iOS
npm run test:e2e:ios

# Android
npm run test:e2e:android

# Debug mode (with logs & videos)
npm run test:e2e:ios:debug
```

**Status:** ☐ PASS  ☐ FAIL  

**If Failed:** Note the specific test below that failed.

---

## 📋 Manual Regression Tests

Complete these in order. Check off as you go.

### 1️⃣ **App Launch & Navigation**
- [ ] App launches without crash
- [ ] Protein selection screen appears
- [ ] All 14 proteins visible (8 non-veg + 6 veg)
  - Non-veg: Chicken, Beef, Lamb, Goat, Pork, Fish, Prawns, Eggs
  - Veg: Paneer, Tofu, Soy, Beans, Dairy, Protein Powder

### 2️⃣ **Recipe Discovery - Non-Veg Proteins**
Test each non-veg protein loads recipes:
- [ ] Chicken → recipes load (tap card, see details)
- [ ] Beef → recipes load
- [ ] Lamb → recipes load
- [ ] Goat → recipes load
- [ ] Pork → recipes load
- [ ] Fish → recipes load
- [ ] Prawns → recipes load
- [ ] Eggs → recipes load

### 3️⃣ **Recipe Discovery - Veg Proteins**
Test each veg protein loads recipes:
- [ ] Paneer → recipes load
- [ ] Tofu → recipes load
- [ ] Soy → recipes load
- [ ] Beans & Lentils → recipes load
- [ ] Dairy → recipes load
- [ ] Protein Powder → recipes load

### 4️⃣ **Diet Preference Filtering**

#### Vegetarian User
- [ ] Go to Settings
- [ ] Set diet to "Vegetarian"
- [ ] Return to protein selection
- [ ] Non-veg proteins are hidden/disabled
- [ ] Only veg proteins visible (Paneer, Tofu, Soy, Beans, Dairy, Protein Powder)
- [ ] Tapping non-veg protein shows error or redirect

#### Non-Vegetarian User
- [ ] Set diet to "Non-Vegetarian"
- [ ] All 14 proteins visible
- [ ] All proteins have recipes

### 5️⃣ **Recipe Filters**
From any protein's recipe list:
- [ ] Filter button opens filter modal
- [ ] **Spice Level:** Select "Hot" → recipes update
- [ ] **Cooking Time:** Select "15-30 min" → recipes update
- [ ] **Difficulty:** Select "Easy" → recipes update
- [ ] **Cuisine:** Select "Indian" → recipes update
- [ ] **Multiple filters:** Apply 2+ at once → recipes narrow correctly
- [ ] **Clear filters:** Button clears all selections
- [ ] Filter chips visible showing active filters
- [ ] Clearing chips removes individual filters

### 6️⃣ **Recipe Details & Nutrition**
Tap on any recipe card:
- [ ] Recipe detail screen opens
- [ ] Recipe name visible
- [ ] Nutrition info displayed (calories, protein, carbs, fat)
- [ ] Ingredients section with quantities (2-3 servings & 4-6 servings)
- [ ] Cooking steps with descriptions
- [ ] Chef tip displays (if available)
- [ ] Difficulty badge shows
- [ ] Cook time shows
- [ ] Spice level indicator shows
- [ ] Close/back button returns to recipe list

### 7️⃣ **Favorites**
- [ ] Tap heart icon on recipe card → heart fills
- [ ] Tap filled heart → heart unfills (toggles correctly)
- [ ] Switch to "★ Favourites" tab
- [ ] Only favorited recipes appear
- [ ] Add/remove from favorites while in list
- [ ] Favorites persist after app restart

### 8️⃣ **Meal Planning**
- [ ] Long-press recipe card → meal plan modal opens
- [ ] Modal shows date selector
- [ ] Modal shows meal slot options (Breakfast, Lunch, Dinner, Snack)
- [ ] Select a slot
- [ ] Tap "Add to Meal Plan" → confirms & closes
- [ ] Go to Meal Plan tab
- [ ] Recipe appears in selected slot for that date
- [ ] Can view meals across dates
- [ ] Remove recipe from meal plan (swipe or button)
- [ ] Error shows when slot is full (max 3 recipes per slot)

### 9️⃣ **Search & Sorting**
- [ ] Type in search box → filters recipes by name
- [ ] Search is case-insensitive
- [ ] Search works across all tabs (All, Breakfast, Lunch, Snack, Favorites)
- [ ] Sort by "Newest" works
- [ ] Sort by "Most Cooked" works
- [ ] Sort by "Rating" works

### 🔟 **Offline Mode**
- [ ] Load recipes while online
- [ ] Turn on airplane mode
- [ ] App still shows cached recipes
- [ ] Recipe details still open
- [ ] Return online → no "out of date" warnings should persist
- [ ] New recipes sync when back online (if any pending)

### 1️⃣1️⃣ **AI Recipe Generation** *(if enabled)*
- [ ] Tap "AI Recipe Builder" button
- [ ] Input description (e.g., "high protein butter chicken")
- [ ] Select protein
- [ ] Tap "Generate"
- [ ] Wait for AI (30-60 sec) → recipe appears with ingredients & steps
- [ ] Recipe shows nutrition estimates
- [ ] Tap "Save Recipe" → saves locally & syncs to Supabase
- [ ] Saved recipe appears in protein list

### 1️⃣2️⃣ **Settings & Profile**
- [ ] Tap profile menu
- [ ] Edit dietary restrictions (veg/non-veg)
- [ ] Edit fitness goals
- [ ] Save preferences → applies immediately
- [ ] Logout → app returns to login/onboarding
- [ ] Login again → previous settings restored

### 1️⃣3️⃣ **Performance & Stability**
- [ ] No crashes on rapid protein selection
- [ ] No freezes when loading recipes (>50 recipes per protein)
- [ ] Scrolling recipe lists is smooth
- [ ] Filter modal opens/closes smoothly
- [ ] No memory leaks (check RAM in device settings after 10min use)
- [ ] App doesn't crash on network reconnect

### 1️⃣4️⃣ **Data Persistence**
- [ ] Add recipe to favorites
- [ ] Kill app completely
- [ ] Relaunch → favorites still there
- [ ] Add recipe to meal plan
- [ ] Restart device
- [ ] Relaunch app → meal plan persists
- [ ] Sync status shows pending recipes (if any)

### 1️⃣5️⃣ **Images & Media**
- [ ] Recipe hero images load
- [ ] Step-by-step images load
- [ ] Images cache properly (fast on 2nd view)
- [ ] Missing images show graceful placeholder
- [ ] No console errors for image loading

---

## 📊 Summary

**Total Tests:** 90+  
**Passed:** ___ / 90  
**Failed:** ___ / 90  
**Blocked:** ___ / 90  

---

## 🐛 Issues Found

| # | Severity | Feature | Description | Reproduction |
|---|----------|---------|-------------|--------------|
| 1 | [CRITICAL/HIGH/MED/LOW] | | | |
| 2 | | | | |
| 3 | | | | |

---

## ✅ Sign-Off

- [ ] All critical issues resolved
- [ ] All high-priority issues resolved or documented
- [ ] Performance acceptable
- [ ] Ready for release

**Tester Sign-Off:** ___________  
**Date:** ___________  
**Notes:** 

---

## 🔗 Quick Links

- [E2E Test Code](./e2e/regression.e2e.ts)
- [GitHub Actions Workflow](./.github/workflows/e2e-regression-tests.yml)
- [Test Helpers](./e2e/helpers.ts)

## 📝 Running Tests Locally

```bash
# Install dependencies
npm install

# Run E2E tests (iOS)
npm run test:e2e:ios

# Run E2E tests with debugging
npm run test:e2e:ios:debug

# Run Android
npm run test:e2e:android
```

---

**Last Updated:** 2026-06-06
