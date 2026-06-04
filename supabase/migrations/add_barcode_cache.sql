-- Barcode scan cache — shared across all users
-- First scan pays for the API call, everyone else gets cached data free

CREATE TABLE IF NOT EXISTS barcode_cache (
  barcode TEXT PRIMARY KEY,
  product_name TEXT,
  serving_size TEXT,
  calories INTEGER,
  protein_g REAL,
  carbs_g REAL,
  fat_g REAL,
  saturated_fat_g REAL,
  trans_fat_g REAL,
  fiber_g REAL,
  sugar_g REAL,
  sodium_mg INTEGER,
  cholesterol_mg INTEGER,
  ingredients TEXT[],
  additives TEXT[],
  allergens TEXT[],
  diet_type TEXT,
  diet_reason TEXT,
  source TEXT DEFAULT 'api',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Backfill for existing installs created before the diet columns were added.
ALTER TABLE barcode_cache ADD COLUMN IF NOT EXISTS diet_type TEXT;
ALTER TABLE barcode_cache ADD COLUMN IF NOT EXISTS diet_reason TEXT;

ALTER TABLE barcode_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read barcode cache" ON barcode_cache FOR SELECT USING (true);
CREATE POLICY "Anyone can insert barcode cache" ON barcode_cache FOR INSERT WITH CHECK (true);
