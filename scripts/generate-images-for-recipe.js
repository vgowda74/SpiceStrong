#!/usr/bin/env node
/**
 * generate-images-for-recipe.js
 *
 * Generates hero + step images for an existing recipe that was inserted
 * directly into Supabase (without going through the onboard script).
 *
 * Usage:
 *   node scripts/generate-images-for-recipe.js <recipe-id>
 *
 * Example:
 *   node scripts/generate-images-for-recipe.js curated-eggs-highprotein-masala-oats-upma
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const { fal } = require('@fal-ai/client');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon';
console.log(`Using Supabase key: ${keyType}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Image Generation ──

async function generateImage(prompt) {
  console.log(`  Prompt: ${prompt.substring(0, 90)}...`);
  const result = await fal.subscribe('fal-ai/nano-banana-2', {
    input: { prompt, image_size: 'square_hd' },
  });
  const imageUrl = result.data.images[0].url;
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download generated image: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadImageBuffer(recipeId, buffer, imageType, stepIndex) {
  const storageName = imageType === 'hero' ? 'hero.jpg' : `step_${stepIndex}.jpg`;
  const storagePath = `${recipeId}/${storageName}`;
  const { error } = await supabase.storage
    .from('recipe-images')
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data: urlData } = supabase.storage.from('recipe-images').getPublicUrl(storagePath);
  return urlData.publicUrl;
}

async function insertImageMetadata(recipeId, publicUrl, imageType, stepIndex) {
  const { error } = await supabase
    .from('recipe_images')
    .insert({ recipe_id: recipeId, image_type: imageType, step_index: stepIndex || null, storage_url: publicUrl });
  if (error) throw new Error(`DB insert failed: ${error.message}`);
}

// ── Prompt Builders ──

function buildHeroPrompt(recipe) {
  const ingredients = recipe.ingredients?.['1 serving'] || recipe.ingredients?.['2-3 servings'] || [];
  const topIngredients = ingredients.slice(0, 5)
    .map(ing => ing.quantity ? `${ing.quantity} ${ing.name}` : ing.name)
    .join(', ');
  const cuisine = recipe.cuisine_type || 'South Indian';
  return `Professional food photography of "${recipe.name}", authentic ${cuisine} dish beautifully plated and ready to serve. Key ingredients visible: ${topIngredients}. Warm natural lighting, shallow depth of field, overhead angle, high protein healthy meal. Realistic food textures, home-cooked feel, magazine quality. No text, no watermarks.`;
}

function buildStepPrompt(recipeName, steps, stepIndex, ingredients) {
  const step = steps[stepIndex];
  const allDescs = steps.slice(0, stepIndex + 1).map(s => s.description.toLowerCase()).join(' ');

  let vessel = 'pan';
  if (allDescs.includes('pot') || allDescs.includes('boil')) vessel = 'pot';
  else if (allDescs.includes('kadai') || allDescs.includes('wok')) vessel = 'kadai (Indian wok)';
  else if (allDescs.includes('tawa') || allDescs.includes('griddle')) vessel = 'tawa (flat griddle)';

  const usedNames = (step.ingredientsUsed || '').split(',').map(s => s.trim()).filter(Boolean);
  const resolved = usedNames.map(usedName => {
    const target = usedName.toLowerCase();
    const found = ingredients.find(ing => {
      const n = (ing.name || '').toLowerCase();
      return n === target || n.includes(target) || target.includes(n.split('(')[0].trim());
    });
    return found?.quantity ? `${found.quantity} ${found.name || usedName}` : usedName;
  });
  const ingDetail = resolved.length > 0 ? `Ingredients: ${resolved.join(', ')}.` : '';

  const prevSummary = stepIndex > 0
    ? `Previously: ${steps.slice(0, stepIndex).map((s, i) => `Step ${i + 1} ${s.title}`).join(', ')}. `
    : '';

  return `Professional food photography, close-up action shot of Step ${stepIndex + 1}/${steps.length}: "${step.title}" for "${recipeName}". ${ingDetail} ${prevSummary}Cooking in a ${vessel}, ${step.cookingMethod || 'cooking'} in progress. Realistic textures, warm natural kitchen lighting, overhead or 45-degree angle. No text, no watermarks, photorealistic style.`;
}

// ── Main ──

async function main() {
  const recipeId = process.argv[2];
  if (!recipeId) {
    console.error('Usage: node scripts/generate-images-for-recipe.js <recipe-id>');
    process.exit(1);
  }

  console.log(`\nFetching recipe: ${recipeId}`);
  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', recipeId)
    .single();

  if (error || !recipe) {
    console.error('ERROR: Recipe not found:', error?.message);
    process.exit(1);
  }

  console.log(`Found: ${recipe.name} (${recipe.steps.length} steps)`);

  const { data: existingImages } = await supabase
    .from('recipe_images')
    .select('image_type, step_index')
    .eq('recipe_id', recipeId);

  const hasHero = existingImages?.some(i => i.image_type === 'hero');
  const existingSteps = new Set((existingImages || []).filter(i => i.image_type === 'step').map(i => i.step_index));

  const ingredients = recipe.ingredients?.['1 serving'] || recipe.ingredients?.['2-3 servings'] || [];

  // Hero image
  if (hasHero) {
    console.log('\n✓ Hero image already exists, skipping.');
  } else {
    console.log('\n→ Generating hero image...');
    try {
      const buffer = await generateImage(buildHeroPrompt(recipe));
      const publicUrl = await uploadImageBuffer(recipeId, buffer, 'hero', null);
      await insertImageMetadata(recipeId, publicUrl, 'hero', null);
      console.log(`  ✓ Hero uploaded: ${publicUrl}`);
    } catch (err) {
      console.error(`  ✗ Hero failed: ${err.message}`);
    }
  }

  // Step images
  console.log(`\n→ Generating ${recipe.steps.length} step images...`);
  for (let i = 0; i < recipe.steps.length; i++) {
    if (existingSteps.has(i)) {
      console.log(`  ✓ Step ${i} already exists, skipping.`);
      continue;
    }
    console.log(`\n  Step ${i}: ${recipe.steps[i].title}`);
    try {
      const buffer = await generateImage(buildStepPrompt(recipe.name, recipe.steps, i, ingredients));
      const publicUrl = await uploadImageBuffer(recipeId, buffer, 'step', i);
      await insertImageMetadata(recipeId, publicUrl, 'step', i);
      console.log(`  ✓ Step ${i} uploaded: ${publicUrl}`);
    } catch (err) {
      console.error(`  ✗ Step ${i} failed: ${err.message}`);
    }
  }

  console.log('\n✅ Done! All images generated and uploaded.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
