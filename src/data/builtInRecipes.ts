/**
 * Built-in Hero recipes for SpiceStrong.
 * Add new curated recipes here with full ingredient data for both serving tiers.
 */
import { type SavedRecipe, type IngredientGroup } from '../store/recipes';

/** Nutrition info per serving. */
export interface NutritionInfo {
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  cholesterolMg?: number;
  saturatedFatG?: number;
  ironMg?: number;
  calciumMg?: number;
}

/** Extended recipe type with display metadata for built-in recipes. */
export interface BuiltInRecipe extends SavedRecipe {
  timeMinutes: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  proteinPer100g: number;
  gradient: readonly [string, string];
  caloriesPerServing?: number;
  proteinGPerServing?: number;
  netCarbsG?: number;
  /** Complete nutrition breakdown per serving */
  nutrition?: NutritionInfo;
}

/** All built-in recipes. */
export const BUILTIN_RECIPES: BuiltInRecipe[] = [
  {
    id: 'spicestrong-pepper-chicken',
    name: 'SpiceStrong Pepper Chicken',
    proteinId: 'chicken',
    proteinName: 'Chicken',
    proteinEmoji: '🍗',
    description: 'A healthy, protein-rich pepper chicken cooked with roasted spices for deep flavor without heavy sauces.',
    mealType: 'lunch_dinner',
    timeMinutes: 30,
    difficulty: 'Easy',
    proteinPer100g: 31,
    caloriesPerServing: 280,
    proteinGPerServing: 40,
    netCarbsG: 4,
    nutrition: {
      calories: 280,
      proteinG: 40,
      fatG: 10,
      carbsG: 5,
      fiberG: 1,
      sugarG: 1,
      sodiumMg: 420,
      cholesterolMg: 110,
      saturatedFatG: 2,
      ironMg: 3,
      calciumMg: 40,
    },
    gradient: ['#5D1E0F', '#C0392B'],
    chefTip: '40g protein | 280 kcal | 30 min cook. Dry roasting and grinding your own pepper-fennel-cumin blend is what makes this recipe special — the freshly ground masala has unbeatable aroma.',
    createdAt: Date.now(),
    ingredients: {
      '2-3 servings': [
        { name: 'Chicken (Boneless/Breast)', quantity: '500 g' },
        { name: 'Red Onion (Finely Chopped)', quantity: '1 Medium' },
        { name: 'Whole Black Pepper', quantity: '1 tsp' },
        { name: 'Fennel Seeds', quantity: '1.25 tsp' },
        { name: 'Cumin Seeds', quantity: '1 tsp' },
        { name: 'Ginger-Garlic Paste', quantity: '1 tsp' },
        { name: 'Gingelly Oil (or Olive Oil)', quantity: '2 tbsp' },
        { name: 'Curry Leaves', quantity: '1 Sprig' },
        { name: 'Turmeric Powder', quantity: '¼ tsp' },
        { name: 'Garam Masala', quantity: '½ tsp' },
        { name: 'Salt', quantity: 'To taste' },
      ],
      '4-6 servings': [
        { name: 'Chicken (Boneless/Breast)', quantity: '1 kg' },
        { name: 'Red Onion (Finely Chopped)', quantity: '1 Large' },
        { name: 'Whole Black Pepper', quantity: '1.5 tsp' },
        { name: 'Fennel Seeds', quantity: '2 tsp' },
        { name: 'Cumin Seeds', quantity: '1.5 tsp' },
        { name: 'Ginger-Garlic Paste', quantity: '2 tsp' },
        { name: 'Gingelly Oil (or Olive Oil)', quantity: '4 tbsp' },
        { name: 'Curry Leaves', quantity: '2 Sprigs' },
        { name: 'Turmeric Powder', quantity: '½ tsp' },
        { name: 'Garam Masala', quantity: '1 tsp' },
        { name: 'Salt', quantity: 'To taste' },
      ],
    },
    steps: [
      {
        title: 'Dry Roast & Grind Spices',
        description: 'Dry roast 1 tsp pepper, 1 tsp fennel, and 1 tsp cumin on low flame. Grind into a fine powder once cooled.',
        emoji: '🌶️',
        timerMinutes: 2,
        tip: 'Do not burn the spices; keep the heat low for maximum aroma.',
      },
      {
        title: 'Sauté Aromatics',
        description: 'Heat oil. Sauté ¼ tsp fennel, chopped onions, and curry leaves until translucent.',
        emoji: '🧅',
        timerMinutes: 3,
        tip: 'Use red onions for a sweeter, deeper flavor profile.',
      },
      {
        title: 'Add Spice Paste',
        description: 'Stir in ginger-garlic paste, turmeric, and garam masala. Sauté until raw smell is gone.',
        emoji: '🫚',
        timerMinutes: 2,
        tip: 'Adding a splash of water prevents the dry spices from burning.',
      },
      {
        title: 'Cook the Chicken',
        description: 'Add chicken pieces and sauté well. Add a splash of water and salt. Cover and cook on low flame.',
        emoji: '🍗',
        timerMinutes: 20,
        tip: 'Use chicken breast to keep the recipe high-protein and lean.',
      },
      {
        title: 'Add Masala Powder',
        description: 'Add the prepared pepper masala powder. Mix well and cook uncovered until dry.',
        emoji: '🔥',
        timerMinutes: 3,
        tip: 'For a "dry" style, cook until all moisture evaporates and coats the chicken.',
      },
      {
        title: 'Garnish & Serve',
        description: 'Garnish with fresh coriander and extra curry leaves before serving.',
        emoji: '🌿',
        tip: 'Fresh leaves at the end provide a burst of color and freshness.',
      },
    ],
  },
];

