#!/usr/bin/env node

/**
 * Database Audit Script for SpiceStrong
 * Validates recipe data in Supabase
 * Run: npm run test:db:audit OR node scripts/audit-database.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ ERROR: Missing environment variables');
  console.error('   Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function pass(msg) {
  console.log(`✅ PASS: ${msg}`);
  passCount++;
}

function fail(msg) {
  console.log(`❌ FAIL: ${msg}`);
  failCount++;
}

function warn(msg) {
  console.log(`⚠️  WARN: ${msg}`);
  warnCount++;
}

async function auditDatabase() {
  console.log('\n📊 SpiceStrong Database Audit\n');
  console.log('='.repeat(60));

  try {
    // Test 1: Connection
    console.log('\n1️⃣  Testing Supabase Connection');
    const { data: connTest, error: connError } = await supabase
      .from('recipes')
      .select('id')
      .limit(1);

    if (connError) {
      fail(`Cannot connect to Supabase: ${connError.message}`);
      process.exit(1);
    }
    pass('Connected to Supabase');

    // Test 2: Recipe Counts
    console.log('\n2️⃣  Testing Recipe Counts by Protein');
    const { data: allRecipes, error: countError } = await supabase
      .from('recipes')
      .select('id, protein_id')
      .eq('is_active', true);

    if (countError) {
      fail(`Cannot fetch recipes: ${countError.message}`);
      process.exit(1);
    }

    const counts = {};
    allRecipes.forEach((r) => {
      counts[r.protein_id] = (counts[r.protein_id] || 0) + 1;
    });

    console.log(`   Total active recipes: ${allRecipes.length}`);

    let allProteinsHaveRecipes = true;
    for (const protein of Object.keys(PROTEINS)) {
      const count = counts[protein] || 0;
      if (count > 0) {
        console.log(`   • ${protein}: ${count} recipes`);
      } else {
        console.log(`   • ${protein}: 0 recipes ⚠️`);
        allProteinsHaveRecipes = false;
      }
    }

    if (allProteinsHaveRecipes) {
      pass('All 14 proteins have recipes');
    } else {
      fail('Some proteins have no recipes');
    }

    if (allRecipes.length >= 100) {
      pass(`Total recipes >= 100 (${allRecipes.length})`);
    } else {
      warn(`Total recipes < 100 (${allRecipes.length})`);
    }

    // Test 3: Data Integrity
    console.log('\n3️⃣  Testing Data Integrity');
    const { data: recipesSample, error: sampleError } = await supabase
      .from('recipes')
      .select('id, name, protein_id, ingredients, steps')
      .eq('is_active', true)
      .limit(100);

    if (sampleError) {
      fail(`Cannot fetch sample recipes: ${sampleError.message}`);
    } else {
      let missingFields = 0;
      let invalidIngredients = 0;
      let invalidSteps = 0;

      recipesSample.forEach((r) => {
        if (!r.id || !r.name || !r.protein_id) {
          missingFields++;
        }
        if (!r.ingredients || typeof r.ingredients !== 'object') {
          invalidIngredients++;
        }
        if (!Array.isArray(r.steps) || r.steps.length === 0) {
          invalidSteps++;
        }
      });

      if (missingFields === 0) {
        pass(`No missing required fields (${recipesSample.length} recipes checked)`);
      } else {
        fail(`${missingFields} recipes missing fields`);
      }

      if (invalidIngredients === 0) {
        pass(`Valid ingredients format (${recipesSample.length} recipes)`);
      } else {
        warn(`${invalidIngredients} recipes have invalid ingredients`);
      }

      if (invalidSteps === 0) {
        pass(`Valid steps format (${recipesSample.length} recipes)`);
      } else {
        warn(`${invalidSteps} recipes have invalid steps`);
      }
    }

    // Test 4: Duplicates
    console.log('\n4️⃣  Testing Duplicate Detection');
    const nameMap = {};
    allRecipes.forEach((r) => {
      const key = `${r.protein_id}`;
      if (!nameMap[key]) nameMap[key] = [];
      nameMap[key].push(r.id);
    });

    let duplicateCount = 0;
    Object.entries(nameMap).forEach(([_, ids]) => {
      if (ids.length > 1) {
        duplicateCount++;
      }
    });

    if (duplicateCount === 0) {
      pass('No duplicate recipes detected');
    } else {
      warn(`${duplicateCount} potential duplicates found`);
    }

    // Test 5: Active Status
    console.log('\n5️⃣  Testing Active vs Inactive');
    const { data: activeCount } = await supabase
      .from('recipes')
      .select('id', { count: 'exact' })
      .eq('is_active', true);

    const { data: inactiveCount } = await supabase
      .from('recipes')
      .select('id', { count: 'exact' })
      .eq('is_active', false);

    const activeNum = activeCount?.length || 0;
    const inactiveNum = inactiveCount?.length || 0;
    const activePercent = ((activeNum / (activeNum + inactiveNum)) * 100).toFixed(1);

    console.log(`   Active: ${activeNum} (${activePercent}%)`);
    console.log(`   Inactive: ${inactiveNum}`);

    if (activePercent >= 90) {
      pass(`${activePercent}% recipes are active (>= 90%)`);
    } else {
      warn(`Only ${activePercent}% recipes active (< 90%)`);
    }

    // Test 6: Source Distribution
    console.log('\n6️⃣  Testing Recipe Sources');
    const { data: sources } = await supabase
      .from('recipes')
      .select('source')
      .eq('is_active', true);

    const sourceCounts = {};
    sources.forEach((r) => {
      sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;
    });

    console.log(`   Sources found: ${JSON.stringify(sourceCounts)}`);

    if (sourceCounts.curated > 0) {
      pass(`Has curated recipes (${sourceCounts.curated})`);
    } else {
      warn('No curated recipes found');
    }

    // Test 7: Database Health Report
    console.log('\n7️⃣  Database Health Report');
    console.log(`   Total recipes: ${activeNum + inactiveNum}`);
    console.log(`   Active recipes: ${activeNum}`);
    console.log(`   Recipes per protein: ${(activeNum / 14).toFixed(1)} avg`);
    console.log(`   Source distribution: ${JSON.stringify(sourceCounts)}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log(`\n📋 AUDIT SUMMARY`);
    console.log(`   ✅ Passed: ${passCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   ⚠️  Warnings: ${warnCount}`);

    if (failCount === 0) {
      console.log(`\n✅ All critical tests passed! Build 64 is ready.\n`);
      process.exit(0);
    } else {
      console.log(`\n❌ ${failCount} test(s) failed. Please fix before release.\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

auditDatabase();
