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
    description: 'High-Protein • Low-Carb • Gluten Free • Authentic South Indian',
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
        { name: 'Red Onion (Finely Chopped)', quantity: '1 Large' },
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
        { name: 'Red Onion (Finely Chopped)', quantity: '2 Large' },
        { name: 'Whole Black Pepper', quantity: '2 tsp' },
        { name: 'Fennel Seeds', quantity: '2.5 tsp' },
        { name: 'Cumin Seeds', quantity: '2 tsp' },
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
    id: 'pepper-chicken',
    name: 'Healthy Pepper Chicken Fry',
    proteinId: 'chicken',
    proteinName: 'Chicken',
    proteinEmoji: '🍗',
    description: 'High-Protein • Low-Carb • Gluten Free • Quick & Easy',
    mealType: 'lunch_dinner',
    timeMinutes: 40,
    difficulty: 'Easy',
    proteinPer100g: 38,
    caloriesPerServing: 310,
    proteinGPerServing: 38,
    netCarbsG: 6,
    nutrition: {
      calories: 310,
      proteinG: 38,
      fatG: 12,
      carbsG: 9,
      fiberG: 3,
      sugarG: 3,
      sodiumMg: 480,
      cholesterolMg: 120,
      saturatedFatG: 4,
      ironMg: 2,
      calciumMg: 35,
    },
    gradient: ['#8B4513', '#D2691E'],
    chefTip: '38g protein | 310 kcal | 25 min cook. Freshly crushed black pepper is the star spice — use a mortar & pestle or pepper mill for best results.',
    createdAt: Date.now(),
    ingredients: {
      '2-3 servings': [
        { name: 'Boneless chicken, cut into 2" pieces', quantity: '500 g' },
        { name: 'Lemon juice', quantity: '1 tbsp' },
        { name: 'Salt', quantity: '½ tsp' },
        { name: 'Freshly crushed black pepper ★', quantity: '1½ tsp' },
        { name: 'Cumin powder', quantity: '1 tsp' },
        { name: 'Turmeric powder', quantity: '½ tsp' },
        { name: 'Red chilli flakes (optional)', quantity: '½ tsp' },
        { name: 'Garam masala', quantity: '¼ tsp' },
        { name: 'Coriander powder', quantity: '½ tsp' },
        { name: 'Coconut oil or olive oil', quantity: '1 tbsp' },
        { name: 'Cumin seeds', quantity: '1 tsp' },
        { name: 'Onion, thinly sliced', quantity: '1 large' },
        { name: 'Ginger-garlic paste', quantity: '1 tbsp' },
        { name: 'Green bell pepper, sliced', quantity: '1 medium' },
        { name: 'Green chillies, slit (optional)', quantity: '2' },
        { name: 'Curry leaves', quantity: '8–10' },
        { name: 'Salt', quantity: 'To taste' },
        { name: 'Fresh coriander leaves, chopped', quantity: '2 tbsp' },
        { name: 'Extra crushed black pepper', quantity: '½ tsp' },
        { name: 'Lemon wedges', quantity: 'To serve' },
      ],
      '4-6 servings': [
        { name: 'Boneless chicken, cut into 2" pieces', quantity: '1 kg' },
        { name: 'Lemon juice', quantity: '2 tbsp' },
        { name: 'Salt', quantity: '1 tsp' },
        { name: 'Freshly crushed black pepper ★', quantity: '1 tbsp' },
        { name: 'Cumin powder', quantity: '2 tsp' },
        { name: 'Turmeric powder', quantity: '1 tsp' },
        { name: 'Red chilli flakes (optional)', quantity: '1 tsp' },
        { name: 'Garam masala', quantity: '½ tsp' },
        { name: 'Coriander powder', quantity: '1 tsp' },
        { name: 'Coconut oil or olive oil', quantity: '1½ tbsp' },
        { name: 'Cumin seeds', quantity: '1½ tsp' },
        { name: 'Onion, thinly sliced', quantity: '2 large' },
        { name: 'Ginger-garlic paste', quantity: '2 tbsp' },
        { name: 'Green bell pepper, sliced', quantity: '2 medium' },
        { name: 'Green chillies, slit (optional)', quantity: '4' },
        { name: 'Curry leaves', quantity: '15–18' },
        { name: 'Salt', quantity: 'To taste' },
        { name: 'Fresh coriander leaves, chopped', quantity: '4 tbsp' },
        { name: 'Extra crushed black pepper', quantity: '1 tsp' },
        { name: 'Lemon wedges', quantity: 'To serve' },
      ],
    },
    steps: [
      {
        title: 'Marinate the Chicken',
        description: 'Mix the chicken pieces with lemon juice, salt, turmeric, and half the crushed black pepper. Let it sit and marinate for 15–30 minutes.',
        emoji: '🥣',
        timerMinutes: 15,
        tip: 'Marinating longer (up to 30 min) gives deeper flavor.',
      },
      {
        title: 'Mix the Spice Blend',
        description: 'In a small bowl, combine cumin powder, coriander powder, red chilli flakes, garam masala, and the remaining crushed black pepper. Keep this spice mix aside.',
        emoji: '🌶️',
      },
      {
        title: 'Sear the Chicken',
        description: 'Heat a skillet on high heat with a drizzle of oil. Sear the marinated chicken until golden brown on each side, about 3–4 minutes per side. Remove and set aside.',
        emoji: '🔥',
        timerMinutes: 8,
        tip: 'Don\'t overcrowd the pan — sear in batches for the best crust.',
      },
      {
        title: 'Sauté Onions & Aromatics',
        description: 'In the same pan, add oil, cumin seeds, and sliced onions. Sauté until the onions are golden and caramelized, about 3–4 minutes. Add ginger-garlic paste and cook for 1 minute.',
        emoji: '🧅',
        timerMinutes: 5,
      },
      {
        title: 'Add Bell Pepper & Spices',
        description: 'Add sliced green bell pepper, curry leaves, and green chillies. Toss with the spice mix and sauté for 1–2 minutes, keeping the bell pepper nicely crunchy.',
        emoji: '🫑',
        timerMinutes: 2,
      },
      {
        title: 'Toss the Chicken Back',
        description: 'Return the seared chicken to the skillet. Toss everything together on high heat for 2–3 minutes until the chicken is coated with spices and cooked through internally (75°C / 165°F).',
        emoji: '🍳',
        timerMinutes: 3,
        tip: 'High heat at this stage keeps everything crispy.',
      },
      {
        title: 'Plate & Garnish',
        description: 'Transfer to a serving plate. Squeeze fresh lemon juice, sprinkle chopped coriander and extra crushed black pepper on top. Serve hot!',
        emoji: '🍋',
        tip: 'A final squeeze of lemon right before serving brightens all the flavors.',
      },
    ],
  },
];

