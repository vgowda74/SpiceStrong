-- ============================================================
-- Migration: Update classification tag columns
-- Run in Supabase SQL Editor (Dashboard > SQL Editor)
--
-- 1. Remove macro_tags column (replaced by live numeric filtering)
-- 2. Rename allergens → allergen_tags (match JSON response shape)
-- ============================================================

-- 1. Drop macro_tags column (no longer needed)
ALTER TABLE recipes DROP COLUMN IF EXISTS macro_tags;

-- 2. Rename allergens → allergen_tags
ALTER TABLE recipes RENAME COLUMN allergens TO allergen_tags;

-- 3. Update GIN index to match new column name
DROP INDEX IF EXISTS idx_recipes_allergens;
CREATE INDEX IF NOT EXISTS idx_recipes_allergen_tags
  ON recipes USING GIN (allergen_tags);

-- Drop the old macro_tags index if it exists
DROP INDEX IF EXISTS idx_recipes_macro_tags;

-- ============================================================
-- Verify: SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'recipes' ORDER BY ordinal_position;
-- ============================================================
