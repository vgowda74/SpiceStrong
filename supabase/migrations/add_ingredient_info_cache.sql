-- Ingredient info cache — shared across all users
-- First user pays for the API call, everyone else gets it free forever

CREATE TABLE IF NOT EXISTS ingredient_info (
  name TEXT PRIMARY KEY,
  info_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE ingredient_info ENABLE ROW LEVEL SECURITY;

-- Everyone can read (shared cache)
CREATE POLICY "Anyone can read ingredient info"
  ON ingredient_info FOR SELECT
  USING (true);

-- Anyone can insert (first lookup creates the row)
CREATE POLICY "Anyone can insert ingredient info"
  ON ingredient_info FOR INSERT
  WITH CHECK (true);

-- Allow upsert (update on conflict)
CREATE POLICY "Anyone can update ingredient info"
  ON ingredient_info FOR UPDATE
  USING (true);
