-- ============================================================
-- SpiceStrong Dynamic Recipe Content Framework
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ============================================================
-- Table: recipes
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

  -- Ingredients: JSONB matching IngredientsByTier
  -- { "2-3 servings": [{ "name": "...", "quantity": "..." }], "4-6 servings": [...] }
  ingredients     JSONB NOT NULL DEFAULT '{}',

  -- Steps: JSONB array matching CookingStep[]
  -- [{ "title": "...", "description": "...", "emoji": "...", "timerMinutes": N, "tip": "..." }]
  steps           JSONB NOT NULL DEFAULT '[]',

  -- Extended display fields (from BuiltInRecipe)
  time_minutes      INT,
  difficulty        TEXT CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  protein_per_100g  NUMERIC,
  gradient          JSONB,         -- ["#5D1E0F", "#C0392B"]

  -- Full nutrition breakdown (NutritionInfo)
  nutrition         JSONB,

  -- AI-generated nutrition (aiNutrition)
  ai_nutrition      JSONB,

  -- Management fields
  source          TEXT NOT NULL DEFAULT 'curated'
                  CHECK (source IN ('curated', 'ai')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_pro          BOOLEAN NOT NULL DEFAULT false,
  spice_level     TEXT,
  cuisine         TEXT,
  device_id       TEXT,            -- null for curated, set for AI recipes
  status          TEXT CHECK (status IN ('building', 'ready')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary query: fetch active recipes by protein
CREATE INDEX IF NOT EXISTS idx_recipes_protein_active
  ON recipes (protein_id)
  WHERE is_active = true;

-- Device-specific AI recipe lookup
CREATE INDEX IF NOT EXISTS idx_recipes_device
  ON recipes (device_id)
  WHERE device_id IS NOT NULL;


-- ============================================================
-- Table: recipe_images
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  image_type  TEXT NOT NULL CHECK (image_type IN ('hero', 'step', 'ingredient')),
  step_index  INT,               -- null for hero, 0-based for step images
  storage_url TEXT NOT NULL,      -- Supabase Storage public URL
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate images per recipe/type/step
  UNIQUE (recipe_id, image_type, step_index)
);

CREATE INDEX IF NOT EXISTS idx_recipe_images_recipe
  ON recipe_images (recipe_id);


-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_images ENABLE ROW LEVEL SECURITY;

-- Anyone can read active recipes (anon key)
CREATE POLICY "Read active recipes"
  ON recipes FOR SELECT
  USING (is_active = true);

-- Devices can insert their own AI recipes
CREATE POLICY "Insert AI recipes"
  ON recipes FOR INSERT
  WITH CHECK (source = 'ai' AND device_id IS NOT NULL);

-- Devices can update their own AI recipes
CREATE POLICY "Update own AI recipes"
  ON recipes FOR UPDATE
  USING (source = 'ai' AND device_id IS NOT NULL);

-- Anyone can read recipe images
CREATE POLICY "Read recipe images"
  ON recipe_images FOR SELECT
  USING (true);

-- Devices can insert images for recipes
CREATE POLICY "Insert recipe images"
  ON recipe_images FOR INSERT
  WITH CHECK (true);


-- ============================================================
-- Supabase Storage: Create bucket "recipe-images" (public)
-- Do this via Supabase Dashboard > Storage > New Bucket
-- Name: recipe-images
-- Public: Yes
-- ============================================================


-- ============================================================
-- Seed: SpiceStrong Pepper Chicken (built-in recipe)
-- ============================================================
INSERT INTO recipes (
  id, name, protein_id, protein_name, protein_emoji,
  description, chef_tip, meal_type,
  ingredients, steps,
  time_minutes, difficulty, protein_per_100g, gradient,
  nutrition, source, is_active, status
) VALUES (
  'spicestrong-pepper-chicken',
  'SpiceStrong Pepper Chicken',
  'chicken', 'Chicken', '',
  'A healthy, protein-rich pepper chicken cooked with roasted spices for deep flavor without heavy sauces.',
  '40g protein | 280 kcal | 30 min cook. Dry roasting and grinding your own pepper-fennel-cumin blend is what makes this recipe special.',
  'lunch_dinner',
  '{
    "2-3 servings": [
      {"name": "Chicken (Boneless/Breast)", "quantity": "500 g"},
      {"name": "Red Onion (Finely Chopped)", "quantity": "1 Medium"},
      {"name": "Whole Black Pepper", "quantity": "1 tsp"},
      {"name": "Fennel Seeds", "quantity": "1.25 tsp"},
      {"name": "Cumin Seeds", "quantity": "1 tsp"},
      {"name": "Ginger-Garlic Paste", "quantity": "1 tsp"},
      {"name": "Gingelly Oil (or Olive Oil)", "quantity": "2 tbsp"},
      {"name": "Curry Leaves", "quantity": "1 Sprig"},
      {"name": "Turmeric Powder", "quantity": "1/4 tsp"},
      {"name": "Garam Masala", "quantity": "1/2 tsp"},
      {"name": "Salt", "quantity": "To taste"}
    ],
    "4-6 servings": [
      {"name": "Chicken (Boneless/Breast)", "quantity": "1 kg"},
      {"name": "Red Onion (Finely Chopped)", "quantity": "1 Large"},
      {"name": "Whole Black Pepper", "quantity": "1.5 tsp"},
      {"name": "Fennel Seeds", "quantity": "2 tsp"},
      {"name": "Cumin Seeds", "quantity": "1.5 tsp"},
      {"name": "Ginger-Garlic Paste", "quantity": "2 tsp"},
      {"name": "Gingelly Oil (or Olive Oil)", "quantity": "4 tbsp"},
      {"name": "Curry Leaves", "quantity": "2 Sprigs"},
      {"name": "Turmeric Powder", "quantity": "1/2 tsp"},
      {"name": "Garam Masala", "quantity": "1 tsp"},
      {"name": "Salt", "quantity": "To taste"}
    ]
  }'::jsonb,
  '[
    {"title": "Dry Roast & Grind Spices", "description": "Dry roast 1 tsp pepper, 1 tsp fennel, and 1 tsp cumin on low flame. Grind into a fine powder once cooled.", "emoji": "", "timerMinutes": 2, "tip": "Do not burn the spices; keep the heat low for maximum aroma."},
    {"title": "Saute Aromatics", "description": "Heat oil. Saute 1/4 tsp fennel, chopped onions, and curry leaves until translucent.", "emoji": "", "timerMinutes": 3, "tip": "Use red onions for a sweeter, deeper flavor profile."},
    {"title": "Add Spice Paste", "description": "Stir in ginger-garlic paste, turmeric, and garam masala. Saute until raw smell is gone.", "emoji": "", "timerMinutes": 2, "tip": "Adding a splash of water prevents the dry spices from burning."},
    {"title": "Cook the Chicken", "description": "Add chicken pieces and saute well. Add a splash of water and salt. Cover and cook on low flame.", "emoji": "", "timerMinutes": 20, "tip": "Use chicken breast to keep the recipe high-protein and lean."},
    {"title": "Add Masala Powder", "description": "Add the prepared pepper masala powder. Mix well and cook uncovered until dry.", "emoji": "", "timerMinutes": 3, "tip": "For a dry style, cook until all moisture evaporates and coats the chicken."},
    {"title": "Garnish & Serve", "description": "Garnish with fresh coriander and extra curry leaves before serving.", "emoji": "", "tip": "Fresh leaves at the end provide a burst of color and freshness."}
  ]'::jsonb,
  30, 'Easy', 31,
  '["#5D1E0F", "#C0392B"]'::jsonb,
  '{"calories": 280, "proteinG": 40, "fatG": 10, "carbsG": 5, "fiberG": 1, "sugarG": 1, "sodiumMg": 420, "cholesterolMg": 110, "saturatedFatG": 2, "ironMg": 3, "calciumMg": 40}'::jsonb,
  'curated', true, 'ready'
) ON CONFLICT (id) DO NOTHING;
