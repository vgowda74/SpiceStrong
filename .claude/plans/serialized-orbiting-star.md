# Community Cook Count — Shared Across All Users

## Context
Cook count is currently stored locally in AsyncStorage (`ratingsFavourites.ts`), so each device has its own count. The user wants a **community cook count** shared across all users — showing social proof like "🍳 47 cooked" on recipe cards.

We'll add an atomic counter on the Supabase `recipes` table and call it whenever a user starts cooking. The existing local cook count code stays as a fallback and for immediate UI update (optimistic).

---

## Files to Modify

### 1. `supabase/schema.sql` — Add column + atomic increment function

**SQL for user to run in Supabase SQL Editor:**
```sql
-- Add cook_count column
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cook_count INT DEFAULT 0;

-- Atomic increment function (prevents race conditions)
CREATE OR REPLACE FUNCTION increment_cook_count(p_recipe_id TEXT)
RETURNS INT AS $$
DECLARE new_count INT;
BEGIN
  UPDATE recipes SET cook_count = cook_count + 1 WHERE id = p_recipe_id
  RETURNING cook_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2. `services/ratingsService.ts` — Add `submitCookCount()` function

**Add a new exported function** (follows existing `submitRating` pattern):
```typescript
export async function submitCookCount(recipeId: string): Promise<number> {
  // Call Supabase RPC to atomically increment cook_count
  // Returns the new count, or -1 on failure
}
```
- Uses `supabase.rpc('increment_cook_count', { p_recipe_id: recipeId })`
- Silent failure (returns -1, logs warning) — same pattern as ratings

### 3. `services/recipeService.ts` — Map `cook_count` from Supabase rows

**In `mapSupabaseRowToRecipe()`:**
- Add `communityCookCount` to the returned `SavedRecipe` (or pass through as extra field)

**Actually simpler approach:** Since `cook_count` comes with the recipe row, we can add it to `SavedRecipe` interface and map it directly.

### 4. `src/store/recipes.ts` — Add `communityCookCount` to `SavedRecipe`

```typescript
export interface SavedRecipe {
  // ... existing fields
  communityCookCount?: number;  // Community-wide cook count from Supabase
}
```

### 5. `app/screens/RecipeOverviewScreen.tsx` — Call `submitCookCount` on "Start Cooking"

**Current behavior (line ~166):** Calls `incrementCookCount(recipeId)` locally.
**Add:** Also call `submitCookCount(recipeId)` to increment the Supabase counter.

```typescript
incrementCookCount(recipeId);           // local (optimistic)
submitCookCount(recipeId).catch(() => {}); // Supabase (fire-and-forget)
```

### 6. `app/screens/RecipeListScreen.tsx` — Prefer community count over local

**Current behavior:** Passes `cookCounts[item.id]` (local) to RecipeCard.
**Change:** Use community count from recipe data if available, fall back to local:
```typescript
cookCount={item.communityCookCount || cookCounts[item.id] || 0}
```

### 7. `components/RecipeCard.tsx` — No changes needed

Already displays `cookCount` as "🍳 X cooked" — just needs to receive the community value instead of local.

---

## Data Flow

```
User taps "Start Cooking"
  → incrementCookCount(id)          [local AsyncStorage, immediate]
  → submitCookCount(id)             [Supabase RPC, fire-and-forget]

Recipe list loads
  → fetchRecipesByProtein()         [Supabase row includes cook_count]
  → mapSupabaseRowToRecipe()        [maps cook_count → communityCookCount]
  → RecipeCard receives             [communityCookCount || localCount]
```

---

## Verification

1. Open recipe list → cards show community cook count (from Supabase)
2. Start cooking a recipe → count increments immediately (optimistic local)
3. On another device → same recipe shows the incremented count after refresh
4. Offline → local count still works, Supabase increment silently fails
5. Check Supabase: `SELECT id, name, cook_count FROM recipes ORDER BY cook_count DESC;`
