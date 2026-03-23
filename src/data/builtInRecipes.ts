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
    // Nutrition = whole "2-3 servings" batch (÷ 2.5 = per serving)
    nutrition: {
      calories: 700,       // 280 per serving × 2.5
      proteinG: 100,       // 40 per serving × 2.5
      fatG: 25,            // 10 per serving × 2.5
      carbsG: 13,          // 5 per serving × 2.5
      fiberG: 3,           // 1 per serving × 2.5
      sugarG: 3,           // 1 per serving × 2.5
      sodiumMg: 1050,      // 420 per serving × 2.5
      cholesterolMg: 275,  // 110 per serving × 2.5
      saturatedFatG: 5,    // 2 per serving × 2.5
      ironMg: 8,           // 3 per serving × 2.5
      calciumMg: 100,      // 40 per serving × 2.5
    },
    gradient: ['#5D1E0F', '#C0392B'],
    chefTip: '100g protein | 700 kcal per batch (2-3 servings) | 30 min cook. Dry roasting and grinding your own pepper-fennel-cumin blend is what makes this recipe special — the freshly ground masala has unbeatable aroma.',
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
  {
    id: 'spicestrong-high-protein-paneer-masala',
    name: 'Healthy Paneer Masala',
    proteinId: 'paneer',
    proteinName: 'Paneer',
    proteinEmoji: '🧀',
    description: 'A lighter paneer masala made with low-fat Greek yogurt and blended cottage cheese instead of cream, fresh tomatoes, and colorful bell peppers. Rich, creamy, high-protein curry with authentic Indian flavor.',
    mealType: 'lunch_dinner',
    timeMinutes: 22,
    difficulty: 'Easy',
    proteinPer100g: 18,
    caloriesPerServing: 340,
    proteinGPerServing: 30,
    netCarbsG: 7,
    // Nutrition = whole "2-3 servings" batch (~340 kcal × 3 servings)
    nutrition: {
      calories: 1020,
      proteinG: 90,
      fatG: 57,
      carbsG: 36,
      fiberG: 5,
      sugarG: 12,
      sodiumMg: 1200,
    },
    gradient: ['#D4A017', '#C0392B'],
    chefTip: '90g protein | 1020 kcal per batch (2-3 servings) | 22 min cook. Using Greek yogurt and cottage cheese instead of cream keeps it high-protein and fitness friendly.',
    createdAt: Date.now(),
    ingredients: {
      '2-3 servings': [
        { name: 'Paneer (prefer low-fat)', quantity: '250 g' },
        { name: 'Low-fat Greek Yogurt', quantity: '¾ cup' },
        { name: 'Low-fat Cottage Cheese (blended smooth)', quantity: '½ cup' },
        { name: 'Onion (Finely Chopped)', quantity: '1 Medium' },
        { name: 'Fresh Tomatoes (Finely Chopped)', quantity: '2 Medium' },
        { name: 'Red Bell Pepper (Diced)', quantity: '½' },
        { name: 'Green Bell Pepper (Diced)', quantity: '½' },
        { name: 'Yellow Bell Pepper (Diced)', quantity: '½' },
        { name: 'Ginger Garlic Paste', quantity: '1 tbsp' },
        { name: 'Kashmiri Chili Powder', quantity: '1 tsp' },
        { name: 'Turmeric Powder', quantity: '¼ tsp' },
        { name: 'Coriander Powder', quantity: '1 tsp' },
        { name: 'Garam Masala', quantity: '½ tsp' },
        { name: 'Cumin Seeds', quantity: '½ tsp' },
        { name: 'Kasuri Methi (Crushed)', quantity: '½ tsp' },
        { name: 'Cooking Oil (Olive/Avocado)', quantity: '1 tbsp' },
        { name: 'Salt', quantity: '¾ tsp' },
        { name: 'Black Pepper', quantity: '¼ tsp' },
        { name: 'Fresh Cilantro (Garnish)', quantity: '2 tbsp' },
      ],
      '4-6 servings': [
        { name: 'Paneer (prefer low-fat)', quantity: '500 g' },
        { name: 'Low-fat Greek Yogurt', quantity: '1½ cups' },
        { name: 'Low-fat Cottage Cheese (blended smooth)', quantity: '1 cup' },
        { name: 'Onion (Finely Chopped)', quantity: '2 Medium' },
        { name: 'Fresh Tomatoes (Finely Chopped)', quantity: '4 Medium' },
        { name: 'Red Bell Pepper (Diced)', quantity: '1' },
        { name: 'Green Bell Pepper (Diced)', quantity: '1' },
        { name: 'Yellow Bell Pepper (Diced)', quantity: '1' },
        { name: 'Ginger Garlic Paste', quantity: '2 tbsp' },
        { name: 'Kashmiri Chili Powder', quantity: '2 tsp' },
        { name: 'Turmeric Powder', quantity: '½ tsp' },
        { name: 'Coriander Powder', quantity: '2 tsp' },
        { name: 'Garam Masala', quantity: '1 tsp' },
        { name: 'Cumin Seeds', quantity: '1 tsp' },
        { name: 'Kasuri Methi (Crushed)', quantity: '1 tsp' },
        { name: 'Cooking Oil (Olive/Avocado)', quantity: '2 tbsp' },
        { name: 'Salt', quantity: '1½ tsp' },
        { name: 'Black Pepper', quantity: '½ tsp' },
        { name: 'Fresh Cilantro (Garnish)', quantity: '4 tbsp' },
      ],
    },
    steps: [
      {
        title: 'Prepare Paneer',
        description: 'Cut paneer into medium cubes. If paneer feels firm, soak it in warm water for about 5 minutes to soften.',
        emoji: '🧀',
        tip: 'Soaking in warm water keeps paneer soft and juicy throughout cooking.',
      },
      {
        title: 'Cook Aromatics',
        description: 'Heat oil in a pan over medium heat. Add cumin seeds and chopped onions. Cook until onions turn light golden. Add ginger garlic paste and sauté briefly.',
        emoji: '🧅',
        timerMinutes: 5,
        tip: 'Light golden onions give a smoother gravy.',
      },
      {
        title: 'Cook Fresh Tomatoes',
        description: 'Add chopped tomatoes, chili powder, turmeric, coriander powder, and salt. Cook until tomatoes soften and the mixture thickens.',
        emoji: '🍅',
        timerMinutes: 7,
        tip: 'Cook until tomatoes lose their raw smell for the best flavor.',
      },
      {
        title: 'Add Bell Peppers',
        description: 'Add diced red, green, and yellow bell peppers. Cook briefly so they remain slightly crisp.',
        emoji: '🌶️',
        timerMinutes: 3,
        tip: 'Do not overcook peppers; they should keep some crunch.',
      },
      {
        title: 'Add Yogurt & Protein Boost',
        description: 'Lower the heat. Add whisked Greek yogurt and blended cottage cheese. Stir continuously until the gravy becomes smooth and creamy.',
        emoji: '🥣',
        tip: 'Blend cottage cheese with 1-2 tbsp water before adding for a silky texture.',
      },
      {
        title: 'Add Paneer',
        description: 'Add paneer cubes and gently mix until coated with the sauce. Cook for a few minutes.',
        emoji: '🧀',
        timerMinutes: 4,
        tip: 'Avoid overcooking paneer to keep it soft and pillowy.',
      },
      {
        title: 'Finish the Dish',
        description: 'Add garam masala, crushed kasuri methi, and black pepper. Garnish with fresh cilantro and serve hot.',
        emoji: '🌿',
        tip: 'Crushing kasuri methi between your palms releases maximum aroma.',
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
  'spicestrong-high-protein-paneer-masala': {
    '2-3 servings': [
      {
        emoji: '🧀',
        category: 'PROTEIN & DAIRY',
        items: [
          { name: 'Paneer (prefer low-fat)', quantity: '250 g' },
          { name: 'Low-fat Greek Yogurt', quantity: '¾ cup' },
          { name: 'Low-fat Cottage Cheese (blended smooth)', quantity: '½ cup' },
        ],
      },
      {
        emoji: '🥬',
        category: 'VEGETABLES',
        items: [
          { name: 'Onion (Finely Chopped)', quantity: '1 Medium' },
          { name: 'Fresh Tomatoes (Finely Chopped)', quantity: '2 Medium' },
          { name: 'Red Bell Pepper (Diced)', quantity: '½' },
          { name: 'Green Bell Pepper (Diced)', quantity: '½' },
          { name: 'Yellow Bell Pepper (Diced)', quantity: '½' },
        ],
      },
      {
        emoji: '🌶️',
        category: 'SPICES & SEASONING',
        items: [
          { name: 'Ginger Garlic Paste', quantity: '1 tbsp' },
          { name: 'Kashmiri Chili Powder', quantity: '1 tsp' },
          { name: 'Turmeric Powder', quantity: '¼ tsp' },
          { name: 'Coriander Powder', quantity: '1 tsp' },
          { name: 'Garam Masala', quantity: '½ tsp' },
          { name: 'Cumin Seeds', quantity: '½ tsp' },
          { name: 'Kasuri Methi (Crushed)', quantity: '½ tsp' },
          { name: 'Salt', quantity: '¾ tsp' },
          { name: 'Black Pepper', quantity: '¼ tsp' },
        ],
      },
      {
        emoji: '🍳',
        category: 'OIL & GARNISH',
        items: [
          { name: 'Cooking Oil (Olive/Avocado)', quantity: '1 tbsp' },
          { name: 'Fresh Cilantro (Garnish)', quantity: '2 tbsp' },
        ],
      },
    ],
    '4-6 servings': [
      {
        emoji: '🧀',
        category: 'PROTEIN & DAIRY',
        items: [
          { name: 'Paneer (prefer low-fat)', quantity: '500 g' },
          { name: 'Low-fat Greek Yogurt', quantity: '1½ cups' },
          { name: 'Low-fat Cottage Cheese (blended smooth)', quantity: '1 cup' },
        ],
      },
      {
        emoji: '🥬',
        category: 'VEGETABLES',
        items: [
          { name: 'Onion (Finely Chopped)', quantity: '2 Medium' },
          { name: 'Fresh Tomatoes (Finely Chopped)', quantity: '4 Medium' },
          { name: 'Red Bell Pepper (Diced)', quantity: '1' },
          { name: 'Green Bell Pepper (Diced)', quantity: '1' },
          { name: 'Yellow Bell Pepper (Diced)', quantity: '1' },
        ],
      },
      {
        emoji: '🌶️',
        category: 'SPICES & SEASONING',
        items: [
          { name: 'Ginger Garlic Paste', quantity: '2 tbsp' },
          { name: 'Kashmiri Chili Powder', quantity: '2 tsp' },
          { name: 'Turmeric Powder', quantity: '½ tsp' },
          { name: 'Coriander Powder', quantity: '2 tsp' },
          { name: 'Garam Masala', quantity: '1 tsp' },
          { name: 'Cumin Seeds', quantity: '1 tsp' },
          { name: 'Kasuri Methi (Crushed)', quantity: '1 tsp' },
          { name: 'Salt', quantity: '1½ tsp' },
          { name: 'Black Pepper', quantity: '½ tsp' },
        ],
      },
      {
        emoji: '🍳',
        category: 'OIL & GARNISH',
        items: [
          { name: 'Cooking Oil (Olive/Avocado)', quantity: '2 tbsp' },
          { name: 'Fresh Cilantro (Garnish)', quantity: '4 tbsp' },
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
