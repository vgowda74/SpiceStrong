# 🚀 SpiceStrong Testing — Quick Reference Card

**Keep this handy before every release!**

---

## 3-Step Release Process

### Step 1: Automated Tests (15 minutes)
```bash
npm run test:all
```
Runs:
- ✅ 35 E2E app tests (user flows)
- ✅ 20 database audit tests (data quality)

**Must pass before proceeding.**

### Step 2: Manual Regression (45 minutes)
Open: **`REGRESSION_TEST_CHECKLIST.md`**

Go through 90+ scenarios. Check off as you complete.

**Issues found?** Fix them, then re-run Step 1.

### Step 3: Release Gate (30 minutes)
Open: **`PRE_RELEASE_CHECKLIST.md`**

Verify:
- ☑ Code quality (lint)
- ☑ Tests passed (Step 1)
- ☑ Manual complete (Step 2)
- ☑ Build succeeds
- ☑ Performance OK
- ☑ Security OK
- ☑ All sign-offs collected

**All gates pass?** → Ship it! 🚀

---

## Test Commands Cheat Sheet

```bash
# ────────── E2E APP TESTS ──────────
npm run test:e2e:ios              # Run all 35 app tests
npm run test:e2e:ios:debug        # With logs, videos, screenshots
npm run test:e2e:android          # Android version

# ────────── DATABASE AUDIT TESTS ──────────
npm run test:db:audit             # Run all 20 database tests
npm run test:db:audit:watch       # Watch mode (auto-rerun)

# ────────── COMBINED ──────────
npm run test:all                  # E2E + Database (both suites)

# ────────── UTILITIES ──────────
npm run lint                       # Check code quality
npm run ios                        # Build app
npm run release                    # Build + submit to TestFlight
```

---

## What Each Test Suite Checks

### E2E Tests (35 tests) — `npm run test:e2e:ios`
**User-focused testing** — does the app work?

| Suite | Tests | Checks |
|-------|-------|--------|
| Recipe Discovery | 14 | All proteins load recipes |
| Diet Filtering | 2 | Veg/non-veg isolation |
| Recipe Filters | 6 | Spice, time, difficulty, cuisine |
| Favorites | 3 | Heart icon toggle works |
| Meal Planning | 3 | Add to meal plan works |
| AI Generation | 3 | Recipe creation works |
| Offline Mode | 2 | Cache + sync works |
| Stability | 2 | No crashes on navigation |

**Time:** ~10 minutes

### Database Audit Tests (20 tests) — `npm run test:db:audit`
**Data-focused testing** — is the data correct?

| Suite | Tests | Checks |
|-------|-------|--------|
| Recipe Counts | 6 | All proteins have >= 5 recipes |
| Data Integrity | 4 | No missing fields, valid formats |
| Duplicates | 2 | No duplicate names |
| Active Status | 2 | >= 90% recipes active |
| Source Types | 3 | Has curated + AI recipes |
| Recent Adds | 2 | Recipes added in last 7/30 days |
| Health Report | 1 | Comprehensive stats |

**Time:** ~2-5 minutes

---

## Pre-Release Checklist (TL;DR)

```
☐ Step 1: npm run test:all (35 + 20 tests must pass)
☐ Step 2: Manual regression (REGRESSION_TEST_CHECKLIST.md)
☐ Step 3: Release gates (PRE_RELEASE_CHECKLIST.md)
☐ Step 4: npm run release
☐ Step 5: Monitor for 24 hours
```

---

## Common Issues & Quick Fixes

| Problem | Solution |
|---------|----------|
| Tests can't find element | Add `testID` prop to component |
| Database test timeout | Increase Jest timeout: `--testTimeout=30000` |
| Recipe counts don't match | Update `EXPECTED_RECIPE_COUNTS` in database-audit.e2e.ts |
| App won't build | `rm -rf node_modules && npm install && npm run ios` |
| Environment vars not set | Add to `.env`: `EXPO_PUBLIC_SUPABASE_URL=...` |

---

## File Locations

```
SpiceStrong/
├── e2e/
│   ├── regression.e2e.ts          ← 35 E2E tests
│   ├── database-audit.e2e.ts      ← 20 database tests
│   ├── helpers.ts                 ← Test utilities
│   ├── README.md                  ← E2E docs
│   └── DATABASE_AUDIT_README.md   ← Database docs
│
├── REGRESSION_TEST_CHECKLIST.md   ← 90+ manual tests
├── PRE_RELEASE_CHECKLIST.md       ← Release gates
├── TESTING_SETUP_SUMMARY.md       ← Full overview
├── TESTING_FLOW.md                ← Architecture diagrams
└── QUICK_TEST_REFERENCE.md        ← This file
```

---

## Before Release: Copy & Paste

```bash
# 1. Run all automated tests
npm run test:all

# If all pass:
# 2. Manual regression (open REGRESSION_TEST_CHECKLIST.md)
# 3. Sign-offs (open PRE_RELEASE_CHECKLIST.md)
# 4. Build & ship
npm run release
```

---

## Success Criteria

✅ **Step 1:** npm run test:all → 55/55 PASS  
✅ **Step 2:** Manual checklist → 90+ complete  
✅ **Step 3:** Release gates → All checked  
✅ **Build:** npm run ios → SUCCESS  
✅ **Result:** READY TO SHIP 🚀

---

## Documentation Links

- **Full E2E guide:** `e2e/README.md`
- **Full Database guide:** `e2e/DATABASE_AUDIT_README.md`
- **Manual tests:** `REGRESSION_TEST_CHECKLIST.md`
- **Release gates:** `PRE_RELEASE_CHECKLIST.md`
- **Test architecture:** `TESTING_FLOW.md`
- **Setup summary:** `TESTING_SETUP_SUMMARY.md`

---

**Print this card and tape it above your desk. Use before every release.**

Last updated: 2026-06-06
