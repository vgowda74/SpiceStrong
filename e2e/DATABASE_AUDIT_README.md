# 📊 Database Audit Tests

Automated tests to verify recipe data integrity in Supabase.

## What Gets Tested

### 1. **Recipe Counts by Protein** (6 tests)
- ✓ All 14 proteins have recipes
- ✓ Chicken has 5-500 recipes
- ✓ Beef has 5-500 recipes
- ✓ Lamb has 5-500 recipes
- ✓ Veg proteins have recipes (paneer, tofu, soy, beans, milk, whey)
- ✓ Total recipes >= 100

### 2. **Data Integrity** (4 tests)
- ✓ No missing required fields (name, protein_id, ingredients, steps)
- ✓ Valid ingredients format (object with tier keys)
- ✓ Valid steps format (array with descriptions)
- ✓ Valid protein_id values (must be one of 14 valid IDs)

### 3. **Duplicate Detection** (2 tests)
- ✓ No exact name duplicates within same protein
- ✓ No recipes with missing fingerprints (if enabled)

### 4. **Active vs Inactive** (2 tests)
- ✓ More active recipes than inactive
- ✓ At least 90% of recipes are active

### 5. **Recipe Source Distribution** (3 tests)
- ✓ Has curated recipes
- ✓ Tracks AI-generated recipes
- ✓ Shows source distribution report

### 6. **Recent Additions** (2 tests)
- ✓ Recipes added in last 30 days
- ✓ Shows recipes added per protein (last 7 days)

### 7. **Database Health Report** (1 test)
- ✓ Comprehensive stats (total, active, source types)

**Total: 20 audit tests**

---

## Running Tests

### Prerequisites
```bash
# Make sure environment variables are set
export EXPO_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"

# Or add to .env file in project root
```

### Run Database Audit Tests

```bash
# Quick run
npm run test:db:audit

# Watch mode (re-runs on file changes)
npm run test:db:audit:watch

# Run both E2E + Database tests
npm run test:all

# Verbose output
npm run test:db:audit -- --verbose

# Generate JSON report
npm run test:db:audit -- --json --outputFile=audit-results.json
```

---

## Expected Recipe Counts

Edit these in `e2e/database-audit.e2e.ts` to match your actual recipe counts:

```typescript
const EXPECTED_RECIPE_COUNTS = {
  chicken: { min: 5, max: 500 },
  beef: { min: 5, max: 500 },
  // ... etc
};
```

### Current Defaults
- **Min:** 5 recipes per protein (adjust if you have fewer)
- **Max:** 500 recipes per protein (adjust if you have more)
- **Total:** >= 100 total recipes

---

## Test Output Example

```
PASS  e2e/database-audit.e2e.ts
  Database Audit Tests
    Recipe Counts by Protein
      ✓ should have active recipes for all 14 proteins (45ms)
        ✓ All 14 proteins have recipes
      ✓ chicken should have between 5 and 500 recipes (32ms)
        ✓ Chicken: 47 recipes (expected: 5-500)
      ✓ beef should have between 5 and 500 recipes (28ms)
        ✓ Beef: 32 recipes (expected: 5-500)
      ✓ ... (more tests)

    Data Integrity - Required Fields
      ✓ should have no recipes missing required fields (156ms)
        ✓ All 100 recipes have required fields

    Duplicate Detection
      ✓ should have no exact name duplicates (234ms)
        ✓ Duplicate name check: 0 found (acceptable)

    📊 Database Health Report:
       Total recipes: 450
       Active recipes: 432 (96.0%)
       Inactive recipes: 18
       Curated recipes: 350
       AI recipes: 82
```

---

## Common Issues

### Issue: "Missing EXPO_PUBLIC_SUPABASE_URL"
**Solution:** Set environment variables:
```bash
export EXPO_PUBLIC_SUPABASE_URL="your-url"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="your-key"
```

### Issue: "Tests fail on expected recipe count"
**Solution:** Update `EXPECTED_RECIPE_COUNTS` in `database-audit.e2e.ts`:
```typescript
const EXPECTED_RECIPE_COUNTS = {
  chicken: { min: 3, max: 1000 },  // Adjust min/max
  // ...
};
```

### Issue: "Timeout during Supabase query"
**Solution:** Your database is too large. Either:
1. Increase Jest timeout: `npm run test:db:audit -- --testTimeout=30000`
2. Reduce query limits in test (change `limit(100)` to smaller number)

### Issue: "50% of recipes have null fingerprints"
**Solution:** Expected if fingerprinting was added after recipes. No action needed.

---

## What Passes Before Release

✅ **Before shipping, you should have:**

- All 14 proteins with recipes
- >= 100 total recipes
- < 5% duplicate names
- >= 90% recipes active
- All required fields present
- No invalid protein IDs

**Example:** If any test fails, fix the data before releasing.

---

## Using in Pre-Release

Add to your `PRE_RELEASE_CHECKLIST.md`:

```markdown
### Database Audit
- [ ] npm run test:db:audit → All 20 tests pass
  - Protein counts OK
  - Data integrity OK
  - No duplicates
  - > 90% active
- [ ] Database health report reviewed
```

---

## Customization

### Change Minimum Recipe Count
```typescript
// In database-audit.e2e.ts
const EXPECTED_RECIPE_COUNTS = {
  chicken: { min: 10, max: 500 },  // Now requires 10+ chicken recipes
  // ...
};
```

### Add New Protein
```typescript
const PROTEINS = {
  // ... existing
  myprotein: 'VEG',  // Add your protein
};

const EXPECTED_RECIPE_COUNTS = {
  // ... existing
  myprotein: { min: 5, max: 500 },
};
```

### Monitor Only (Don't Fail Tests)
Change `expect()` to `console.warn()` to report issues without failing:
```typescript
// Instead of:
expect(duplicates.length).toBeLessThan(10);

// Use:
if (duplicates.length > 10) {
  console.warn(`⚠️ Found ${duplicates.length} duplicates`);
}
```

---

## Integration with CI/CD

Add to `.github/workflows/e2e-regression-tests.yml`:

```yaml
- name: Database Audit
  run: npm run test:db:audit
  
- name: Upload audit report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: database-audit-report
    path: audit-results.json
```

---

## Weekly Audit Report

Create a cron job to run audits weekly:

```bash
# scripts/weekly-audit.sh
#!/bin/bash
echo "Running weekly database audit..."
npm run test:db:audit -- --json --outputFile=reports/audit-$(date +%Y-%m-%d).json
echo "Audit complete. Report saved."
```

---

## Next Steps

1. **Configure recipe counts** — Update `EXPECTED_RECIPE_COUNTS` to match your actual data
2. **Run test locally** — `npm run test:db:audit`
3. **Fix any failures** — Update data in Supabase if issues found
4. **Add to pre-release** — Include in PRE_RELEASE_CHECKLIST.md
5. **Add to CI/CD** — Run automatically before release

---

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript)
- [Database Schema](../supabase/schema.sql)

---

**Last Updated:** 2026-06-06
