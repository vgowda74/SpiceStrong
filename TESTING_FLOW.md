# 🔄 SpiceStrong Testing Flow & Architecture

## Development Workflow

```
┌─────────────────────────────────────────────────────────┐
│         Developer Creates Feature                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Code feature                                        │
│  2. Add testIDs to components                           │
│  3. Commit & push to feature branch                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│         Create Pull Request                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  GitHub detects PR → Triggers CI/CD workflow           │
│                                                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│         GitHub Actions Runs Tests (Auto)                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  .github/workflows/e2e-regression-tests.yml             │
│                                                          │
│  ✓ Builds app                                           │
│  ✓ Runs 35 E2E tests (Detox)                            │
│  ✓ Collects logs, videos, screenshots                   │
│  ✓ Posts results as PR comment                          │
│                                                          │
│  Result: ✅ PASS or ❌ FAIL                              │
│                                                          │
└─────────────────────────────────────────────────────────┘
                          ↓
                  ┌───────┴────────┐
                  ↓                ↓
            ✅ ALL PASS        ❌ SOME FAIL
                  ↓                ↓
            Code Review      Fix Failed Tests
                  ↓                ↓
            Can Merge?        Commit & Push
                  ↓           (Re-runs tests)
               MERGE              ↓
                  ↓           ❌ Still failing?
                  │           ↓
                  │      Ask for help
                  │           ↓
                  └────────→ MERGE when fixed
                           
┌─────────────────────────────────────────────────────────┐
│         Release Time: Manual Testing                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Developer: npm run test:e2e:ios                    │
│     → All 35 tests must pass locally                    │
│                                                          │
│  2. QA: Run REGRESSION_TEST_CHECKLIST.md               │
│     → 90+ manual test scenarios                         │
│     → ~1 hour, comprehensive coverage                  │
│                                                          │
│  3. Product: Review PRE_RELEASE_CHECKLIST.md           │
│     → Security checks                                   │
│     → Performance gates                                 │
│     → Build success                                     │
│                                                          │
│  4. All sign-offs complete → READY TO SHIP             │
│                                                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│         Build & Release                                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  npm run release                                        │
│                                                          │
│  1. Build app (2-3 min)                                 │
│  2. Wait for build to complete (15-30 min)             │
│  3. Auto-submit to TestFlight/Play Store                │
│                                                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│         Post-Release Monitoring                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Monitor crash reports for 24 hours                     │
│  If critical issue found → Prepare hotfix              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Test Architecture

```
┌────────────────────────────────────────────────────────┐
│            User Interaction                            │
│  (Tap buttons, swipe, navigate, enter text)           │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ↓
┌────────────────────────────────────────────────────────┐
│         Detox Test Suite (e2e/)                        │
├────────────────────────────────────────────────────────┤
│                                                        │
│  regression.e2e.ts (35 tests)                         │
│  ├─ Recipe Discovery (14 tests)                       │
│  ├─ Diet Filtering (2 tests)                          │
│  ├─ Recipe Filters (6 tests)                          │
│  ├─ Favorites & Details (3 tests)                     │
│  ├─ Meal Planning (3 tests)                           │
│  ├─ AI Generation (3 tests)                           │
│  ├─ Offline/Sync (2 tests)                            │
│  └─ Stability (2 tests)                               │
│                                                        │
│  helpers.ts (12 utilities)                            │
│  ├─ waitForElement()                                  │
│  ├─ tapElement()                                      │
│  ├─ typeText()                                        │
│  ├─ scrollTo()                                        │
│  ├─ expectVisible()                                   │
│  └─ ... (8 more)                                      │
│                                                        │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ↓
┌────────────────────────────────────────────────────────┐
│    SpiceStrong App (iOS Simulator / Android Emu)      │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ProteinSelectionScreen                              │
│  ├─ testID="protein-selection-screen"                │
│  ├─ testID="protein-card-chicken"                    │
│  ├─ testID="protein-card-beef"                       │
│  └─ ... (12 more proteins)                           │
│                                                        │
│  RecipeListScreen                                     │
│  ├─ testID="recipe-list-screen"                      │
│  ├─ testID="recipe-card-0"                           │
│  ├─ testID="filter-button"                           │
│  └─ testID="recipe-card-0-favorite"                  │
│                                                        │
│  RecipeDetailScreen                                   │
│  ├─ testID="recipe-detail-screen"                    │
│  ├─ testID="nutrition-section"                       │
│  └─ testID="ingredients-section"                     │
│                                                        │
│  Other Screens                                        │
│  ├─ MealPlanModal                                     │
│  ├─ FilterModal                                       │
│  └─ SettingsScreen                                    │
│                                                        │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ↓
┌────────────────────────────────────────────────────────┐
│           Assertions (Jest Matchers)                   │
├────────────────────────────────────────────────────────┤
│                                                        │
│  expect(element).toBeVisible()                        │
│  expect(element).toHaveText("Chicken Tikka")          │
│  expect(element).not.toBeVisible()                    │
│  expect(...).toExist()                                │
│                                                        │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ↓
┌────────────────────────────────────────────────────────┐
│         Test Result (PASS / FAIL)                     │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ✅ 35/35 PASS → Ready to merge                       │
│  ❌ 3/35 FAIL  → Fix and retry                        │
│                                                        │
│  Artifacts generated:                                 │
│  ├─ Logs (console output)                            │
│  ├─ Videos (test recording)                          │
│  ├─ Screenshots (at failures)                        │
│  └─ Test report (JSON)                               │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## Manual Testing Flow

