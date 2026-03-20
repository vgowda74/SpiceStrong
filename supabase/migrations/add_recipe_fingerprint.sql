-- ============================================================
-- Migration: Add recipe fingerprint for deduplication
-- Run in Supabase SQL Editor (Dashboard > SQL Editor)
--
-- Adds a SHA-256 fingerprint column to the recipes table.
-- The fingerprint is computed from normalized ingredient names
-- + step count, enabling duplicate detection before insert.
--
-- Formula: SHA-256( sorted_ingredient_names.join('|') + '|' + step_count )
-- ============================================================

-- 1. Add the fingerprint column (nullable — allows override for user-submitted recipes)
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS fingerprint TEXT;

-- 2. Add unique constraint to prevent duplicate fingerprints.
--    NULLS NOT DISTINCT means only one NULL fingerprint is allowed per recipe.
--    However, we want to allow NULL fingerprints (for user overrides), so we
--    use a partial unique index that only enforces uniqueness on non-null values.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_fingerprint_unique
  ON recipes (fingerprint)
  WHERE fingerprint IS NOT NULL;

-- 3. Add a regular index for fast lookup during dedup checks
CREATE INDEX IF NOT EXISTS idx_recipes_fingerprint
  ON recipes (fingerprint)
  WHERE fingerprint IS NOT NULL;

-- 4. Backfill fingerprints for existing recipes.
--    This uses PostgreSQL's built-in functions to replicate the app-side logic:
--    - Extract ingredient names from the "2-3 servings" tier
--    - Lowercase, trim, sort alphabetically
--    - Join with '|' separator + append step count
--    - SHA-256 hash the result
--
--    NOTE: Run this AFTER adding the column. If it fails, you can run the
--    backfill script instead: node scripts/backfill-fingerprints.js
UPDATE recipes
SET fingerprint = encode(
  sha256(
    convert_to(
      (
        SELECT string_agg(ing_name, '|' ORDER BY ing_name)
        FROM (
          SELECT DISTINCT lower(trim(elem->>'name')) AS ing_name
          FROM jsonb_array_elements(
            CASE
              WHEN ingredients ? '2-3 servings' THEN ingredients->'2-3 servings'
              ELSE '[]'::jsonb
            END
          ) AS elem
          WHERE trim(elem->>'name') <> ''
        ) sub
      ) || '|' || jsonb_array_length(steps)::text,
      'UTF8'
    )
  ),
  'hex'
)
WHERE fingerprint IS NULL;

-- 5. Verify backfill results
-- SELECT id, name, fingerprint FROM recipes ORDER BY name;