/** Grouped ingredients by recipe ID — used for the "You\'ll need" section in cooking mode. */
export const BUILTIN_INGREDIENT_GROUPS: Record<string, Record<string, IngredientGroup[]>> = {
  'spicestrong-pepper-chicken': {
    '2-3 servings': [
      {
        emoji: '🍗',
        category: 'PROTEIN',
        items: [
          { name: 'Chicken (Boneless/Breast)', quantity: '500 g' },
          { name: 'Salt', quantity: 'To taste' },
        ],
      },
      {
        emoji: '🌶️',
        category: 'DRY ROAST SPICES',
        items: [
          { name: 'Whole Black Pepper', quantity: '1 tsp' },
          { name: 'Fennel Seeds', quantity: '1.25 tsp' },
          { name: 'Cumin Seeds', quantity: '1 tsp' },
        ],
      },
      {
        emoji: '🍳',
        category: 'FOR THE COOK',
        items: [
          { name: 'Gingelly Oil (or Olive Oil)', quantity: '2 tbsp' },
          { name: 'Red Onion (Finely Chopped)', quantity: '1 Medium' },
          { name: 'Curry Leaves', quantity: '1 Sprig' },
          { name: 'Ginger-Garlic Paste', quantity: '1 tsp' },
          { name: 'Turmeric Powder', quantity: '¼ tsp' },
          { name: 'Garam Masala', quantity: '½ tsp' },
        ],
      },
      {
        emoji: '🌿',
        category: 'GARNISH',
        items: [
          { name: 'Fresh Coriander', quantity: 'A handful' },
          { name: 'Curry Leaves', quantity: 'Extra' },
        ],
      },
    ],
    '4-6 servings': [
      {
        emoji: '🍗',
        category: 'PROTEIN',
        items: [
          { name: 'Chicken (Boneless/Breast)', quantity: '1 kg' },
          { name: 'Salt', quantity: 'To taste' },
        ],
      },
      {
        emoji: '🌶️',
        category: 'DRY ROAST SPICES',
        items: [
          { name: 'Whole Black Pepper', quantity: '1.5 tsp' },
          { name: 'Fennel Seeds', quantity: '2 tsp' },
          { name: 'Cumin Seeds', quantity: '1.5 tsp' },
        ],
      },
      {
        emoji: '🍳',
        category: 'FOR THE COOK',
        items: [
          { name: 'Gingelly Oil (or Olive Oil)', quantity: '4 tbsp' },
          { name: 'Red Onion (Finely Chopped)', quantity: '1 Large' },
          { name: 'Curry Leaves', quantity: '2 Sprigs' },
          { name: 'Ginger-Garlic Paste', quantity: '2 tsp' },
          { name: 'Turmeric Powder', quantity: '½ tsp' },
          { name: 'Garam Masala', quantity: '1 tsp' },
        ],
      },
      {
        emoji: '🌿',
        category: 'GARNISH',
        items: [
          { name: 'Fresh Coriander', quantity: 'A handful' },
          { name: 'Curry Leaves', quantity: 'Extra' },
        ],
      },
    ],
  },
};

/** Get a built-in recipe by ID. */
export function getBuiltInRecipeById(recipeId: string): BuiltInRecipe | null {
  return BUILTIN_RECIPES.find((r) => r.id === recipeId) ?? null;
}

/** Get all built-in recipes for a given protein. */
export function getBuiltInRecipesForProtein(proteinId: string): BuiltInRecipe[] {
  return BUILTIN_RECIPES.filter((r) => r.proteinId === proteinId);
}