/** Grouped ingredients by recipe ID — used for the "You\'ll need" section in cooking mode. */
export const BUILTIN_INGREDIENT_GROUPS: Record<string, IngredientGroup[]> = {
  'spicestrong-pepper-chicken': [
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
        { name: 'Red Onion (Finely Chopped)', quantity: '1 Large' },
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
  'pepper-chicken': [
    {
      emoji: '🍗',
      category: 'FOR THE CHICKEN',
      items: [
        { name: 'Boneless chicken', quantity: '500 g' },
        { name: 'Lemon juice', quantity: '1 tbsp' },
        { name: 'Salt', quantity: '½ tsp' },
      ],
    },
    {
      emoji: '🌶️',
      category: 'SPICE MIX',
      items: [
        { name: 'Crushed black pepper ★', quantity: '1½ tsp' },
        { name: 'Cumin powder', quantity: '1 tsp' },
        { name: 'Turmeric powder', quantity: '½ tsp' },
        { name: 'Red chilli flakes', quantity: '½ tsp' },
        { name: 'Garam masala', quantity: '¼ tsp' },
        { name: 'Coriander powder', quantity: '½ tsp' },
      ],
    },
    {
      emoji: '🍳',
      category: 'FOR THE STIR-FRY',
      items: [
        { name: 'Coconut/olive oil', quantity: '1 tbsp' },
        { name: 'Cumin seeds', quantity: '1 tsp' },
        { name: 'Onion, sliced', quantity: '1 large' },
        { name: 'Ginger-garlic paste', quantity: '1 tbsp' },
        { name: 'Green bell pepper', quantity: '1 medium' },
        { name: 'Green chillies', quantity: '2' },
        { name: 'Curry leaves', quantity: '8–10' },
      ],
    },
    {
      emoji: '🌿',
      category: 'GARNISH',
      items: [
        { name: 'Fresh coriander', quantity: '2 tbsp' },
        { name: 'Crushed black pepper', quantity: '½ tsp' },
        { name: 'Lemon wedges', quantity: 'To serve' },
      ],
    },
  ],
};

/** Get a built-in recipe by ID. */
export function getBuiltInRecipeById(recipeId: string): BuiltInRecipe | null {
  return BUILTIN_RECIPES.find((r) => r.id === recipeId) ?? null;
}

/** Get all built-in recipes for a given protein. */
export function getBuiltInRecipesForProtein(proteinId: string): BuiltInRecipe[] {
  return BUILTIN_RECIPES.filter((r) => r.proteinId === proteinId);
}
