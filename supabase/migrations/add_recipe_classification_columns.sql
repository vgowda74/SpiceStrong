-- ============================================================
-- Migration: Add recipe classification & nutrition columns
-- Run in Supabase SQL Editor (Dashboard > SQL Editor)
--
-- Adds auto-tagged category fields, per-serving nutrition columns,
-- and derived macro tags to the existing recipes table.
-- These columns power the recipe ingestion pipeline
-- (Claude classification + Edamam nutrition analysis).
--
-- Safe to run multiple times — uses IF NOT EXISTS.
-- ============================================================

-- ─── Identity & Content ───

-- serving_size: human-readable e.g. "1 bowl (~350g)"
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS serving_size TEXT;

-- recipe_source: 'native' (curated), 'ai', 'user' — for future user submissions
-- Note: existing 'source' column uses 'curated'/'ai'. This new column adds 'native'/'user'.
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS recipe_source TEXT DEFAULT 'native';

-- ─── Auto-tagged Classification Fields ───

-- cuisine_type: more specific than existing 'cuisine' column
-- Values: Indian, South Indian, Korean, Japanese, Chinese, Vietnamese, Thai,
--         Filipino, Mediterranean, Italian, Greek, Lebanese, Turkish,
--         American, Mexican, Brazilian, AI Fusion
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cuisine_type TEXT;

-- cook_time_bucket: human-readable time range
-- Values: "Under 15 min", "15-30 min", "30-60 min", "1-2 hours", "2+ hours"
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cook_time_bucket TEXT;

-- meal_type_tags: array e.g. ["Lunch", "Dinner", "Post-workout"]
-- Note: existing 'meal_type' is a single enum. This is a multi-value array.
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS meal_type_tags JSONB;

-- dietary_tags: array e.g. ["Gluten free", "High protein", "Dairy free"]
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS dietary_tags JSONB;

-- allergens: array e.g. ["Dairy", "Nuts", "Gluten"]
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS allergens JSONB;

-- cooking_method: e.g. "Stovetop", "Air fryer", "Oven", "Grill"
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cooking_method TEXT;

-- fitness_goal: array e.g. ["Muscle gain", "Fat loss", "Lean bulk"]
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS fitness_goal JSONB;

-- storage_tags: array e.g. ["Meal prep ready", "Freezer friendly"]
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS storage_tags JSONB;

-- ─── Per-serving Nutrition (from Edamam) ───

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS calories INTEGER;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS protein_g NUMERIC;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS carbs_g NUMERIC;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS fat_g NUMERIC;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS fiber_g NUMERIC;

-- macro_tags: derived from nutrition values
-- e.g. ["30g+ protein", "Under 500 cal", "Under 20g carbs"]
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS macro_tags JSONB;

-- ─── Metadata ───

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS community_rating NUMERIC DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

-- submitted_by_user_id: reserved for future user auth
-- ALTER TABLE recipes ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID;

-- ─── GIN Indexes for JSONB array columns (fast @> containment queries) ───

CREATE INDEX IF NOT EXISTS idx_recipes_dietary_tags
  ON recipes USING GIN (dietary_tags);

CREATE INDEX IF NOT EXISTS idx_recipes_allergens
  ON recipes USING GIN (allergens);

CREATE INDEX IF NOT EXISTS idx_recipes_fitness_goal
  ON recipes USING GIN (fitness_goal);

CREATE INDEX IF NOT EXISTS idx_recipes_meal_type_tags
  ON recipes USING GIN (meal_type_tags);

CREATE INDEX IF NOT EXISTS idx_recipes_macro_tags
  ON recipes USING GIN (macro_tags);

-- ─── Regular B-tree indexes for scalar filter columns ───

CREATE INDEX IF NOT EXISTS idx_recipes_protein_type
  ON recipes (protein_id);

CREATE INDEX IF NOT EXISTS idx_recipes_cuisine_type
  ON recipes (cuisine_type);

CREATE INDEX IF NOT EXISTS idx_recipes_spice_level
  ON recipes (spice_level);

CREATE INDEX IF NOT EXISTS idx_recipes_difficulty
  ON recipes (difficulty);

CREATE INDEX IF NOT EXISTS idx_recipes_calories
  ON recipes (calories);

CREATE INDEX IF NOT EXISTS idx_recipes_protein_g
  ON recipes (protein_g);

CREATE INDEX IF NOT EXISTS idx_recipes_cook_time_bucket
  ON recipes (cook_time_bucket);

CREATE INDEX IF NOT EXISTS idx_recipes_is_published
  ON recipes (is_published);

-- ============================================================
-- Verification: list all columns on recipes table
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'recipes'
-- ORDER BY ordinal_position;
-- ============================================================