```
┌────────────────────────────────────────────────────────┐
│    QA / Tester Opens REGRESSION_TEST_CHECKLIST.md     │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Step 1: App Launch & Navigation                      │
│  ☐ App launches                                       │
│  ☐ Protein selection visible                         │
│  ☐ All 14 proteins shown                             │
│                                                        │
│         ↓ (check off each as you complete)            │
│                                                        │
│  Step 2: Recipe Discovery (14 test cases)             │
│  ☐ Chicken loads recipes                             │
│  ☐ Beef loads recipes                                │
│  ☐ ... (12 more proteins)                            │
│                                                        │
│         ↓ (~30 min in)                                │
│                                                        │
│  Step 3: Diet Filtering                              │
│  ☐ Set to vegetarian → non-veg hidden                │
│  ☐ Set to non-veg → all visible                      │
│                                                        │
│         ↓ (~40 min in)                                │
│                                                        │
│  Step 4-8: Features (Filters, Meal Plan, Favorites)  │
│  ☐ Each feature tested thoroughly                    │
│                                                        │
│         ↓ (~55 min in)                                │
│                                                        │
│  Step 9-15: Advanced (Offline, Performance, Stability)│
│  ☐ Final system checks                               │
│                                                        │
│         ↓ (~60+ min, finished)                        │
│                                                        │
│  Summary Section:                                     │
│  ├─ Total passed / 90                                │
│  ├─ Issues found (with severity)                     │
│  └─ Tester sign-off                                  │
│                                                        │
└────────────────────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ↓                     ↓
    🟢 ALL PASS          🔴 FAILURES
        ↓                     ↓
   READY TO               Categorize by
   RELEASE               Severity
        ↓                     ↓
                    ┌─────────┴─────────┐
                    ↓                   ↓
              CRITICAL          HIGH/MED/LOW
              ISSUES            ISSUES
                    ↓                   ↓
                   FIX            Document
                    ↓             in notes
                RETEST              ↓
                    ↓           RELEASE?
                   PASS             ↓
                    ↓            Discuss
                  RELEASE        with team
```

---

## Release Gate Checklist Flow

