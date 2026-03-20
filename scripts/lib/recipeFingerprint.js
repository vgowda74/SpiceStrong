/**
 * recipeFingerprint.js — SpiceStrong (Node.js version)
 *
 * Deterministic SHA-256 fingerprint for recipe deduplication.
 * This is the Node.js equivalent of src/utils/recipeFingerprint.ts
 * for use in backend scripts (onboarding, migration, etc.).
 *
 * Fingerprint formula:
 *   SHA-256( sorted_ingredient_names.join('|') + '|' + step_count )
 *
 * @module recipeFingerprint
 */

const crypto = require('crypto');

/**
 * Extracts the ingredient name from an item, handling both data shapes.
 * Prefers `ingredient_name` over `name` when both exist.
 *
 * @param {Object} item - The ingredient object
 * @returns {string} Normalized ingredient name
 */
function extractIngredientName(item) {
  const raw = item.ingredient_name || item.name || '';
  return raw.toLowerCase().trim();
}

/**
 * Resolves a flat array of ingredients from either a flat array
 * or a tiered IngredientsByTier object (uses the first tier found).
 *
 * @param {Array|Object} ingredients - Flat array or tiered object
 * @returns {Array} Flat array of ingredient items
 */
function resolveIngredientArray(ingredients) {
  if (Array.isArray(ingredients)) return ingredients;

  const keys = Object.keys(ingredients || {});
  const baseTier = keys.find((k) => k.includes('2-3')) || keys[0];
  if (!baseTier) return [];

  const value = ingredients[baseTier];
  return Array.isArray(value) ? value : [];
}

/**
 * Generates a deterministic SHA-256 fingerprint for a recipe.
 *
 * @param {Object} recipe - Recipe with `ingredients` and `steps`
 * @param {Array|Object} recipe.ingredients - Flat array or tiered object of { name, quantity }
 * @param {Array} recipe.steps - Array of cooking steps
 * @returns {string} Hex-encoded SHA-256 hash (64 characters)
 *
 * @example
 * const fp = generateRecipeFingerprint({
 *   ingredients: { "2-3 servings": [{ name: "Chicken", quantity: "500g" }] },
 *   steps: [{ title: "Marinate", description: "..." }]
 * });
 * // Returns: "a1b2c3d4e5f6..." (64-char hex string)
 */
function generateRecipeFingerprint(recipe) {
  const items = resolveIngredientArray(recipe.ingredients);

  const names = items
    .map(extractIngredientName)
    .filter((n) => n.length > 0);

  const uniqueNames = [...new Set(names)].sort();
  const stepCount = Array.isArray(recipe.steps) ? recipe.steps.length : 0;
  const input = uniqueNames.join('|') + '|' + stepCount;

  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Returns the raw pre-hash input string (for debugging/logging).
 *
 * @param {Object} recipe - Recipe with `ingredients` and `steps`
 * @returns {string} The raw input string before hashing
 */
function getFingerprintInput(recipe) {
  const items = resolveIngredientArray(recipe.ingredients);
  const names = items
    .map(extractIngredientName)
    .filter((n) => n.length > 0);
  const uniqueNames = [...new Set(names)].sort();
  const stepCount = Array.isArray(recipe.steps) ? recipe.steps.length : 0;
  return uniqueNames.join('|') + '|' + stepCount;
}

module.exports = { generateRecipeFingerprint, getFingerprintInput };
