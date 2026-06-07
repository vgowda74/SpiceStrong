# SpiceStrong Pre-Release Checklist

**Version:** ___________  
**Release Date:** ___________  
**Release Manager:** ___________  

---

## 📋 Pre-Release Gates (MUST PASS)

### 1. Code Quality
- [ ] All linting errors fixed: `npm run lint`
- [ ] No console errors/warnings (check app logs)
- [ ] Deprecated API usage removed
- [ ] Dead code removed

### 2. Automated Tests
```bash
npm run test:e2e:ios
```
- [ ] All 35 E2E tests pass
- [ ] No timeout errors
- [ ] No "element not found" errors
- [ ] All test suites complete without crash

**If any fail:** Fix the failing test before proceeding.

### 3. Manual Regression Testing
Complete: `REGRESSION_TEST_CHECKLIST.md`

- [ ] All 14 proteins load recipes (non-veg)
- [ ] All 6 veg proteins load recipes
- [ ] Diet preference filtering works
- [ ] Recipe filters work (spice, time, difficulty, cuisine)
- [ ] Favorites toggle works
- [ ] Meal planning works
- [ ] Offline mode works (cached recipes visible)
- [ ] App doesn't crash on rapid navigation
- [ ] No memory leaks (RAM stable after 10min use)

**Critical Issues:** Must be FIXED before release  
**High Issues:** Document in release notes if deferred  
**Low Issues:** Can be fixed in next sprint

### 4. Build & Bundle
- [ ] App builds successfully: `npm run ios` (or `npm run android`)
- [ ] No build warnings
- [ ] Bundle size acceptable (check with: `npm run build:analyze`)
- [ ] All assets included (images, fonts, icons)

### 5. Firebase/Supabase Sync
- [ ] All new recipes sync to Supabase correctly
- [ ] Device ID filtering works
- [ ] RLS policies allow correct data access
- [ ] Recipes appear in dashboard
- [ ] No duplicate recipes

### 6. Performance
- [ ] App startup time < 3 seconds
- [ ] Recipe list scroll smooth (60 FPS)
- [ ] Meal plan modal opens < 1 second
- [ ] No jank or frame drops

### 7. Security & Privacy
- [ ] No API keys in code (check .env)
- [ ] No personal data logs
- [ ] Supabase RLS policies correct
- [ ] No unencrypted sensitive data
- [ ] Privacy policy updated (if needed)

### 8. App Store/Play Store Requirements
- [ ] App version bumped (in app.json)
- [ ] Build number incremented
- [ ] Privacy policy included
- [ ] Permissions justified (camera, location, etc.)
- [ ] Screenshots updated
- [ ] Description updated
- [ ] No profanity in text

---

## 🚀 Release Steps

### 1. Create Release Branch
```bash
git checkout -b release/v{VERSION}
```

### 2. Update Version
```bash
# Update app.json
"version": "1.0.7",  # Update this

# Update CHANGELOG.md
# Add release notes
```

### 3. Build & Test
```bash
# Final build
npm run release  # This triggers: build → wait → submit to TestFlight

# Or manual:
npm run ios
# Test thoroughly once more
```

### 4. Submit to App Store / Play Store
```bash
# EAS submit (if using EAS)
npx eas submit --platform ios

# OR manual submission via App Store Connect / Google Play Console
```

### 5. Merge & Tag
```bash
git add .
git commit -m "chore: Release v{VERSION}"
git push origin release/v{VERSION}

# Create PR, review, merge to main
# Tag the commit
git tag v{VERSION}
git push origin v{VERSION}
```

### 6. Post-Release
- [ ] Update Discord/Slack with release notes
- [ ] Monitor crash reports for 24 hours
- [ ] Monitor user feedback
- [ ] Prepare hotfix branch if critical issues found

---

## 🔍 Smoke Testing (Final Check - 15 min)

Before hitting "submit", do these quick tests:

1. **Launch App**
   - [ ] Loads without crash
   - [ ] Protein selection visible

2. **Recipe Discovery**
   - [ ] Click "Chicken" → recipes load
   - [ ] Click recipe → details open
   - [ ] Ingredients visible
   - [ ] Nutrition visible

3. **Meal Planning**
   - [ ] Long-press recipe → meal plan modal
   - [ ] Select slot → "Breakfast"
   - [ ] Tap "Add" → recipe added
   - [ ] Navigate to Meal Plan tab → recipe appears

4. **Favorites**
   - [ ] Tap heart icon → fills
   - [ ] Navigate to Favorites tab → recipe shows
   - [ ] Tap heart again → unfills
   - [ ] Recipe disappears from favorites

5. **Filters**
   - [ ] Tap filter button
   - [ ] Select "Hot" spice level
   - [ ] Apply → recipes narrow
   - [ ] Clear filter → all recipes return

6. **Settings**
   - [ ] Change diet to "Vegetarian"
   - [ ] Return to proteins → non-veg hidden
   - [ ] Change back → all visible

7. **Network Toggle** (if you can do this)
   - [ ] Load app online
   - [ ] Go offline (airplane mode)
   - [ ] Recipes still visible (cached)
   - [ ] Go back online → no errors

**If any smoke test fails:** STOP. Fix before release.

---

## 📝 Release Notes Template

```markdown
# SpiceStrong v{VERSION}

**Released:** {DATE}

## 🎉 New Features
- Feature 1
- Feature 2

## 🐛 Bug Fixes
- Fixed non-veg recipes not showing (cached data issue)
- Fixed meal plan modal sometimes crashing

## ⚡ Performance
- 15% faster recipe loading
- Reduced memory usage in meal planning

## 📱 Updated
- iOS 15.1+
- Android 12+

## Known Issues
- AI recipe generation can take 45-60 seconds on slow connections
- Step images sometimes load slowly (investigate in next sprint)

---
**Tested on:** iPhone 14 Pro, Pixel 6  
**Crash Rate:** < 0.01%
```

---

## ✅ Sign-Off

### Development Team
- [ ] Code review passed
- [ ] Tests passed
- [ ] Build successful

**Dev Lead:** ___________  
**Date:** ___________

### QA Team
- [ ] All regression tests passed
- [ ] Smoke testing passed
- [ ] No critical issues found

**QA Lead:** ___________  
**Date:** ___________

### Product Lead
- [ ] Release approved
- [ ] Marketing/comms ready
- [ ] Ready to ship

**Product Lead:** ___________  
**Date:** ___________

---

## 🚨 If Something Goes Wrong

### Critical Bug Found
1. STOP the release
2. Revert changes: `git reset --hard origin/main`
3. Fix the bug
4. Re-run ALL tests
5. Start pre-release checklist again

### Build Failed
1. Clear build cache: `rm -rf node_modules && npm install`
2. Rebuild: `npm run ios`
3. Check for missing testIDs or other errors
4. Fix and retry

### Tests Failing
1. Check the specific failing test in `e2e/regression.e2e.ts`
2. Update test expectations or fix the feature
3. Re-run tests until all pass
4. DO NOT skip failing tests — fix them

---

## 📊 Pre-Release Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| E2E Test Pass Rate | 100% | ___% |
| Regression Tests Passed | 90+ / 90 | ___ / 90 |
| Build Time | < 10 min | ___m |
| App Startup | < 3 sec | ___s |
| Crash Rate (beta) | < 0.01% | ___% |

---

## 📞 Escalation Contacts

- **Dev Lead:** [Name/Slack]
- **QA Lead:** [Name/Slack]
- **Product Lead:** [Name/Slack]
- **DevOps:** [Name/Slack]

---

**Last Updated:** 2026-06-06  
**Next Review:** [Before next release]
