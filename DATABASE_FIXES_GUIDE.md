# 🔧 Database Issues — Fix Guide for Build 64

Found and analyzed all database issues. Here's how to fix them.

---

## 📊 Issues Found

| Issue | Count | Priority | Blocking? |
|-------|-------|----------|-----------|
| Invalid step format | 1 | MEDIUM | ⚠️ YES (fix before release) |
| Duplicate names | 29 | LOW | ❌ NO (can fix after) |

---

## 1️⃣ Invalid Steps Format (1 Recipe)

**Priority:** MEDIUM — Fix BEFORE release

### The Issue
One recipe has an improperly formatted `steps` field.

### How to Fix

**Option A: Fix in Supabase Dashboard (5 min)**

1. Go to https://supabase.com → Login
2. Select **SpiceStrong** project
3. Go to **SQL Editor** (left sidebar)
4. Run this query to find it:
   ```sql
   SELECT id, name, steps FROM recipes 
   WHERE is_active = true 
   AND (steps IS NULL OR steps = '[]' OR jsonb_typeof(steps) != 'array');
   ```
5. Note the recipe ID
6. Go back to **recipes** table
7. Find the recipe by ID
8. Click the `steps` cell
9. Fix it to valid format:
   ```json
   [
     {
       "title": "Prepare Ingredients",
       "description": "Chop all vegetables and measure out spices...",
       "timerMinutes": 5
     },
     {
       "title": "Cook",
       "description": "Heat oil in pan and add ingredients...",
       "timerMinutes": 15
     }
   ]
   ```
10. Click **Save**
11. Done!

**Option B: Fix via SQL (2 min, if you know the recipe ID)**

```sql
UPDATE recipes 
SET steps = '[
  {
    "title": "Step 1",
    "description": "Your instructions here",
    "timerMinutes": 5
  }
]'::jsonb
WHERE id = 'YOUR_RECIPE_ID';
```

---

## 2️⃣ Duplicate Recipe Names (29 Groups)

**Priority:** LOW — Can fix AFTER release

These are recipes with the same name within the same protein category. Examples:

- `"Chicken Tikka Masala"` appears 2 times
- `"Macher Jhol with Rohu Fillet"` appears 2 times
- `"Berry Protein Smoothie Bowl"` appears 2 times
- ... (26 more)

### Why This Happens

When uploading many recipes, duplicates can occur if:
- Same recipe uploaded twice
- Recipe ID generated with/without `-001` suffix
- Different versions of the same recipe

### How to Fix

**Option A: Delete Older Duplicates (Recommended)**

1. Go to Supabase → **recipes** table
2. Look for recipe IDs ending in `-001` (these are usually the duplicates)
3. Click on the recipe row
4. Delete button (trash icon)
5. Confirm delete
6. Repeat for all 29 groups

**Time:** ~30 minutes (30 seconds per duplicate × 29)

**Option B: Rename to Make Unique**

If you want to keep both versions:
1. Edit one recipe name
2. Change it to something like: `"Chicken Tikka Masala (Classic)"` or `"Chicken Tikka Masala v2"`
3. Save

**Option C: SQL Batch Delete**

```sql
-- Delete recipes with ID ending in '-001' (duplicates)
DELETE FROM recipes 
WHERE is_active = true 
AND id LIKE '%-001';
```

⚠️ **WARNING:** This will delete ALL recipes ending in `-001`. Test first on a single recipe!

---

## 🚀 Release Strategy

### For Build 64 (RIGHT NOW):

1. ✅ **Invalid steps:** FIX IT (5-10 min)
   - Critical for user experience
   - Steps won't display properly if malformed
   
2. ⏳ **Duplicates:** SKIP FOR NOW
   - Won't block the release
   - Users won't be negatively impacted
   - Can clean up in next version

### After Release (Next Week):

Run cleanup:
```bash
# Identify duplicates
node scripts/fix-database-issues.js

# Delete old duplicates (manual or SQL)
```

---

## 📋 Detailed Fix Steps

### Quick Fix (5 min) — Just Invalid Steps

```
1. Open Supabase Dashboard
2. recipes table → Find recipe with empty/invalid steps
3. Edit steps to valid JSON format
4. Save
5. Done! Ready to release.
```

### Full Fix (35 min) — Invalid Steps + Duplicates

```
1. Same as above (5 min)
2. Find all 29 duplicate groups (2 min)
3. Delete older versions marked with "-001" (25 min)
4. Test database audit again (3 min)
5. Ready to release with clean database!
```

---

## ✅ Verify Fixes

After fixing, run the audit again:

```bash
npm run test:db:audit
```

You should see:
```
✅ PASS: All recipes have valid step format
✅ PASS: No duplicate recipe names (or just cosmetic dups)
```

---

## 🎯 My Recommendation for Build 64

**Do this NOW:**

1. **Fix the 1 invalid step** (5-10 minutes)
   - Go to Supabase
   - Find and fix the malformed recipe
   - Test with `npm run test:db:audit`

2. **Release Build 64** (with 1 invalid step fixed)
   - User experience is good
   - All 346 recipes are active
   - No blocking issues

**Do this AFTER release (next week):**

1. **Clean up 29 duplicates** (30 minutes)
   - Less time-sensitive
   - Doesn't affect users much
   - Cleaner database for long-term

---

## 📝 Quick Checklist

- [ ] Go to Supabase Dashboard
- [ ] Find recipe with invalid steps
- [ ] Edit steps to valid JSON
- [ ] Save changes
- [ ] Run `npm run test:db:audit` to verify
- [ ] Ready for Build 64 release ✅

---

## 🔗 Helpful Links

- **Supabase Dashboard:** https://supabase.com
- **Audit Script:** `scripts/fix-database-issues.js`
- **Audit Test:** `npm run test:db:audit`

---

## ❓ Questions?

**Q: What if I can't find the invalid step recipe?**  
A: Run the fix script again and it will show you the exact ID

**Q: Can I release with these issues?**  
A: Yes (duplicates are fine), but fix the invalid steps first

**Q: How long will this take?**  
A: Invalid steps = 5 min. Duplicates = 30 min (optional)

---

**Bottom Line:** Fix the 1 invalid step recipe (5 min), then release Build 64. Clean up duplicates next week.

Let me know when you've fixed the invalid steps and I'll verify! ✅

---

Last updated: 2026-06-06
