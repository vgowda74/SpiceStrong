-- ============================================================
-- SpiceStrong Analytics Events Table
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_name  TEXT NOT NULL,
  feature     TEXT NOT NULL,
  screen      TEXT,
  recipe_id   TEXT,
  protein_id  TEXT,
  device_id   TEXT,
  msisdn      TEXT,
  app_version TEXT,
  platform    TEXT,
  metadata    JSONB
);

CREATE INDEX IF NOT EXISTS idx_analytics_created  ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_feature  ON analytics_events (feature);
CREATE INDEX IF NOT EXISTS idx_analytics_event    ON analytics_events (event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_device   ON analytics_events (device_id);

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Anon clients (the app) can insert events
CREATE POLICY "allow_anon_insert" ON analytics_events
  FOR INSERT TO anon WITH CHECK (true);

-- Anon clients can read events (for in-app dashboards if needed)
CREATE POLICY "allow_anon_select" ON analytics_events
  FOR SELECT TO anon USING (true);

-- Nobody can delete or update via the anon key
CREATE POLICY "no_anon_delete" ON analytics_events
  FOR DELETE TO anon USING (false);

CREATE POLICY "no_anon_update" ON analytics_events
  FOR UPDATE TO anon USING (false);


-- ============================================================
-- Useful queries
-- ============================================================

-- Daily active users (last 7 days, IST-friendly)
-- SELECT DATE(created_at AT TIME ZONE 'Asia/Kolkata') AS day,
--        COUNT(DISTINCT device_id) AS dau
-- FROM analytics_events
-- WHERE created_at >= NOW() - INTERVAL '7 days'
-- GROUP BY day ORDER BY day DESC;

-- Feature usage (last 30 days)
-- SELECT feature, event_name, COUNT(*) AS events
-- FROM analytics_events
-- WHERE created_at >= NOW() - INTERVAL '30 days'
-- GROUP BY feature, event_name
-- ORDER BY events DESC;
