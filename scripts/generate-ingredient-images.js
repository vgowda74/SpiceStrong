#!/usr/bin/env node
/**
 * generate-ingredient-images.js — Finds all ingredients missing images
 * and generates them using fal.ai API.
 *
 * Usage:
 *   node scripts/generate-ingredient-images.js                # List missing ingredients only
 *   node scripts/generate-ingredient-images.js --generate     # Generate images with fal.ai
 *
 * Prerequisites:
 *   - FAL_KEY in .env (get from https://fal.ai/dashboard/keys)
 *   - npm install @fal-ai/client (if not installed)
 *
 * Run from project root: cd C:\Users\v_gow\SpiceStrong
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FAL_KEY = process.env.FAL_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const shouldGenerate = process.argv.includes('--generate');
const IMAGES_DIR = path.join(__dirname, '..', 'assets', 'images', 'Ingradients');

// Existing image patterns (from ingredientImages.ts)
const EXISTING_PATTERNS = [
  /chicken/i,
  /chopped.*onion|onion.*chop/i,
  /red\s*onion|onion/i,
  /pepper|peppercorn/i,
  /fennel/i,
  /cumin/i,
  /ginger.*garlic|garlic.*ginger/i,
  /oil|gingelly/i,
  /curry\s*lea/i,
  /turmeric/i,
  /garam\s*masala/i,
];

function hasExistingImage(name) {
  return EXISTING_PATTERNS.some(p => p.test(name));
}

function toFileName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 40) + '.png';
}

function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    client.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function generateWithFal(ingredientName) {
  if (!FAL_KEY) {
    throw new Error('FAL_KEY not set in .env');
  }

  const prompt = `Professional food photography of ${ingredientName} on a clean dark wooden surface, ` +
    `isolated ingredient, top-down view, soft natural lighting, high resolution, no text, no labels, ` +
    `dark moody background, culinary ingredient photography style, 4k quality`;

  // Step 1: Submit to queue
  const submitResponse = await fetch('https://queue.fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${FAL_KEY}`,
    },
    body: JSON.stringify({
      prompt,
      image_size: 'square',
      num_inference_steps: 4,
      num_images: 1,
    }),
  });

  if (!submitResponse.ok) {
    const err = await submitResponse.text();
    throw new Error(`fal.ai submit ${submitResponse.status}: ${err}`);
  }

  const submitData = await submitResponse.json();

  // If images are returned directly (sync response)
  if (submitData.images?.[0]?.url) {
    return submitData.images[0].url;
  }

  // Step 2: Poll the response_url until complete
  const responseUrl = submitData.response_url;
  if (!responseUrl) {
    throw new Error('No response_url in fal.ai queue response');
  }

  // Poll with timeout (max 60 seconds)
  const maxWait = 60000;
  const pollInterval = 2000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await sleep(pollInterval);

    const pollResponse = await fetch(responseUrl, {
      headers: { 'Authorization': `Key ${FAL_KEY}` },
    });

    if (!pollResponse.ok) {
      // 202 means still processing
      if (pollResponse.status === 202) continue;
      const err = await pollResponse.text();
      throw new Error(`fal.ai poll ${pollResponse.status}: ${err}`);
    }

    const pollData = await pollResponse.json();

    // Check if complete
    if (pollData.images?.[0]?.url) {
      return pollData.images[0].url;
    }

    // Still in queue or processing
    if (pollData.status === 'IN_QUEUE' || pollData.status === 'IN_PROGRESS') {
      continue;
    }

    // If we got data but no images, check for other formats
    if (pollData.output?.images?.[0]?.url) {
      return pollData.output.images[0].url;
    }
  }

  throw new Error('Timed out waiting for fal.ai image generation (60s)');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  SpiceStrong Ingredient Image Generator');
  console.log(`  Mode: ${shouldGenerate ? '🎨 GENERATE (will create images)' : '📋 LIST (missing ingredients only)'}`);
  console.log('═══════════════════════════════════════\n');

  // Fetch all active recipes
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('name, ingredients, protein_id')
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch recipes:', error.message);
    process.exit(1);
  }

  // Collect all unique ingredient names
  const allIngredients = new Set();
  for (const recipe of recipes) {
    const raw = typeof recipe.ingredients === 'string' ? JSON.parse(recipe.ingredients) : recipe.ingredients;
    let items = [];
    if (Array.isArray(raw)) {
      items = raw.map(i => typeof i === 'string' ? i : i.name);
    } else if (raw && typeof raw === 'object') {
      items = (raw['2-3 servings'] || []).map(i => i.name);
    }
    items.forEach(name => {
      // Normalize: strip quantity info in parentheses, trim
      const cleaned = name.replace(/\(.*?\)/g, '').trim();
      if (cleaned.length > 1) allIngredients.add(cleaned);
    });
  }

  console.log(`Found ${allIngredients.size} unique ingredients across ${recipes.length} recipes\n`);

  // Separate into has-image vs missing-image
  const hasImage = [];
  const missingImage = [];

  for (const name of allIngredients) {
    if (hasExistingImage(name)) {
      hasImage.push(name);
    } else {
      missingImage.push(name);
    }
  }

  console.log(`✅ Have images: ${hasImage.length}`);
  console.log(`❌ Missing images: ${missingImage.length}\n`);

  if (missingImage.length === 0) {
    console.log('🎉 All ingredients have images!');
    return;
  }

  // Deduplicate similar ingredients (e.g., "salt" appears in many recipes)
  const uniqueMissing = [...new Set(missingImage.map(n => {
    // Normalize for dedup: lowercase, strip prep notes
    return n.toLowerCase()
      .replace(/\s*(chopped|diced|sliced|minced|crushed|grated|fresh|dried|ground|whole|raw|boneless|skinless)\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }))].sort();

  console.log(`📋 Unique missing ingredients (${uniqueMissing.length}):\n`);
  uniqueMissing.forEach((name, i) => {
    const fileName = toFileName(name);
    const exists = fs.existsSync(path.join(IMAGES_DIR, fileName));
    console.log(`  ${i + 1}. ${name} → ${fileName} ${exists ? '(file exists)' : ''}`);
  });

  if (!shouldGenerate) {
    console.log(`\n💡 Run with --generate to create images with fal.ai:`);
    console.log(`   node scripts/generate-ingredient-images.js --generate`);
    console.log(`\n⚠️  Make sure FAL_KEY is set in your .env file`);
    console.log(`   Get your key at: https://fal.ai/dashboard/keys`);
    return;
  }

  // Generate images
  if (!FAL_KEY) {
    console.error('\n❌ FAL_KEY not set in .env. Get your key at: https://fal.ai/dashboard/keys');
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  console.log(`\n🎨 Generating ${uniqueMissing.length} ingredient images...\n`);

  let generated = 0;
  let genFailed = 0;

  for (let i = 0; i < uniqueMissing.length; i++) {
    const name = uniqueMissing[i];
    const fileName = toFileName(name);
    const destPath = path.join(IMAGES_DIR, fileName);

    // Skip if file already exists
    if (fs.existsSync(destPath)) {
      console.log(`  ⏭️  [${i + 1}/${uniqueMissing.length}] ${name} — already exists`);
      generated++;
      continue;
    }

    try {
      console.log(`  🎨 [${i + 1}/${uniqueMissing.length}] Generating: ${name}...`);
      const imageUrl = await generateWithFal(name);
      await downloadImage(imageUrl, destPath);
      console.log(`     ✅ Saved: ${fileName}`);
      generated++;
      await sleep(500); // Rate limit
    } catch (err) {
      console.log(`     ❌ Failed: ${err.message}`);
      genFailed++;
      await sleep(1000);
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  GENERATION SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`  ✅ Generated: ${generated}`);
  console.log(`  ❌ Failed:    ${genFailed}`);
  console.log(`  📁 Saved to:  ${IMAGES_DIR}`);
  console.log('═══════════════════════════════════════');

  if (generated > 0) {
    console.log('\n⚠️  NEXT STEP: Update src/data/ingredientImages.ts to add the new images.');
    console.log('   Run this script to generate the mapping code:');
    console.log('   node scripts/generate-ingredient-images.js --generate --update-mapping');
  }

  // Generate mapping code if requested
  if (process.argv.includes('--update-mapping')) {
    console.log('\n📝 Add these entries to src/data/ingredientImages.ts:\n');
    for (const name of uniqueMissing) {
      const fileName = toFileName(name);
      if (fs.existsSync(path.join(IMAGES_DIR, fileName))) {
        const pattern = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        console.log(`  [/${pattern}/i, require('../../assets/images/Ingradients/${fileName}')],`);
      }
    }
  }
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
