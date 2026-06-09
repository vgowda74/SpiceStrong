# 🔧 AI Recipe Sync Fix — Local-Only Until Published

**Issue:** AI recipes were auto-syncing to Supabase immediately upon save.  
**Fix:** AI recipes now stay local until user explicitly publishes them.

---

## What Changed

### Before ❌
```typescript
saveAIRecipe(recipe)
  ├─ Save to AsyncStorage (local) ✅
  └─ Auto-sync to Supabase (unnecessary) ❌
```

**Problems:**
- Wastes Supabase storage for private recipes
- Wastes bandwidth syncing every draft
- User has no control over when recipe goes to database
- Confusing UX — recipe appears in community immediately

### After ✅
```typescript
saveAIRecipe(recipe)
  └─ Save to AsyncStorage only (local, private) ✅

publishRecipe(recipe)
  └─ Sync to Supabase (on demand) ✅
```

**Benefits:**
- Recipes stay private until user chooses
- No wasted storage/bandwidth
- Better UX — clear "Publish" action
- User controls sharing

---

## Modified Functions

### `saveAIRecipe(recipe)` — Now local-only
```typescript
// Before:
export async function saveAIRecipe(
  recipe: SavedRecipe,
  overrideDuplicate = false
): Promise<RecipeSyncResult> {
  await localSaveRecipe(recipe);
  await syncRecipeToSupabase(recipe);  // ❌ Auto-sync
}

// After:
export async function saveAIRecipe(recipe: SavedRecipe): Promise<void> {
  await localSaveRecipe(recipe);  // ✅ Local only
  console.log(`Recipe saved locally (private): ${recipe.id}`);
}
```

**Usage:**
```typescript
// When user creates/saves a recipe
const result = await saveAIRecipe(newRecipe);
// Recipe is now in local storage, not shared
```

### `publishRecipe(recipe)` — New function for sharing
```typescript
export async function publishRecipe(
  recipe: SavedRecipe
): Promise<RecipeSyncResult> {
  // Uploads to Supabase
  // Checks for duplicates
  // Returns success/failure
}
```

**Usage:**
```typescript
// When user clicks "Publish to Community"
const result = await publishRecipe(myRecipe);

if (result.duplicate) {
  // Show: "A similar recipe already exists"
} else if (result.success) {
  // Show: "Recipe published!"
} else {
  // Show: result.message (error)
}
```

---

## Updated Data Flow

### Create AI Recipe
```
User creates recipe
       ↓
saveAIRecipe(recipe)  ← saves to AsyncStorage only
       ↓
Recipe in local storage ✅
Recipe NOT in Supabase ✅
User can edit/delete offline ✅
```

### Publish Recipe
```
User clicks "Publish to Community"
       ↓
publishRecipe(recipe)  ← uploads to Supabase
       ↓
Check for duplicates
       ↓
Yes → Show error: "Similar recipe exists"
No  → Upload & show: "Recipe published!"
       ↓
Recipe now visible in community ✅
```

---

## UI/UX Changes Needed

### Before (Auto-Sync)
- Create button: "Create Recipe"
- Result: Recipe appears in community immediately
- Problem: User can't control this

### After (Publish on Demand)
- Create button: "Create Recipe"
- View button: "My Recipes" (local, private)
- Publish button: "Share with Community"
- Result: User has full control

---

## Implementation in UI

### In Recipe Builder
```typescript
// Save locally (don't publish yet)
const saveResult = await saveAIRecipe(recipe);
showToast("Recipe saved to your library");

// Show "Publish" button separately
<Button onPress={() => publishRecipe(recipe)}>
  Publish to Community
</Button>
```

### In "My Recipes" Screen
```typescript
// Show local recipes (not yet published)
const localRecipes = await getLocalRecipes();
// Option 1: View recipe
// Option 2: Edit recipe
// Option 3: Delete recipe
// Option 4: Publish recipe (new!)
```

### In Community View
```typescript
// Only show curated + published recipes
const communityRecipes = await fetchRecipesByProtein(proteinId);
// (Already filtered by device_id, so user's unpublished recipes won't show)
```

---

## Backward Compatibility

**Existing AI recipes in Supabase:** 32 recipes with `source = 'ai'` and `device_id` set

These are fine! They're:
- ✅ Private to their original devices (device_id filter)
- ✅ Won't appear in community (filtered query)
- ✅ Safe to leave as-is

**Going forward:** No more auto-syncs. Only manual publishes.

---

## Testing Checklist

- [ ] Create AI recipe → saves locally only
- [ ] Verify recipe appears in "My Recipes" 
- [ ] Verify recipe NOT in community view
- [ ] Click "Publish" → uploads to Supabase
- [ ] Verify recipe now visible in community
- [ ] Try publishing duplicate → shows error
- [ ] Test offline: can still create recipes
- [ ] Test online sync: pending publishes upload on reconnect

---

## Files Modified

- `services/recipeService.ts`
  - Modified: `saveAIRecipe()` — now local-only
  - Added: `publishRecipe()` — explicit publish function

---

## Benefits Summary

✅ **Storage:** No wasted Supabase space  
✅ **Bandwidth:** No unnecessary syncs  
✅ **UX:** Clear "Publish" action  
✅ **Privacy:** User controls when recipe is shared  
✅ **Data Quality:** No accidental community recipes  

---

**Status:** ✅ Code changes complete  
**Next:** Update UI to use `publishRecipe()` for publish action

This is a breaking change for the UI, but the backend is ready!

---

Last updated: 2026-06-06
