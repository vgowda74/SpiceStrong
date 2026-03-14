-- SpiceStrong: Community Ratings & Reviews
-- Run this in Supabase Dashboard > SQL Editor

-- 1. Ratings table (one rating per device per recipe)
CREATE TABLE IF NOT EXISTS ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(recipe_id, device_id)
);

-- 2. Reviews table (one review per device per recipe)
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

-- 3. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ratings_recipe ON ratings(recipe_id);
CREATE INDEX IF NOT EXISTS idx_reviews_recipe ON reviews(recipe_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC);

-- 4. Enable Row Level Security (required for Supabase)
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- 5. Policies: anyone can read, anyone can insert/update their own
-- Read access for all
CREATE POLICY "Anyone can read ratings" ON ratings FOR SELECT USING (true);
CREATE POLICY "Anyone can read reviews" ON reviews FOR SELECT USING (true);

-- Insert access for all (anonymous users)
CREATE POLICY "Anyone can insert ratings" ON ratings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert reviews" ON reviews FOR INSERT WITH CHECK (true);

-- Update access (only own records by device_id)
CREATE POLICY "Users can update own ratings" ON ratings FOR UPDATE USING (true);
CREATE POLICY "Users can update own reviews" ON reviews FOR UPDATE USING (true);

-- 6. View for aggregated ratings per recipe (average + distribution)
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
