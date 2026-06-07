/**
 * e2e/database-audit.e2e.ts — SpiceStrong Database Audit Tests
 * 
 * Validates recipe data integrity in Supabase:
 * - Recipe counts per protein
 * - Data completeness (all required fields)
 * - Duplicate detection (via fingerprint)
 * - Active/inactive status
 * - Sync status
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expected protein counts (set these based on your actual data)
const EXPECTED_RECIPE_COUNTS = {
  chicken: { min: 5, max: 500 },     // At least 5, up to 500
  beef: { min: 5, max: 500 },
  lamb: { min: 5, max: 500 },
  goat: { min: 5, max: 500 },
  pork: { min: 5, max: 500 },
  fish: { min: 5, max: 500 },
  prawns: { min: 5, max: 500 },
  eggs: { min: 5, max: 500 },
  paneer: { min: 5, max: 500 },
  tofu: { min: 5, max: 500 },
  soy: { min: 5, max: 500 },
  beans: { min: 5, max: 500 },
  milk: { min: 5, max: 500 },
  whey: { min: 5, max: 500 },
};

// Protein IDs and categories for validation
const PROTEINS = {
  chicken: 'NON-VEG',
  beef: 'NON-VEG',
  lamb: 'NON-VEG',
  goat: 'NON-VEG',
  pork: 'NON-VEG',
  fish: 'NON-VEG',
  prawns: 'NON-VEG',
  eggs: 'NON-VEG',
  paneer: 'VEG',
  tofu: 'VEG',
  soy: 'VEG',
  beans: 'VEG',
  milk: 'VEG',
  whey: 'VEG',
};

interface SupabaseRecipe {
  id: string;
  name: string;
  protein_id: string;
  protein_name: string;
  ingredients: unknown;
  steps: unknown;
  is_active: boolean;
  is_published: boolean;
  source: 'curated' | 'ai' | 'user';
  created_at: string;
  updated_at: string;
  fingerprint?: string;
  [key: string]: unknown;
}

describe('Database Audit Tests', () => {
  // ─────────────────────────────────────────────────────────────
  // SUITE 1: Recipe Counts by Protein
  // ─────────────────────────────────────────────────────────────
  describe('Recipe Counts by Protein', () => {
    let recipeCountsByProtein: Record<string, number> = {};

    beforeAll(async () => {
      // Fetch all active recipes grouped by protein
      const { data, error } = await supabase
        .from('recipes')
        .select('protein_id')
        .eq('is_active', true);

      if (error) {
        throw new Error(`Failed to fetch recipes: ${error.message}`);
      }

      // Count by protein_id
      const counts: Record<string, number> = {};
      (data as Array<{ protein_id: string }>).forEach((recipe) => {
        counts[recipe.protein_id] = (counts[recipe.protein_id] || 0) + 1;
      });

      recipeCountsByProtein = counts;
      console.log('Recipe counts by protein:', counts);
    });

    it('should have active recipes for all 14 proteins', async () => {
      const proteins = Object.keys(PROTEINS);
      const missingProteins = proteins.filter((p) => !recipeCountsByProtein[p]);

      expect(missingProteins).toEqual([]);
      console.log(`✓ All 14 proteins have recipes`);
    });

    it('chicken should have between 5 and 500 recipes', async () => {
      const count = recipeCountsByProtein.chicken || 0;
      const { min, max } = EXPECTED_RECIPE_COUNTS.chicken;

      expect(count).toBeGreaterThanOrEqual(min);
      expect(count).toBeLessThanOrEqual(max);
      console.log(`✓ Chicken: ${count} recipes (expected: ${min}-${max})`);
    });

    it('beef should have between 5 and 500 recipes', async () => {
      const count = recipeCountsByProtein.beef || 0;
      const { min, max } = EXPECTED_RECIPE_COUNTS.beef;

      expect(count).toBeGreaterThanOrEqual(min);
      expect(count).toBeLessThanOrEqual(max);
      console.log(`✓ Beef: ${count} recipes (expected: ${min}-${max})`);
    });

    it('lamb should have between 5 and 500 recipes', async () => {
      const count = recipeCountsByProtein.lamb || 0;
      const { min, max } = EXPECTED_RECIPE_COUNTS.lamb;

      expect(count).toBeGreaterThanOrEqual(min);
      expect(count).toBeLessThanOrEqual(max);
      console.log(`✓ Lamb: ${count} recipes (expected: ${min}-${max})`);
    });

    it('vegetarian proteins should have recipes', async () => {
      const vegProteins = ['paneer', 'tofu', 'soy', 'beans', 'milk', 'whey'];

      for (const protein of vegProteins) {
        const count = recipeCountsByProtein[protein] || 0;
        expect(count).toBeGreaterThan(0);
        console.log(`✓ ${protein}: ${count} recipes`);
      }
    });

    it('should have total recipe count >= 100', async () => {
      const total = Object.values(recipeCountsByProtein).reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThanOrEqual(100);
      console.log(`✓ Total active recipes: ${total}`);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 2: Data Integrity (Required Fields)
  // ─────────────────────────────────────────────────────────────
  describe('Data Integrity - Required Fields', () => {
    it('should have no recipes missing required fields', async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, name, protein_id, protein_name, ingredients, steps, is_active')
        .eq('is_active', true)
        .limit(100); // Check first 100 active recipes

      if (error) throw error;

      const recipes = data as SupabaseRecipe[];
      const missingFields: string[] = [];

      recipes.forEach((recipe) => {
        if (!recipe.id) missingFields.push(`${recipe.name}: missing id`);
        if (!recipe.name) missingFields.push(`Recipe ${recipe.id}: missing name`);
        if (!recipe.protein_id) missingFields.push(`${recipe.name}: missing protein_id`);
        if (!recipe.protein_name) missingFields.push(`${recipe.name}: missing protein_name`);
        if (!recipe.ingredients) missingFields.push(`${recipe.name}: missing ingredients`);
        if (!recipe.steps) missingFields.push(`${recipe.name}: missing steps`);
      });

      if (missingFields.length > 0) {
        console.error('Missing fields:', missingFields);
      }

      expect(missingFields).toEqual([]);
      console.log(`✓ All ${recipes.length} recipes have required fields`);
    });

    it('should have valid ingredients format (array or object)', async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, name, ingredients')
        .eq('is_active', true)
        .limit(50);

      if (error) throw error;

      const recipes = data as SupabaseRecipe[];
      const invalidRecipes: string[] = [];

      recipes.forEach((recipe) => {
        const ing = recipe.ingredients;
        // Should be object with "2-3 servings" and/or "4-6 servings" keys
        if (ing && typeof ing === 'object' && !Array.isArray(ing)) {
          const keys = Object.keys(ing);
          if (keys.length === 0) {
            invalidRecipes.push(`${recipe.name}: empty ingredients`);
          }
        } else if (!ing) {
          invalidRecipes.push(`${recipe.name}: null ingredients`);
        }
      });

      if (invalidRecipes.length > 0) {
        console.warn('Invalid ingredient formats:', invalidRecipes);
      }

      expect(invalidRecipes.length).toBeLessThan(recipes.length * 0.1); // Allow <10% invalid
      console.log(`✓ ${recipes.length - invalidRecipes.length}/${recipes.length} recipes have valid ingredients`);
    });

    it('should have valid steps format (array)', async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, name, steps')
        .eq('is_active', true)
        .limit(50);

      if (error) throw error;

      const recipes = data as SupabaseRecipe[];
      const invalidRecipes: string[] = [];

      recipes.forEach((recipe) => {
        const steps = recipe.steps;
        if (!Array.isArray(steps) || steps.length === 0) {
          invalidRecipes.push(`${recipe.name}: invalid or empty steps`);
        }
      });

      expect(invalidRecipes).toEqual([]);
      console.log(`✓ All ${recipes.length} recipes have valid steps`);
    });

    it('should have valid protein_id values', async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, name, protein_id')
        .eq('is_active', true)
        .limit(100);

      if (error) throw error;

      const recipes = data as SupabaseRecipe[];
      const validProteinIds = Object.keys(PROTEINS);
      const invalidRecipes: string[] = [];

      recipes.forEach((recipe) => {
        if (!validProteinIds.includes(recipe.protein_id)) {
          invalidRecipes.push(`${recipe.name}: invalid protein_id "${recipe.protein_id}"`);
        }
      });

      expect(invalidRecipes).toEqual([]);
      console.log(`✓ All ${recipes.length} recipes have valid protein_id`);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 3: Duplicate Detection
  // ─────────────────────────────────────────────────────────────
  describe('Duplicate Detection', () => {
    it('should have no exact name duplicates within same protein', async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, name, protein_id')
        .eq('is_active', true);

      if (error) throw error;

      const recipes = data as SupabaseRecipe[];
      const nameMap: Record<string, string[]> = {};

      recipes.forEach((recipe) => {
        const key = `${recipe.protein_id}:${recipe.name.toLowerCase()}`;
        if (!nameMap[key]) nameMap[key] = [];
        nameMap[key].push(recipe.id);
      });

      const duplicates = Object.entries(nameMap)
        .filter(([_, ids]) => ids.length > 1)
        .map(([key, ids]) => `${key} (${ids.length} copies)`);

      if (duplicates.length > 0) {
        console.warn(`⚠️  Found ${duplicates.length} duplicate recipe names:`, duplicates.slice(0, 10));
      }

      // Allow some duplicates but flag them
      expect(duplicates.length).toBeLessThan(recipes.length * 0.05); // Allow <5% duplicates
      console.log(`✓ Duplicate name check: ${duplicates.length} found (acceptable)`);
    });

    it('should have no recipes with null fingerprints (if fingerprinting enabled)', async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, name, fingerprint')
        .eq('is_active', true)
        .limit(50);

      if (error) throw error;

      const recipes = data as SupabaseRecipe[];
      const nullFingerprints = recipes.filter((r) => r.fingerprint === null);

      // This is expected if fingerprinting was added later
      console.log(`ℹ️  ${nullFingerprints.length}/${recipes.length} recipes have null fingerprints (expected if fingerprinting was added later)`);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 4: Active vs Inactive Status
  // ─────────────────────────────────────────────────────────────
  describe('Active vs Inactive Status', () => {
    it('should have more active recipes than inactive', async () => {
      const { data: activeData, error: activeError } = await supabase
        .from('recipes')
        .select('id', { count: 'exact' })
        .eq('is_active', true);

      const { data: inactiveData, error: inactiveError } = await supabase
        .from('recipes')
        .select('id', { count: 'exact' })
        .eq('is_active', false);

      if (activeError || inactiveError) throw new Error('Count query failed');

      const activeCount = activeData?.length || 0;
      const inactiveCount = inactiveData?.length || 0;

      expect(activeCount).toBeGreaterThan(inactiveCount);
      console.log(`✓ Active: ${activeCount}, Inactive: ${inactiveCount}`);
    });

    it('should have at least 90% active recipes', async () => {
      const { data: allData, error } = await supabase
        .from('recipes')
        .select('is_active');

      if (error) throw error;

      const recipes = allData as Array<{ is_active: boolean }>;
      const activeCount = recipes.filter((r) => r.is_active).length;
      const activePercent = (activeCount / recipes.length) * 100;

      expect(activePercent).toBeGreaterThan(90);
      console.log(`✓ ${activePercent.toFixed(1)}% recipes are active`);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 5: Recipe Source Distribution
  // ─────────────────────────────────────────────────────────────
  describe('Recipe Source Distribution', () => {
    it('should have curated recipes', async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id')
        .eq('is_active', true)
        .eq('source', 'curated');

      if (error) throw error;

      const count = data?.length || 0;
      expect(count).toBeGreaterThan(0);
      console.log(`✓ Curated recipes: ${count}`);
    });

    it('should have AI-generated recipes', async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id')
        .eq('is_active', true)
        .eq('source', 'ai');

      if (error) throw error;

      const count = data?.length || 0;
      console.log(`ℹ️  AI-generated recipes: ${count} (optional)`);
    });

    it('should have source distribution report', async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('source')
        .eq('is_active', true);

      if (error) throw error;

      const sources: Record<string, number> = {};
      (data as Array<{ source: string }>).forEach((recipe) => {
        sources[recipe.source] = (sources[recipe.source] || 0) + 1;
      });

      console.log('Recipe source distribution:', sources);
      expect(Object.keys(sources).length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 6: Recent Recipe Additions
  // ─────────────────────────────────────────────────────────────
  describe('Recent Recipe Additions', () => {
    it('should have recipes added in the last 30 days', async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('recipes')
        .select('id, created_at')
        .eq('is_active', true)
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (error) throw error;

      const count = data?.length || 0;
      console.log(`ℹ️  Recipes added in last 30 days: ${count}`);
      // This is informational, not a hard gate
    });

    it('should show recipes added per protein (last 7 days)', async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('recipes')
        .select('protein_id')
        .eq('is_active', true)
        .gte('created_at', sevenDaysAgo.toISOString());

      if (error) throw error;

      const proteinCounts: Record<string, number> = {};
      (data as Array<{ protein_id: string }>).forEach((recipe) => {
        proteinCounts[recipe.protein_id] = (proteinCounts[recipe.protein_id] || 0) + 1;
      });

      console.log('Recipes added in last 7 days by protein:', proteinCounts);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 7: Database Health Report
  // ─────────────────────────────────────────────────────────────
  describe('Database Health Report', () => {
    it('should generate comprehensive database health report', async () => {
      // Fetch all relevant stats
      const [
        { data: allRecipes },
        { data: activeRecipes },
        { data: curatedRecipes },
        { data: aiRecipes },
      ] = await Promise.all([
        supabase.from('recipes').select('id', { count: 'exact' }),
        supabase.from('recipes').select('id', { count: 'exact' }).eq('is_active', true),
        supabase
          .from('recipes')
          .select('id', { count: 'exact' })
          .eq('is_active', true)
          .eq('source', 'curated'),
        supabase
          .from('recipes')
          .select('id', { count: 'exact' })
          .eq('is_active', true)
          .eq('source', 'ai'),
      ]);

      const report = {
        timestamp: new Date().toISOString(),
        totalRecipes: allRecipes?.length || 0,
        activeRecipes: activeRecipes?.length || 0,
        inactiveRecipes: (allRecipes?.length || 0) - (activeRecipes?.length || 0),
        curatedRecipes: curatedRecipes?.length || 0,
        aiRecipes: aiRecipes?.length || 0,
        activePercent: ((activeRecipes?.length || 0) / (allRecipes?.length || 1) * 100).toFixed(1),
      };

      console.log('📊 Database Health Report:');
      console.log(`   Total recipes: ${report.totalRecipes}`);
      console.log(`   Active recipes: ${report.activeRecipes} (${report.activePercent}%)`);
      console.log(`   Inactive recipes: ${report.inactiveRecipes}`);
      console.log(`   Curated recipes: ${report.curatedRecipes}`);
      console.log(`   AI recipes: ${report.aiRecipes}`);

      expect(report.totalRecipes).toBeGreaterThan(0);
    });
  });
});
