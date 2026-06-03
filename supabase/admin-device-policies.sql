-- ============================================================
-- SpiceStrong Admin Device Policies + RPC
-- Run in Supabase SQL Editor if admin publish/delete/fix gets RLS errors.
-- ============================================================

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
    'source',
    'is_published',
    'is_active',
    'status',
    'name',
    'protein_id',
    'protein_name',
    'protein_emoji',
    'description',
    'chef_tip',
    'meal_type',
    'ingredients',
    'steps',
    'ai_nutrition'
  );

  IF invalid_keys IS NOT NULL THEN
    RAISE EXCEPTION 'Unsupported admin recipe fields: %', array_to_string(invalid_keys, ', ');
  END IF;

  RETURN QUERY
  WITH patch AS (
    SELECT *
    FROM jsonb_populate_record(NULL::public.recipes, coalesce(p_payload, '{}'::jsonb))
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

DROP POLICY IF EXISTS "Admin device recipe updates" ON recipes;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- Force PostgREST/Supabase API to refresh its function cache after creating RPCs.
-- Without this, the app can see PGRST202 / "function missing" for a few minutes.
NOTIFY pgrst, 'reload schema';