```
┌──────────────────────────────────────────────────────────┐
│  PRE_RELEASE_CHECKLIST.md                               │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  GATE 1: Code Quality                                   │
│  ☐ npm run lint → PASS                                  │
│  ☐ No console errors                                    │
│  ☐ No deprecated APIs                                   │
│           ↓ FAIL → FIX CODE                             │
│           ↓ PASS → CONTINUE                             │
│                                                          │
│  GATE 2: Automated Tests                                │
│  ☐ npm run test:e2e:ios → 35/35 PASS                    │
│           ↓ FAIL → FIX TESTS                            │
│           ↓ PASS → CONTINUE                             │
│                                                          │
│  GATE 3: Manual Regression                              │
│  ☐ REGRESSION_TEST_CHECKLIST.md → COMPLETE              │
│           ↓ FAIL → FIX FEATURES                         │
│           ↓ PASS → CONTINUE                             │
│                                                          │
│  GATE 4: Build & Performance                            │
│  ☐ npm run ios → SUCCESS                                │
│  ☐ Build time < 10 min                                  │
│  ☐ No memory leaks                                      │
│           ↓ FAIL → DEBUG BUILD                          │
│           ↓ PASS → CONTINUE                             │
│                                                          │
│  GATE 5: Security & Privacy                             │
│  ☐ No API keys exposed                                  │
│  ☐ No personal data in logs                             │
│  ☐ RLS policies correct                                │
│           ↓ FAIL → FIX SECURITY                         │
│           ↓ PASS → CONTINUE                             │
│                                                          │
│  GATE 6: Smoke Testing                                  │
│  ☐ App launches without crash                           │
│  ☐ Recipes load                                         │
│  ☐ Meal planning works                                  │
│  ☐ Favorites toggle works                               │
│           ↓ FAIL → BUG FOUND, FIX IT                   │
│           ↓ PASS → CONTINUE                             │
│                                                          │
│  GATE 7: Sign-Offs                                      │
│  ☐ Dev team sign-off                                    │
│  ☐ QA team sign-off                                     │
│  ☐ Product sign-off                                     │
│           ↓ MISSING → GET SIGN-OFFS                    │
│           ↓ COMPLETE → ✅ READY TO SHIP                │
│                                                          │
└──────────────────────────────────────────────────────────┘
                          ↓
                   ✅ SHIP APP!
```

---

## Time Estimates

```
Activity                          | Time   | When
─────────────────────────────────┼────────┼──────────────────────
Local dev (add testID props)      | 1-2h   | As you build features
Dry run E2E tests                 | 10-15m | Before feature merge
Automated CI/CD tests (GitHub)    | 5-10m  | On every PR (automatic)
Manual regression testing         | 45-60m | Before release
Pre-release checklist             | 30-45m | Before release
Build & submit to TestFlight      | 15-20m | Release day
Total before release              | 2-3h   | Release day
Post-release monitoring           | 1d     | After shipping
─────────────────────────────────┴────────┴──────────────────────
```

---

## File Dependencies

```
Development
    ↓
Add testID props to components
    ↓
Create PR
    ↓
.github/workflows/e2e-regression-tests.yml (auto runs)
    ↓ Uses
    ├─ .detoxrc.json (config)
    ├─ e2e/regression.e2e.ts (35 tests)
    ├─ e2e/helpers.ts (test utilities)
    └─ package.json (test scripts)
    ↓
PR passes → Code review
    ↓
Merge to main
    ↓
Release time
    ↓
Developer runs locally:
    └─ npm run test:e2e:ios
       ├─ Uses e2e/regression.e2e.ts
       ├─ Uses e2e/helpers.ts
       └─ Uses .detoxrc.json
    ↓
QA runs:
    └─ REGRESSION_TEST_CHECKLIST.md
    ↓
Product reviews:
    └─ PRE_RELEASE_CHECKLIST.md
    ↓
All sign-offs complete
    ↓
npm run release
    └─ Builds app
    └─ Submits to TestFlight/Play Store
```

---

## Success Criteria

✅ **Local E2E Tests:** 35/35 pass  
✅ **Manual Regression:** 90+ scenarios complete  
✅ **Pre-Release Gates:** All checkboxes checked  
✅ **Build Succeeds:** No warnings, under 10 min  
✅ **Performance:** App startup < 3 sec  
✅ **Security:** No exposed keys or private data  
✅ **Sign-Offs:** Dev, QA, Product all approved  

**Result:** → **READY TO SHIP** 🚀

