#!/usr/bin/env node
/**
 * download-ingredient-images.js — SpiceStrong
 * Downloads top 500 ingredient thumbnail images from Spoonacular CDN.
 * Saves to assets/images/ingredients/ as small PNGs.
 *
 * Usage:
 *   node scripts/download-ingredient-images.js
 *   node scripts/download-ingredient-images.js --dry-run   # list ingredients without downloading
 *
 * Output: assets/images/ingredients/<name>.jpg (100x100 thumbnails)
 * Also generates: src/data/ingredientImages.ts (mapping file for the app)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'assets', 'images', 'ingredients');
const MAPPING_FILE = path.resolve(__dirname, '..', 'src', 'data', 'ingredientImageMap.ts');
const CDN_BASE = 'https://spoonacular.com/cdn/ingredients_100x100';
const DRY_RUN = process.argv.includes('--dry-run');

// ═══════════════════════════════════════
// TOP 500 COOKING INGREDIENTS
// ═══════════════════════════════════════
const INGREDIENTS = [
  // ── Proteins ──
  'chicken-breast.jpg', 'chicken-thighs.jpg', 'whole-chicken.jpg', 'ground-chicken.jpg',
  'beef-steak.jpg', 'ground-beef.jpg', 'beef-chuck.jpg', 'beef-sirloin.jpg',
  'pork-chops.jpg', 'ground-pork.jpg', 'pork-tenderloin.jpg', 'bacon.jpg',
  'lamb-chops.jpg', 'ground-lamb.jpg', 'lamb-leg.jpg',
  'salmon.jpg', 'tuna.jpg', 'cod.jpg', 'tilapia.jpg', 'shrimp.jpg', 'prawns.jpg',
  'eggs.jpg', 'egg-whites.jpg', 'egg-yolks.jpg',
  'tofu.jpg', 'tempeh.jpg', 'paneer.jpg',
  'turkey-breast.jpg', 'ground-turkey.jpg', 'duck-breast.jpg',
  'crab.jpg', 'lobster.jpg', 'scallops.jpg', 'mussels.jpg', 'clams.jpg',
  'sardines.jpg', 'anchovies.jpg', 'mackerel.jpg', 'swordfish.jpg', 'halibut.jpg',
  'venison.jpg', 'bison.jpg', 'goat.jpg',

  // ── Dairy ──
  'milk.jpg', 'butter.jpg', 'heavy-cream.jpg', 'sour-cream.jpg',
  'plain-yogurt.jpg', 'greek-yogurt.jpg', 'cream-cheese.jpg',
  'cheddar-cheese.jpg', 'mozzarella.jpg', 'parmesan.jpg', 'feta.jpg',
  'ricotta.jpg', 'gouda.jpg', 'brie.jpg', 'cottage-cheese.jpg',
  'ghee.jpg', 'buttermilk.jpg', 'condensed-milk.jpg', 'evaporated-milk.jpg',
  'whipped-cream.jpg', 'half-and-half.jpg',

  // ── Vegetables ──
  'onion.jpg', 'garlic.jpg', 'ginger.jpg', 'potato.jpg', 'sweet-potato.jpg',
  'tomato.jpg', 'bell-pepper.jpg', 'jalapeno.jpg', 'serrano-pepper.jpg',
  'broccoli.jpg', 'cauliflower.jpg', 'spinach.jpg', 'kale.jpg',
  'lettuce.jpg', 'cabbage.jpg', 'brussels-sprouts.jpg',
  'carrot.jpg', 'celery.jpg', 'cucumber.jpg', 'zucchini.jpg',
  'eggplant.jpg', 'mushrooms.jpg', 'corn.jpg', 'peas.jpg', 'green-beans.jpg',
  'asparagus.jpg', 'artichoke.jpg', 'beets.jpg', 'radish.jpg', 'turnip.jpg',
  'leek.jpg', 'shallot.jpg', 'scallion.jpg', 'chives.jpg',
  'bok-choy.jpg', 'swiss-chard.jpg', 'collard-greens.jpg', 'arugula.jpg',
  'watercress.jpg', 'fennel.jpg', 'okra.jpg', 'parsnip.jpg',
  'snap-peas.jpg', 'snow-peas.jpg', 'edamame.jpg',
  'avocado.jpg', 'olives.jpg', 'sun-dried-tomatoes.jpg',
  'roasted-red-peppers.jpg', 'hearts-of-palm.jpg',
  'fresh-basil.jpg', 'fresh-cilantro.jpg', 'fresh-parsley.jpg', 'fresh-mint.jpg',
  'fresh-rosemary.jpg', 'fresh-thyme.jpg', 'fresh-dill.jpg', 'fresh-oregano.jpg',
  'lemongrass.jpg', 'curry-leaves.jpg', 'bay-leaves.jpg',

  // ── Fruits ──
  'lemon.jpg', 'lime.jpg', 'orange.jpg', 'grapefruit.jpg',
  'apple.jpg', 'banana.jpg', 'pineapple.jpg', 'mango.jpg',
  'strawberries.jpg', 'blueberries.jpg', 'raspberries.jpg', 'blackberries.jpg',
  'grapes.jpg', 'watermelon.jpg', 'cantaloupe.jpg', 'honeydew.jpg',
  'peach.jpg', 'plum.jpg', 'pear.jpg', 'cherry.jpg',
  'pomegranate.jpg', 'fig.jpg', 'dates.jpg', 'coconut.jpg',
  'passion-fruit.jpg', 'papaya.jpg', 'kiwi.jpg', 'dragon-fruit.jpg',
  'cranberries.jpg', 'raisins.jpg', 'dried-apricots.jpg', 'prunes.jpg',

  // ── Grains & Pasta ──
  'white-rice.jpg', 'brown-rice.jpg', 'basmati-rice.jpg', 'jasmine-rice.jpg',
  'quinoa.jpg', 'couscous.jpg', 'bulgur.jpg', 'farro.jpg', 'barley.jpg',
  'oats.jpg', 'steel-cut-oats.jpg', 'granola.jpg',
  'spaghetti.jpg', 'penne.jpg', 'fusilli.jpg', 'linguine.jpg', 'macaroni.jpg',
  'lasagna-noodles.jpg', 'egg-noodles.jpg', 'rice-noodles.jpg', 'udon.jpg', 'soba.jpg',
  'bread.jpg', 'tortillas.jpg', 'naan.jpg', 'pita.jpg', 'baguette.jpg',
  'breadcrumbs.jpg', 'croutons.jpg', 'cornmeal.jpg', 'polenta.jpg',

  // ── Legumes & Beans ──
  'black-beans.jpg', 'kidney-beans.jpg', 'chickpeas.jpg', 'lentils.jpg',
  'navy-beans.jpg', 'pinto-beans.jpg', 'white-beans.jpg', 'lima-beans.jpg',
  'split-peas.jpg', 'black-eyed-peas.jpg', 'soybeans.jpg',
  'hummus.jpg', 'peanut-butter.jpg', 'almond-butter.jpg', 'tahini.jpg',

  // ── Nuts & Seeds ──
  'almonds.jpg', 'cashews.jpg', 'walnuts.jpg', 'pecans.jpg', 'pistachios.jpg',
  'peanuts.jpg', 'macadamia.jpg', 'hazelnuts.jpg', 'pine-nuts.jpg',
  'sunflower-seeds.jpg', 'pumpkin-seeds.jpg', 'sesame-seeds.jpg',
  'chia-seeds.jpg', 'flax-seeds.jpg', 'hemp-seeds.jpg',
  'coconut-flakes.jpg', 'poppy-seeds.jpg',

  // ── Oils & Fats ──
  'olive-oil.jpg', 'vegetable-oil.jpg', 'coconut-oil.jpg', 'sesame-oil.jpg',
  'avocado-oil.jpg', 'canola-oil.jpg', 'peanut-oil.jpg', 'sunflower-oil.jpg',
  'walnut-oil.jpg', 'truffle-oil.jpg', 'lard.jpg', 'shortening.jpg',
  'cooking-spray.jpg',

  // ── Spices & Seasonings ──
  'salt.jpg', 'black-pepper.jpg', 'white-pepper.jpg', 'cayenne.jpg',
  'paprika.jpg', 'smoked-paprika.jpg', 'chili-powder.jpg', 'red-pepper-flakes.jpg',
  'cumin.jpg', 'coriander.jpg', 'turmeric.jpg', 'garam-masala.jpg',
  'curry-powder.jpg', 'cinnamon.jpg', 'nutmeg.jpg', 'cloves.jpg',
  'cardamom.jpg', 'allspice.jpg', 'star-anise.jpg', 'fennel-seeds.jpg',
  'mustard-seeds.jpg', 'fenugreek.jpg', 'saffron.jpg',
  'dried-oregano.jpg', 'dried-basil.jpg', 'dried-thyme.jpg', 'dried-rosemary.jpg',
  'dried-parsley.jpg', 'dried-dill.jpg', 'dried-sage.jpg', 'dried-tarragon.jpg',
  'bay-leaf.jpg', 'italian-seasoning.jpg', 'herbes-de-provence.jpg',
  'garlic-powder.jpg', 'onion-powder.jpg', 'celery-salt.jpg',
  'old-bay.jpg', 'taco-seasoning.jpg', 'everything-bagel.jpg',
  'za-atar.jpg', 'sumac.jpg', 'chinese-five-spice.jpg',
  'vanilla-extract.jpg', 'almond-extract.jpg', 'peppermint-extract.jpg',

  // ── Sauces & Condiments ──
  'soy-sauce.jpg', 'fish-sauce.jpg', 'oyster-sauce.jpg', 'hoisin-sauce.jpg',
  'worcestershire-sauce.jpg', 'hot-sauce.jpg', 'sriracha.jpg',
  'tomato-sauce.jpg', 'tomato-paste.jpg', 'marinara.jpg', 'salsa.jpg',
  'ketchup.jpg', 'mustard.jpg', 'dijon-mustard.jpg', 'whole-grain-mustard.jpg',
  'mayonnaise.jpg', 'ranch-dressing.jpg', 'italian-dressing.jpg',
  'bbq-sauce.jpg', 'teriyaki-sauce.jpg', 'sweet-chili-sauce.jpg',
  'vinegar.jpg', 'apple-cider-vinegar.jpg', 'balsamic-vinegar.jpg', 'rice-vinegar.jpg',
  'red-wine-vinegar.jpg', 'white-wine-vinegar.jpg',
  'honey.jpg', 'maple-syrup.jpg', 'agave.jpg', 'molasses.jpg',
  'miso-paste.jpg', 'gochujang.jpg', 'harissa.jpg', 'sambal-oelek.jpg',
  'pesto.jpg', 'chimichurri.jpg', 'tzatziki.jpg',
  'coconut-milk.jpg', 'coconut-cream.jpg', 'coconut-aminos.jpg',

  // ── Baking ──
  'all-purpose-flour.jpg', 'bread-flour.jpg', 'whole-wheat-flour.jpg',
  'almond-flour.jpg', 'coconut-flour.jpg', 'oat-flour.jpg',
  'cornstarch.jpg', 'arrowroot.jpg', 'tapioca-starch.jpg',
  'baking-powder.jpg', 'baking-soda.jpg', 'yeast.jpg',
  'sugar.jpg', 'brown-sugar.jpg', 'powdered-sugar.jpg',
  'cocoa-powder.jpg', 'chocolate-chips.jpg', 'dark-chocolate.jpg',
  'vanilla-bean.jpg', 'gelatin.jpg',

  // ── Canned & Preserved ──
  'canned-tomatoes.jpg', 'crushed-tomatoes.jpg', 'diced-tomatoes.jpg',
  'tomato-sauce.jpg', 'canned-corn.jpg', 'canned-beans.jpg',
  'canned-tuna.jpg', 'canned-salmon.jpg', 'canned-chicken.jpg',
  'chicken-broth.jpg', 'beef-broth.jpg', 'vegetable-broth.jpg',
  'coconut-milk.jpg', 'canned-pumpkin.jpg', 'canned-pineapple.jpg',
  'artichoke-hearts.jpg', 'capers.jpg', 'pickles.jpg',
  'kimchi.jpg', 'sauerkraut.jpg',

  // ── Beverages & Misc ──
  'coffee.jpg', 'tea.jpg', 'matcha.jpg',
  'protein-powder.jpg', 'whey-protein.jpg', 'collagen.jpg',
  'nutritional-yeast.jpg', 'spirulina.jpg',
  'apple-juice.jpg', 'orange-juice.jpg', 'lemon-juice.jpg', 'lime-juice.jpg',
  'wine.jpg', 'beer.jpg', 'sake.jpg', 'mirin.jpg',
  'stock-cubes.jpg', 'bouillon.jpg',
  'tortilla-chips.jpg', 'wonton-wrappers.jpg', 'spring-roll-wrappers.jpg',
  'phyllo-dough.jpg', 'puff-pastry.jpg', 'pie-crust.jpg',
];

// ═══════════════════════════════════════
// DOWNLOAD FUNCTION
// ═══════════════════════════════════════

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        https.get(response.headers.location, (res2) => {
          res2.pipe(file);
          file.on('finish', () => { file.close(); resolve(true); });
        }).on('error', () => { fs.unlink(dest, () => {}); resolve(false); });
        return;
      }
      if (response.statusCode !== 200) {
        fs.unlink(dest, () => {});
        resolve(false);
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
    }).on('error', () => { fs.unlink(dest, () => {}); resolve(false); });
  });
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

async function main() {
  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const uniqueIngredients = [...new Set(INGREDIENTS)];
  console.log(`\n🥬 SpiceStrong Ingredient Image Downloader`);
  console.log(`   ${uniqueIngredients.length} ingredients to download`);
  console.log(`   Output: ${OUTPUT_DIR}\n`);

  if (DRY_RUN) {
    console.log('DRY RUN — listing ingredients:\n');
    uniqueIngredients.forEach((name, i) => console.log(`  ${i + 1}. ${name}`));
    console.log(`\nRun without --dry-run to download.`);
    return;
  }

  let downloaded = 0;
  let failed = 0;
  let skipped = 0;
  const successNames = [];

  for (let i = 0; i < uniqueIngredients.length; i++) {
    const filename = uniqueIngredients[i];
    const dest = path.join(OUTPUT_DIR, filename);

    // Skip if already downloaded
    if (fs.existsSync(dest)) {
      skipped++;
      successNames.push(filename);
      continue;
    }

    const url = `${CDN_BASE}/${filename}`;
    process.stdout.write(`  [${i + 1}/${uniqueIngredients.length}] ${filename}...`);

    const success = await downloadFile(url, dest);
    if (success) {
      downloaded++;
      successNames.push(filename);
      console.log(' ✓');
    } else {
      failed++;
      console.log(' ✗ (not found)');
    }

    // Small delay to be respectful to CDN
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`\n✅ Done: ${downloaded} downloaded, ${skipped} skipped (existing), ${failed} failed\n`);

  // Generate TypeScript mapping file
  console.log(`📝 Generating mapping file: ${MAPPING_FILE}`);

  const mappingEntries = successNames.map((filename) => {
    const key = filename.replace('.jpg', '').replace(/-/g, ' ');
    return `  '${key}': require('../../assets/images/ingredients/${filename}'),`;
  });

  const mappingContent = `/**
 * ingredientImageMap.ts — Auto-generated by download-ingredient-images.js
 * Maps ingredient names to local image assets.
 * DO NOT EDIT MANUALLY — re-run the script to update.
 */

export const INGREDIENT_IMAGES: Record<string, any> = {
${mappingEntries.join('\n')}
};

/**
 * Get the local image for an ingredient name.
 * Falls back to null if no image is found.
 */
export function getIngredientImage(ingredientName: string): any | null {
  const normalized = ingredientName.toLowerCase().trim();

  // Direct match
  if (INGREDIENT_IMAGES[normalized]) return INGREDIENT_IMAGES[normalized];

  // Partial match — find the first key that the ingredient name contains
  for (const [key, image] of Object.entries(INGREDIENT_IMAGES)) {
    if (normalized.includes(key) || key.includes(normalized)) return image;
  }

  return null;
}
`;

  fs.writeFileSync(MAPPING_FILE, mappingContent, 'utf-8');
  console.log(`✅ Mapping file generated with ${successNames.length} entries\n`);
}

main().catch(console.error);
