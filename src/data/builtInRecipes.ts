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
