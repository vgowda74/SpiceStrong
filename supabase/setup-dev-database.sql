-- ============================================================
-- SpiceStrong DEV Database Setup
-- Run this ONCE in your new SpiceStrong-Dev Supabase project
-- (Dashboard > SQL Editor > paste this entire file > Run)
-- ============================================================

-- ============================================================
-- 1. RECIPES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS recipes (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  protein_id      TEXT NOT NULL,
  protein_name    TEXT NOT NULL,
  protein_emoji   TEXT NOT NULL DEFAULT '',
  description     TEXT,
  chef_tip        TEXT,
  meal_type       TEXT CHECK (meal_type IN ('breakfast', 'lunch_dinner', 'snack_dessert')),
  ingredients     JSONB NOT NULL DEFAULT '{}',
  steps           JSONB NOT NULL DEFAULT '[]',
  time_minutes    INT,
  difficulty      TEXT CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  protein_per_100g NUMERIC,
  gradient        JSONB,
  nutrition       JSONB,
  ai_nutrition    JSONB,
  source          TEXT NOT NULL DEFAULT 'curated',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_pro          BOOLEAN NOT NULL DEFAULT false,
  spice_level     TEXT,
  cuisine         TEXT,
  device_id       TEXT,
  status          TEXT CHECK (status IN ('building', 'ready')),
  cook_count      INT NOT NULL DEFAULT 0,
  fingerprint     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Classification columns (from migration)
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS serving_size TEXT DEFAULT '2-3 servings';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS recipe_source TEXT DEFAULT 'curated';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cuisine_type TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cook_time_bucket TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS meal_type_tags JSONB DEFAULT '[]';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS dietary_tags JSONB DEFAULT '[]';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS allergen_tags JSONB DEFAULT '[]';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cooking_method TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS fitness_goal JSONB DEFAULT '[]';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS storage_tags JSONB DEFAULT '[]';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS calories INT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS protein_g NUMERIC;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS carbs_g NUMERIC;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS fat_g NUMERIC;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS fiber_g NUMERIC;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS community_rating NUMERIC DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS review_count INT DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_fingerprint_unique ON recipes (fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipes_fingerprint ON recipes (fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipes_protein_active ON recipes (protein_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_recipes_device ON recipes (device_id) WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipes_dietary_tags ON recipes USING GIN (dietary_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_allergen_tags ON recipes USING GIN (allergen_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_fitness_goal ON recipes USING GIN (fitness_goal);
CREATE INDEX IF NOT EXISTS idx_recipes_meal_type_tags ON recipes USING GIN (meal_type_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_cuisine_type ON recipes (cuisine_type);
CREATE INDEX IF NOT EXISTS idx_recipes_spice_level ON recipes (spice_level);
CREATE INDEX IF NOT EXISTS idx_recipes_difficulty ON recipes (difficulty);
CREATE INDEX IF NOT EXISTS idx_recipes_calories ON recipes (calories);
CREATE INDEX IF NOT EXISTS idx_recipes_protein_g ON recipes (protein_g);
CREATE INDEX IF NOT EXISTS idx_recipes_cook_time ON recipes (cook_time_bucket);
CREATE INDEX IF NOT EXISTS idx_recipes_published ON recipes (is_published) WHERE is_published = true;

-- Atomic cook count increment
CREATE OR REPLACE FUNCTION increment_cook_count(p_recipe_id TEXT)
RETURNS INT AS $$
DECLARE new_count INT;
BEGIN
  UPDATE recipes SET cook_count = cook_count + 1 WHERE id = p_recipe_id
  RETURNING cook_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. RECIPE IMAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  image_type  TEXT NOT NULL CHECK (image_type IN ('hero', 'step', 'ingredient')),
  step_index  INT,
  storage_url TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recipe_id, image_type, step_index)
);

CREATE INDEX IF NOT EXISTS idx_recipe_images_recipe ON recipe_images (recipe_id);

-- ============================================================
-- 3. RATINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(recipe_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_recipe ON ratings(recipe_id);

-- ============================================================
-- 4. REVIEWS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT 'SpiceChef',
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment TEXT NOT NULL CHECK (char_length(comment) <= 500),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(recipe_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_recipe ON reviews(recipe_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC);

-- Rating summary view
CREATE OR REPLACE VIEW recipe_rating_summary AS
SELECT
  recipe_id,
  ROUND(AVG(stars)::numeric, 1) AS average_rating,
  COUNT(*) AS total_count,
  COUNT(*) FILTER (WHERE stars = 5) AS five_star,
  COUNT(*) FILTER (WHERE stars = 4) AS four_star,
  COUNT(*) FILTER (WHERE stars = 3) AS three_star,
  COUNT(*) FILTER (WHERE stars = 2) AS two_star,
  COUNT(*) FILTER (WHERE stars = 1) AS one_star
FROM ratings
GROUP BY recipe_id;

-- ============================================================
-- 5. DIETARY RESTRICTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS user_dietary_restrictions (
  device_id TEXT PRIMARY KEY,
  dietary_tags TEXT[] DEFAULT '{}',
  allergen_tags TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. MEAL PLAN TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS meal_plan (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  date DATE NOT NULL,
  slot TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  recipe_name TEXT NOT NULL,
  protein_name TEXT,
  protein_emoji TEXT,
  meal_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_device_date ON meal_plan(device_id, date);

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_dietary_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.spicestrong_admin_devices (
  device_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.spicestrong_admin_devices (device_id)
VALUES ('ios_1773504689845_bf8ebqh4')
ON CONFLICT (device_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.spicestrong_admin_update_recipe(
  p_recipe_id TEXT,
  p_admin_device_id TEXT,
  p_payload JSONB
)
RETURNS SETOF public.recipes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invalid_keys TEXT[];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.spicestrong_admin_devices
    WHERE device_id = p_admin_device_id
  ) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(key)
  INTO invalid_keys
  FROM jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) AS key
  WHERE key NOT IN (
    'source', 'is_published', 'is_active', 'status',
    'name', 'protein_id', 'protein_name', 'protein_emoji',
    'description', 'chef_tip', 'meal_type',
    'ingredients', 'steps', 'ai_nutrition'
  );

  IF invalid_keys IS NOT NULL THEN
    RAISE EXCEPTION 'Unsupported admin recipe fields: %', array_to_string(invalid_keys, ', ');
  END IF;

  RETURN QUERY
  WITH patch AS (
    SELECT * FROM jsonb_populate_record(NULL::public.recipes, coalesce(p_payload, '{}'::jsonb))
  )
  UPDATE public.recipes AS recipe
  SET
    source = CASE WHEN p_payload ? 'source' THEN patch.source ELSE recipe.source END,
    is_published = CASE WHEN p_payload ? 'is_published' THEN patch.is_published ELSE recipe.is_published END,
    is_active = CASE WHEN p_payload ? 'is_active' THEN patch.is_active ELSE recipe.is_active END,
    status = CASE WHEN p_payload ? 'status' THEN patch.status ELSE recipe.status END,
    name = CASE WHEN p_payload ? 'name' THEN patch.name ELSE recipe.name END,
    protein_id = CASE WHEN p_payload ? 'protein_id' THEN patch.protein_id ELSE recipe.protein_id END,
    protein_name = CASE WHEN p_payload ? 'protein_name' THEN patch.protein_name ELSE recipe.protein_name END,
    protein_emoji = CASE WHEN p_payload ? 'protein_emoji' THEN patch.protein_emoji ELSE recipe.protein_emoji END,
    description = CASE WHEN p_payload ? 'description' THEN patch.description ELSE recipe.description END,
    chef_tip = CASE WHEN p_payload ? 'chef_tip' THEN patch.chef_tip ELSE recipe.chef_tip END,
    meal_type = CASE WHEN p_payload ? 'meal_type' THEN patch.meal_type ELSE recipe.meal_type END,
    ingredients = CASE WHEN p_payload ? 'ingredients' THEN patch.ingredients ELSE recipe.ingredients END,
    steps = CASE WHEN p_payload ? 'steps' THEN patch.steps ELSE recipe.steps END,
    ai_nutrition = CASE WHEN p_payload ? 'ai_nutrition' THEN patch.ai_nutrition ELSE recipe.ai_nutrition END,
    updated_at = now()
  FROM patch
  WHERE recipe.id = p_recipe_id
  RETURNING recipe.*;
END;
$$;

REVOKE ALL ON FUNCTION public.spicestrong_admin_update_recipe(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spicestrong_admin_update_recipe(TEXT, TEXT, JSONB) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.spicestrong_admin_upsert_recipe_image(
  p_recipe_id TEXT,
  p_admin_device_id TEXT,
  p_image_type TEXT,
  p_step_index INTEGER,
  p_storage_url TEXT
)
RETURNS SETOF public.recipe_images
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.spicestrong_admin_devices
    WHERE device_id = p_admin_device_id
  ) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.recipe_images
  WHERE recipe_id = p_recipe_id
    AND image_type = p_image_type
    AND (
      (p_step_index IS NULL AND step_index IS NULL)
      OR step_index = p_step_index
    );

  RETURN QUERY
  INSERT INTO public.recipe_images (recipe_id, image_type, step_index, storage_url)
  VALUES (p_recipe_id, p_image_type, p_step_index, p_storage_url)
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.spicestrong_admin_upsert_recipe_image(TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spicestrong_admin_upsert_recipe_image(TEXT, TEXT, TEXT, INTEGER, TEXT) TO anon, authenticated;

-- Recipes
CREATE POLICY "Read active recipes" ON recipes FOR SELECT USING (is_active = true);
CREATE POLICY "Insert AI recipes" ON recipes FOR INSERT WITH CHECK (
  source IN ('ai', 'user')
  AND device_id IS NOT NULL
  AND is_published = false
);
CREATE POLICY "No public recipe updates" ON recipes FOR UPDATE USING (false) WITH CHECK (false);

-- Recipe images
CREATE POLICY "Read recipe images" ON recipe_images FOR SELECT USING (true);
CREATE POLICY "Insert recipe images" ON recipe_images FOR INSERT WITH CHECK (true);

-- Ratings
CREATE POLICY "Anyone can read ratings" ON ratings FOR SELECT USING (true);
CREATE POLICY "Anyone can insert ratings" ON ratings FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own ratings" ON ratings FOR UPDATE USING (true);

-- Reviews
CREATE POLICY "Anyone can read reviews" ON reviews FOR SELECT USING (true);
CREATE POLICY "Anyone can insert reviews" ON reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own reviews" ON reviews FOR UPDATE USING (true);

-- Dietary restrictions
CREATE POLICY "Read own dietary" ON user_dietary_restrictions FOR SELECT USING (true);
CREATE POLICY "Insert dietary" ON user_dietary_restrictions FOR INSERT WITH CHECK (true);
CREATE POLICY "Update dietary" ON user_dietary_restrictions FOR UPDATE USING (true);

-- Meal plan
CREATE POLICY "Read own meal plan" ON meal_plan FOR SELECT USING (true);
CREATE POLICY "Insert meal plan" ON meal_plan FOR INSERT WITH CHECK (true);
CREATE POLICY "Update meal plan" ON meal_plan FOR UPDATE USING (true);
CREATE POLICY "Delete meal plan" ON meal_plan FOR DELETE USING (true);

-- ============================================================
-- 8. STORAGE BUCKET
-- ============================================================
-- INGREDIENT INFO CACHE (shared across all users)
-- ============================================================
CREATE TABLE IF NOT EXISTS ingredient_info (
  name TEXT PRIMARY KEY,
  info_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE ingredient_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read ingredient info" ON ingredient_info FOR SELECT USING (true);
CREATE POLICY "Anyone can insert ingredient info" ON ingredient_info FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update ingredient info" ON ingredient_info FOR UPDATE USING (true);

-- ============================================================
-- Create this manually in Supabase Dashboard > Storage:
-- Bucket name: recipe-images
-- Public: Yes

-- ============================================================
-- DONE! Your dev database is ready.
-- Now update .env.development with this project's URL and keys.
-- ============================================================
