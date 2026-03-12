import AsyncStorage from '@react-native-async-storage/async-storage';

export const QUANTITY_TIERS = ['1lb', '2lb', '4lb', '8lb'] as const;
export type QuantityTier = (typeof QUANTITY_TIERS)[number];

export type IngredientsByTier = Record<QuantityTier, { name: string; quantity: string }[]>;

/** Grouped ingredients for built-in recipe display (e.g. Butter Chicken). */
export interface IngredientGroup {
  emoji: string;
  category: string;
  items: { name: string; quantity: string }[];
}

/** Optional per-step fields for cooking mode (emoji, timer, tip). */
export interface CookingStep {
  title: string;
  description: string;
  emoji?: string;
  timerMinutes?: number;
  tip?: string;
}

export interface SavedRecipe {
  id: string;
  name: string;
  proteinId: string;
  proteinName: string;
  proteinEmoji: string;
  ingredients: IngredientsByTier;
  steps: CookingStep[];
  chefTip: string;
  createdAt: number;
}

function defaultIngredientsByTier(): IngredientsByTier {
  return { '1lb': [], '2lb': [], '4lb': [], '8lb': [] };
}

function normalizeIngredients(ingredients: unknown): IngredientsByTier {
  const def = defaultIngredientsByTier();
  if (ingredients && typeof ingredients === 'object' && !Array.isArray(ingredients)) {
    const obj = ingredients as Record<string, unknown>;
    (QUANTITY_TIERS as readonly string[]).forEach((tier) => {
      if (Array.isArray(obj[tier])) {
        def[tier as QuantityTier] = (obj[tier] as { name: string; quantity: string }[]).map(
          (item) =>
            item && typeof item === 'object' && 'name' in item
              ? { name: String(item.name ?? ''), quantity: String(item.quantity ?? '') }
              : { name: '', quantity: '' }
        );
      }
    });
    return def;
  }
  if (Array.isArray(ingredients)) {
    def['1lb'] = ingredients.map((item: unknown) =>
      item && typeof item === 'object' && item !== null && 'name' in (item as object)
        ? {
            name: String((item as { name?: string }).name ?? ''),
            quantity: String((item as { quantity?: string }).quantity ?? ''),
          }
        : { name: '', quantity: '' }
    );
    return def;
  }
  return def;
}

const KEY = 'spicestrong_recipes';

export async function getRecipes(): Promise<SavedRecipe[]> {
  try {
    const data = await AsyncStorage.getItem(KEY);
    const raw: unknown[] = data ? JSON.parse(data) : [];
    return raw.map((r: unknown) => {
      const recipe = r as Record<string, unknown>;
      return {
        ...recipe,
        ingredients: normalizeIngredients(recipe.ingredients),
      } as SavedRecipe;
    });
  } catch {
    return [];
  }
}

export async function saveRecipe(recipe: SavedRecipe): Promise<void> {
  try {
    const existing = await getRecipes();
    const index = existing.findIndex((r) => r.id === recipe.id);
    const updated = index >= 0
      ? [...existing.slice(0, index), { ...recipe, ingredients: recipe.ingredients }, ...existing.slice(index + 1)]
      : [...existing, recipe];
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save recipe', e);
  }
}

/** Butter Chicken (1 lb · 2 servings) – full ingredient list by category. */
const BUTTER_CHICKEN_1LB_GROUPS: IngredientGroup[] = [
  {
    emoji: '🥩',
    category: 'PROTEIN',
    items: [{ name: 'Chicken breast (boneless)', quantity: '1 lb' }],
  },
  {
    emoji: '🧈',
    category: 'DAIRY & FATS',
    items: [
      { name: 'Heavy cream', quantity: '½ cup' },
      { name: 'Butter', quantity: '2 tbsp' },
      { name: 'Plain yogurt', quantity: '¼ cup' },
    ],
  },
  {
    emoji: '🧅',
    category: 'AROMATICS',
    items: [
      { name: 'Onion (large), diced', quantity: '1' },
      { name: 'Garlic cloves, minced', quantity: '5' },
      { name: 'Ginger, grated', quantity: '1 inch' },
      { name: 'Tomatoes, pureed', quantity: '2 large' },
    ],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Garam masala', quantity: '1 tsp' },
      { name: 'Kashmiri red chili powder', quantity: '1½ tsp' },
      { name: 'Cumin seeds', quantity: '½ tsp' },
    ],
  },
];

function flattenIngredientGroups(groups: IngredientGroup[]): { name: string; quantity: string }[] {
  return groups.flatMap((g) => g.items);
}

/** Venky's Pepper Chicken (1 lb) – grouped ingredients. */
const PEPPER_CHICKEN_1LB_GROUPS: IngredientGroup[] = [
  { emoji: '🥩', category: 'PROTEIN', items: [{ name: 'Chicken (boneless or bone-in)', quantity: '1 lb' }] },
  {
    emoji: '🧅',
    category: 'AROMATICS',
    items: [
      { name: 'Medium Onion, sliced', quantity: '1' },
      { name: 'Green Chillies (optional)', quantity: '2-3' },
      { name: 'Curry Leaves', quantity: 'a handful' },
      { name: 'Ginger-Garlic Paste', quantity: '1 tbsp' },
    ],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Turmeric Powder', quantity: '½ tsp' },
      { name: 'Garam Masala', quantity: '1 tsp' },
      { name: 'Black Pepper (crushed)', quantity: '1-2 tsp' },
      { name: 'Salt', quantity: 'to taste' },
    ],
  },
  {
    emoji: '🫙',
    category: 'OILS & EXTRAS',
    items: [
      { name: 'Oil', quantity: '2-3 tbsp' },
      { name: 'Lemon Juice (optional)', quantity: '1-2 tsp' },
      { name: 'Fresh Coriander (garnish)', quantity: 'handful' },
    ],
  },
];

/** Pepper Shrimp Fry (1 lb) – grouped ingredients. */
const PEPPER_SHRIMP_FRY_1LB_GROUPS: IngredientGroup[] = [
  {
    emoji: '🦐',
    category: 'PROTEIN',
    items: [{ name: 'Shrimp, peeled and deveined', quantity: '500g (1 lb)' }],
  },
  {
    emoji: '🧅',
    category: 'AROMATICS',
    items: [
      { name: 'Onions, sliced', quantity: '2' },
      { name: 'Curry Leaves', quantity: '2 sprigs' },
      { name: 'Green Chillies, slit', quantity: '3' },
      { name: 'Ginger-Garlic Paste', quantity: '1 tsp' },
    ],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Turmeric Powder', quantity: '¼ tsp' },
      { name: 'Coriander Seeds', quantity: '1 tbsp' },
      { name: 'Garam Masala', quantity: '½ tsp' },
      { name: 'Fennel Seeds', quantity: '1 tsp' },
      { name: 'Black Peppercorns (for roasting)', quantity: '1 tsp' },
      { name: 'Salt', quantity: 'to taste' },
    ],
  },
  {
    emoji: '🫙',
    category: 'OILS & EXTRAS',
    items: [
      { name: 'Oil', quantity: '2 tbsp' },
      { name: 'Fresh Coriander (garnish)', quantity: 'handful' },
    ],
  },
];

/** Healthy Paneer Stir Fry (1 lb) – grouped ingredients. */
const HEALTHY_PANEER_STIR_FRY_1LB_GROUPS: IngredientGroup[] = [
  {
    emoji: '🧀',
    category: 'PROTEIN',
    items: [{ name: 'Paneer, cubed', quantity: '250g (9 oz)' }],
  },
  {
    emoji: '🥦',
    category: 'VEGETABLES',
    items: [
      { name: 'Onions, sliced', quantity: '2' },
      { name: 'Tomato, chopped', quantity: '1' },
      { name: 'Capsicum (Bell Pepper)', quantity: '½ cup' },
    ],
  },
  {
    emoji: '🥛',
    category: 'DAIRY & EXTRAS',
    items: [
      { name: 'Low-Fat Yogurt', quantity: '⅓ cup' },
      { name: 'Water', quantity: '¼ cup' },
      { name: 'Olive Oil or Ghee', quantity: '1-2 tbsp' },
    ],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Ginger-Garlic Paste', quantity: '1 tbsp' },
      { name: 'Turmeric Powder', quantity: '½ tsp' },
      { name: 'Cumin Seeds', quantity: '1 tsp' },
      { name: 'Coriander Powder', quantity: '1 tsp' },
      { name: 'Red Chili Powder', quantity: '½ tsp (adjust to taste)' },
      { name: 'Salt & Lemon Juice', quantity: 'to taste' },
      { name: 'Fresh Coriander (garnish)', quantity: 'optional' },
    ],
  },
];

/** Fried Masala Tofu (1 lb) – grouped ingredients. */
const FRIED_MASALA_TOFU_1LB_GROUPS: IngredientGroup[] = [
  {
    emoji: '🟫',
    category: 'PROTEIN',
    items: [{ name: 'Firm/Extra Firm Tofu', quantity: '1 lb (454g)' }],
  },
  {
    emoji: '🥛',
    category: 'MARINADE',
    items: [
      { name: 'Plain Unflavored Yogurt', quantity: '1 heaped tbsp' },
      { name: 'Almond Flour or Gram Flour (Besan) or Cornstarch', quantity: '1½ tsp' },
      { name: 'Oil (for mixing)', quantity: '1 tsp' },
    ],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Curry Powder', quantity: '2 tsp' },
      { name: 'Kashmiri Red Chilli Powder', quantity: '1 tsp (adjust to taste)' },
      { name: 'Turmeric Powder', quantity: '½ tsp' },
      { name: 'Garam Masala', quantity: '¼ tsp' },
      { name: 'Salt', quantity: 'to taste (just under 1 tsp)' },
      { name: 'Sugar/Honey/Maple Syrup', quantity: '¼ tsp (optional)' },
    ],
  },
  {
    emoji: '🍳',
    category: 'COOKING',
    items: [
      { name: 'Oil (for frying)', quantity: '1 tbsp' },
      { name: 'Fresh Coriander (garnish)', quantity: 'handful' },
      { name: 'Lemon Juice', quantity: 'few drops (optional)' },
    ],
  },
];

/** Indian Tikka Bites (1 lb) – grouped ingredients. */
const INDIAN_TIKKA_BITES_1LB_GROUPS: IngredientGroup[] = [
  { emoji: '🥩', category: 'PROTEIN', items: [{ name: 'Chicken Thighs or Breast', quantity: '1 lb' }] },
  {
    emoji: '🥛',
    category: 'MARINADE',
    items: [
      { name: 'Full-Fat Greek Yogurt', quantity: '½ cup' },
      { name: 'Minced Garlic', quantity: '3-4 cloves' },
      { name: 'Minced Ginger', quantity: '2 tsp' },
      { name: 'Cilantro', quantity: '¼ cup' },
      { name: 'Lemon', quantity: '1' },
    ],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Salt', quantity: '1 tsp' },
      { name: 'Garam Masala', quantity: '1 tsp' },
      { name: 'Turmeric', quantity: '½ tsp' },
      { name: 'Ground Cumin', quantity: '½ tsp' },
      { name: 'Ground Coriander', quantity: '½ tsp' },
      { name: 'Smoked Paprika', quantity: '½ tsp' },
      { name: 'Cayenne Pepper', quantity: '¼ tsp (adjust to taste)' },
    ],
  },
  { emoji: '🧈', category: 'COOKING FATS', items: [{ name: 'Ghee', quantity: '2 tbsp' }] },
];

/** Goan Pork Vindaloo (1 lb) – grouped ingredients. */
const GOAN_PORK_VINDALOO_1LB_GROUPS: IngredientGroup[] = [
  { emoji: '🥩', category: 'PROTEIN', items: [{ name: 'Pork (shoulder or leg), cubed', quantity: '1 lb' }] },
  { emoji: '🧅', category: 'AROMATICS', items: [{ name: 'Onions, garlic, ginger', quantity: 'as needed' }] },
  { emoji: '🌶️', category: 'SPICES', items: [{ name: 'Vindaloo masala, vinegar', quantity: 'as per recipe' }] },
];

/** Pork Pepper Fry (1 lb) – grouped ingredients. */
const PORK_PEPPER_FRY_1LB_GROUPS: IngredientGroup[] = [
  { emoji: '🥩', category: 'PROTEIN', items: [{ name: 'Pork, cubed', quantity: '1 lb' }] },
  { emoji: '🧅', category: 'AROMATICS', items: [{ name: 'Onions, curry leaves, ginger-garlic', quantity: 'as needed' }] },
  { emoji: '🌶️', category: 'SPICES', items: [{ name: 'Black pepper, turmeric, garam masala', quantity: 'as per recipe' }] },
];

/** Indian Pork Curry (1 lb) – grouped ingredients. */
const INDIAN_PORK_CURRY_1LB_GROUPS: IngredientGroup[] = [
  { emoji: '🥩', category: 'PROTEIN', items: [{ name: 'Pork shoulder or leg, cut into 1-2 inch cubes', quantity: '1 lb' }] },
  {
    emoji: '🧅',
    category: 'AROMATICS',
    items: [
      { name: 'Onions, chopped', quantity: '½ cup' },
      { name: 'Garlic, minced', quantity: '3 cloves' },
      { name: 'Ginger, grated', quantity: '1 inch' },
    ],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Turmeric', quantity: '½ tsp' },
      { name: 'Coriander Powder', quantity: '1 tbsp' },
      { name: 'Garam Masala', quantity: '1 tbsp' },
      { name: 'Red Chili Powder', quantity: '1 tsp' },
      { name: 'Salt', quantity: 'to taste' },
    ],
  },
  {
    emoji: '🍅',
    category: 'BASE & LIQUID',
    items: [
      { name: 'Canned Tomatoes or Passata', quantity: '1 cup' },
      { name: 'Water', quantity: '½ cup (add more if needed)' },
    ],
  },
  {
    emoji: '🧈',
    category: 'FAT & OPTIONALS',
    items: [
      { name: 'Oil or Ghee', quantity: '2 tbsp' },
      { name: 'Bay Leaves (optional)', quantity: '2' },
      { name: 'Cinnamon Stick (optional)', quantity: '1 inch' },
      { name: 'Fennel Seeds (optional)', quantity: '1 tsp' },
      { name: 'Fresh Coriander (garnish)', quantity: 'handful' },
    ],
  },
];

/** Healthy Lamb Curry (1 lb) – grouped ingredients. */
const HEALTHY_LAMB_CURRY_1LB_GROUPS: IngredientGroup[] = [
  {
    emoji: '🥩',
    category: 'PROTEIN',
    items: [{ name: 'Lamb meat, cubed', quantity: '1 lb' }],
  },
  {
    emoji: '🧅',
    category: 'AROMATICS',
    items: [
      { name: 'Large Onion, chopped', quantity: '1' },
      { name: 'Garlic cloves, crushed and chopped', quantity: '2' },
      { name: 'Ginger, grated', quantity: '1 tsp' },
      { name: 'Green Chilli, halved lengthwise', quantity: '1' },
      { name: 'Curry Leaves (fresh, frozen or dry)', quantity: '8-10' },
    ],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Curry Powder', quantity: '3 tbsp' },
      { name: 'Turmeric Powder', quantity: '1 tsp' },
      { name: 'Cumin Powder', quantity: '1 tsp' },
      { name: 'Garam Masala', quantity: '½ tbsp' },
      { name: 'Mixed Seeds', quantity: '½ tsp' },
      { name: 'Black/Mixed Pepper', quantity: '¼ tsp freshly ground' },
      { name: 'Salt', quantity: '1 tsp' },
    ],
  },
  {
    emoji: '🍅',
    category: 'BASE & LIQUID',
    items: [
      { name: 'Chopped Tomato (canned)', quantity: '1 can' },
      { name: 'Tomato Puree', quantity: '⅔ tbsp' },
      { name: 'Lemon Juice', quantity: '½ lemon' },
      { name: 'Water', quantity: '100-200ml (adjust for desired consistency)' },
    ],
  },
];

/** Goat Chops (Mutton Chaap) (1 lb) – grouped ingredients. */
const GOAT_CHOPS_1LB_GROUPS: IngredientGroup[] = [
  {
    emoji: '🥩',
    category: 'PROTEIN',
    items: [{ name: 'Goat Chops (Ribs/Shoulder), cleaned', quantity: '1 lb' }],
  },
  {
    emoji: '🥛',
    category: 'MARINADE',
    items: [
      { name: 'Greek Yogurt or Thick Curd', quantity: '½ cup' },
      { name: 'Ginger-Garlic Paste', quantity: '1 tbsp' },
    ],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Red Chili Powder', quantity: '1 tsp (adjust to taste)' },
      { name: 'Turmeric Powder', quantity: '½ tsp' },
      { name: 'Garam Masala', quantity: '1 tsp' },
      { name: 'Cumin Powder', quantity: '1 tsp' },
      { name: 'Coriander Powder', quantity: '1 tsp' },
      { name: 'Salt', quantity: 'to taste' },
    ],
  },
  {
    emoji: '🧈',
    category: 'COOKING',
    items: [
      { name: 'Oil or Ghee', quantity: '2 tbsp' },
      { name: 'Onion, finely sliced', quantity: '1' },
      { name: 'Green Chili, slit', quantity: '1' },
      { name: 'Water', quantity: '¼ cup' },
      { name: 'Fresh Coriander & Lemon (garnish)', quantity: 'to taste' },
    ],
  },
];

/** Healthy Egg Curry (1 lb tier) – grouped ingredients. */
const HEALTHY_EGG_CURRY_1LB_GROUPS: IngredientGroup[] = [
  {
    emoji: '🥚',
    category: 'PROTEIN',
    items: [{ name: 'Large Hard-Boiled Eggs, peeled', quantity: '4-6' }],
  },
  {
    emoji: '🍅',
    category: 'BASE',
    items: [
      { name: 'Large Onion, finely chopped or pureed', quantity: '1' },
      { name: 'Medium Tomatoes, pureed or finely chopped', quantity: '2' },
    ],
  },
  {
    emoji: '🧅',
    category: 'AROMATICS',
    items: [
      { name: 'Ginger-Garlic Paste', quantity: '1 tbsp' },
      { name: 'Green Chilies, slit', quantity: '1-2' },
      { name: 'Fresh Coriander (garnish)', quantity: 'handful' },
    ],
  },
  {
    emoji: '🫙',
    category: 'HEALTHY FATS',
    items: [
      { name: 'Olive, Canola or Coconut Oil', quantity: '1 tbsp' },
      { name: 'Water', quantity: '1 cup' },
    ],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Cumin Seeds', quantity: '½ tsp' },
      { name: 'Turmeric Powder', quantity: '½ tsp' },
      { name: 'Red Chili Powder (Kashmiri)', quantity: '1 tsp' },
      { name: 'Coriander Powder', quantity: '1 tsp' },
      { name: 'Garam Masala', quantity: '½ tsp' },
      { name: 'Salt', quantity: 'to taste' },
    ],
  },
];

/** Soya Masala (1 lb tier) – grouped ingredients. */
const SOYA_MASALA_1LB_GROUPS: IngredientGroup[] = [
  {
    emoji: '🫘',
    category: 'PROTEIN',
    items: [{ name: 'Soya Chunks (Nutrela or similar)', quantity: '1.5 cups' }],
  },
  {
    emoji: '🧅',
    category: 'BASE',
    items: [
      { name: 'Medium Onions, finely chopped', quantity: '2' },
      { name: 'Medium Tomatoes, finely chopped', quantity: '3' },
      { name: 'Ginger-Garlic Paste', quantity: '1 tbsp' },
    ],
  },
  {
    emoji: '🫙',
    category: 'COOKING',
    items: [
      { name: 'Avocado or Olive Oil', quantity: '1 tbsp' },
      { name: 'Cumin Seeds', quantity: '1 tsp' },
      { name: 'Water', quantity: '1 to 1.5 cups' },
      { name: 'Salt', quantity: 'to taste' },
    ],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Coriander Powder', quantity: '1 tsp' },
      { name: 'Turmeric', quantity: '½ tsp' },
      { name: 'Garam Masala', quantity: '¾ tsp' },
      { name: 'Red Chili Powder', quantity: 'to taste' },
    ],
  },
  {
    emoji: '✨',
    category: 'GARNISH',
    items: [
      { name: 'Fresh Cilantro', quantity: 'handful' },
      { name: 'Lemon Juice', quantity: '1 squeeze' },
    ],
  },
];

/** Rajma Masala (1 lb tier) – grouped ingredients. */
const RAJMA_MASALA_1LB_GROUPS: IngredientGroup[] = [
  {
    emoji: '🫘',
    category: 'PROTEIN',
    items: [
      { name: 'Red Kidney Beans (canned, rinsed)', quantity: '2 cans (15oz each)' },
      { name: 'OR pressure-cooked dry beans', quantity: '2 cups' },
    ],
  },
  {
    emoji: '🧅',
    category: 'BASE',
    items: [
      { name: 'Large Onion, finely diced', quantity: '1' },
      { name: 'Large Tomatoes, pureed or chopped', quantity: '2' },
      { name: 'Ginger-Garlic Paste', quantity: '1 tbsp' },
    ],
  },
  {
    emoji: '🫙',
    category: 'COOKING',
    items: [
      { name: 'Avocado Oil or Ghee', quantity: '1 tbsp' },
      { name: 'Water', quantity: '1.5 cups' },
      { name: 'Salt', quantity: 'to taste' },
    ],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Cumin Seeds', quantity: '1 tsp' },
      { name: 'Turmeric', quantity: '1 tsp' },
      { name: 'Rajma Masala or Garam Masala', quantity: '1 tbsp' },
      { name: 'Kashmiri Red Chili Powder', quantity: '1 tsp' },
    ],
  },
  {
    emoji: '💪',
    category: 'PROTEIN BOOSTER',
    items: [{ name: 'Plain Greek Yogurt (optional)', quantity: '½ cup' }],
  },
  {
    emoji: '✨',
    category: 'GARNISH',
    items: [
      { name: 'Fresh Cilantro', quantity: 'handful' },
      { name: 'Lime Juice', quantity: '1 squeeze' },
    ],
  },
];

/** Dry Chana Masala (1 lb tier) – grouped ingredients. */
const DRY_CHANA_MASALA_1LB_GROUPS: IngredientGroup[] = [
  {
    emoji: '🫛',
    category: 'PROTEIN',
    items: [{ name: 'Chickpeas (Garbanzo beans), rinsed', quantity: '2 cans (15oz)' }],
  },
  {
    emoji: '🧅',
    category: 'AROMATICS',
    items: [
      { name: 'Large Red Onion, finely chopped', quantity: '1' },
      { name: 'Ginger-Garlic Paste', quantity: '1 tbsp' },
      { name: 'Green Chilies, slit', quantity: '1-2 (optional)' },
    ],
  },
  {
    emoji: '🫙',
    category: 'COOKING',
    items: [{ name: 'Avocado Oil or Ghee', quantity: '1 tbsp' }],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Cumin Seeds', quantity: '1 tsp' },
      { name: 'Amchur (Dry Mango Powder)', quantity: '1 tsp' },
      { name: 'Roasted Cumin Powder', quantity: '1 tsp' },
      { name: 'Coriander Powder', quantity: '1 tsp' },
      { name: 'Turmeric', quantity: '½ tsp' },
      { name: 'Chana Masala Powder', quantity: '1 tsp' },
      { name: 'Salt', quantity: 'to taste' },
    ],
  },
  {
    emoji: '💪',
    category: 'PROTEIN BOOSTER',
    items: [{ name: 'Hemp Seeds or Crushed Roasted Peanuts', quantity: '¼ cup' }],
  },
  {
    emoji: '✨',
    category: 'GARNISH',
    items: [
      { name: 'Fresh Cilantro', quantity: 'handful' },
      { name: 'Ginger Juliennes', quantity: 'small handful' },
      { name: 'Lemon Juice', quantity: 'generous squeeze' },
    ],
  },
];

/** Masoor Dal Curry (1lb tier) – grouped ingredients. */
const MASOOR_DAL_CURRY_1LB_GROUPS: IngredientGroup[] = [
  {
    emoji: '🫘',
    category: 'PROTEIN',
    items: [
      { name: 'Red Lentils (Masoor Dal), rinsed', quantity: '1.25 cups' },
      { name: 'Water', quantity: '3.5 cups' },
    ],
  },
  {
    emoji: '🧅',
    category: 'AROMATICS',
    items: [
      { name: 'Medium Onion, finely diced', quantity: '1' },
      { name: 'Medium Tomatoes, finely chopped', quantity: '2' },
      { name: 'Ginger-Garlic Paste', quantity: '1 tbsp' },
    ],
  },
  {
    emoji: '🫙',
    category: 'COOKING',
    items: [{ name: 'Avocado Oil or Ghee', quantity: '1 tbsp' }],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Cumin Seeds', quantity: '1 tsp' },
      { name: 'Hing (Asafetida)', quantity: 'pinch' },
      { name: 'Turmeric', quantity: '½ tsp' },
      { name: 'Red Chili Powder', quantity: '½ tsp' },
      { name: 'Coriander Powder', quantity: '1 tsp' },
      { name: 'Garam Masala', quantity: '1 tsp' },
      { name: 'Kasuri Methi (Dried Fenugreek Leaves)', quantity: '1 tsp' },
      { name: 'Salt', quantity: 'to taste' },
    ],
  },
  {
    emoji: '✨',
    category: 'GARNISH',
    items: [
      { name: 'Fresh Cilantro', quantity: 'handful' },
      { name: 'Lemon Juice', quantity: 'generous squeeze' },
    ],
  },
];

/** Pan-Seared Tandoori Fish (1 lb tier) – grouped ingredients. */
const TANDOORI_FISH_1LB_GROUPS: IngredientGroup[] = [
  {
    emoji: '🐟',
    category: 'PROTEIN',
    items: [{ name: 'Firm White Fish Fillets (Cod, Tilapia or Seabass)', quantity: '1 lb (500g)' }],
  },
  {
    emoji: '🥛',
    category: 'MARINADE',
    items: [
      { name: 'Thick Yogurt or Hung Curd', quantity: '1 tbsp' },
      { name: 'Ginger-Garlic Paste', quantity: '1 tbsp' },
      { name: 'Lemon Juice', quantity: '1 tbsp' },
    ],
  },
  {
    emoji: '🌶️',
    category: 'SPICES',
    items: [
      { name: 'Kashmiri Red Chili Powder', quantity: '1 tsp' },
      { name: 'Turmeric Powder', quantity: '½ tsp' },
      { name: 'Garam Masala', quantity: '1 tsp' },
      { name: 'Coriander Powder', quantity: '1 tsp' },
      { name: 'Salt', quantity: 'to taste' },
      { name: 'Kasuri Methi (Fenugreek Leaves)', quantity: '1 tbsp (optional)' },
    ],
  },
  {
    emoji: '🍳',
    category: 'COOKING',
    items: [
      { name: 'Olive or Avocado Oil', quantity: '1-2 tbsp' },
      { name: 'Fresh Coriander & Lemon (garnish)', quantity: 'to taste' },
    ],
  },
];

/** Built-in recipe id -> grouped ingredients for checklist UI. No entry = flat list. */
export const BUILTIN_INGREDIENT_GROUPS: Partial<Record<string, IngredientGroup[]>> = {
  'builtin-chicken-butter': BUTTER_CHICKEN_1LB_GROUPS,
  'builtin-chicken-pepper': PEPPER_CHICKEN_1LB_GROUPS,
  'builtin-chicken-tikka-bites': INDIAN_TIKKA_BITES_1LB_GROUPS,
  'builtin-paneer-stirfry': HEALTHY_PANEER_STIR_FRY_1LB_GROUPS,
  'builtin-prawns-pepper-fry': PEPPER_SHRIMP_FRY_1LB_GROUPS,
  'builtin-tofu-fried-masala': FRIED_MASALA_TOFU_1LB_GROUPS,
  'builtin-pork-vindaloo': GOAN_PORK_VINDALOO_1LB_GROUPS,
  'builtin-pork-pepper-fry': PORK_PEPPER_FRY_1LB_GROUPS,
  'builtin-pork-indian-curry': INDIAN_PORK_CURRY_1LB_GROUPS,
  'builtin-lamb-healthy-curry': HEALTHY_LAMB_CURRY_1LB_GROUPS,
  'builtin-goat-chops': GOAT_CHOPS_1LB_GROUPS,
  'builtin-eggs-healthy-curry': HEALTHY_EGG_CURRY_1LB_GROUPS,
  'builtin-fish-tandoori': TANDOORI_FISH_1LB_GROUPS,
  'builtin-soy-soya-masala': SOYA_MASALA_1LB_GROUPS,
  'builtin-beans-rajma-masala': RAJMA_MASALA_1LB_GROUPS,
  'builtin-beans-dry-chana-masala': DRY_CHANA_MASALA_1LB_GROUPS,
  'builtin-beans-masoor-dal-curry': MASOOR_DAL_CURRY_1LB_GROUPS,
};

const butterChicken1lbFlat = flattenIngredientGroups(BUTTER_CHICKEN_1LB_GROUPS);

/** Butter Chicken cooking steps for CookingModeScreen. */
const BUTTER_CHICKEN_STEPS: CookingStep[] = [
  {
    title: 'Marinate the Chicken',
    description: 'Mix chicken with yogurt, 1 tsp chili powder, garam masala, and salt. Marinate for at least 30 minutes, overnight is better.',
    emoji: '🍗',
    timerMinutes: 5,
    tip: 'Longer marination = more tender and flavourful chicken.',
  },
  {
    title: 'Sear the Chicken',
    description: 'Heat butter in a pan on high heat. Add marinated chicken pieces and sear until golden brown on all sides. Remove and set aside.',
    emoji: '🔥',
    timerMinutes: 8,
    tip: "Don't overcrowd the pan — sear in batches for best colour.",
  },
  {
    title: 'Soften the Onions',
    description: 'In the same pan, add more butter. Add diced onions and cook on medium heat until golden and soft, about 10 minutes.',
    emoji: '🧅',
    timerMinutes: 10,
    tip: 'Patient caramelisation here builds the base flavour.',
  },
  {
    title: 'Build the Masala',
    description: 'Add minced garlic and ginger to the onions. Cook for 2 minutes. Add the tomato puree, all remaining dry spices, and a pinch of sugar. Stir and cook until the oil separates from the masala — about 8 minutes.',
    emoji: '🫙',
    timerMinutes: 8,
    tip: 'The oil separation stage means the spices are fully cooked.',
  },
  {
    title: 'Add Cream & Chicken',
    description: 'Reduce heat to low. Add heavy cream and stir well. Return the seared chicken to the pan. Simmer gently for 10 minutes until chicken is cooked through and sauce thickens.',
    emoji: '🍛',
    timerMinutes: 10,
    tip: 'Low and slow here — high heat will split the cream.',
  },
  {
    title: 'Finish & Serve',
    description: 'Taste and adjust salt. Add a final knob of butter for richness. Garnish with cream swirl and fresh coriander. Serve with naan or basmati rice.',
    emoji: '✨',
    timerMinutes: 2,
    tip: 'The final butter knob is the secret to restaurant-style richness.',
  },
];

/** Venky's Pepper Chicken cooking steps. */
const PEPPER_CHICKEN_STEPS: CookingStep[] = [
  {
    title: 'Prepare the Chicken',
    description: 'Cut chicken into bite-sized pieces. Clean and pat dry.',
    emoji: '🍗',
    timerMinutes: 5,
    tip: 'Bone-in chicken adds more flavour, boneless cooks faster.',
  },
  {
    title: 'Roast Whole Spices',
    description: 'Dry roast fennel seeds (optional), coriander seeds and peppercorns on medium heat. Grind to 1 tsp powder.',
    emoji: '🫙',
    timerMinutes: 5,
    tip: 'Freshly ground spices make a huge difference in flavour.',
  },
  {
    title: 'Heat Oil & Aromatics',
    description: 'Heat 2-3 tbsp oil in a pan. Sauté sliced onions, green chillies and curry leaves until onions are golden.',
    emoji: '🧅',
    timerMinutes: 5,
    tip: "Curry leaves must go in hot oil — that's where the aroma comes from.",
  },
  {
    title: 'Add Spices',
    description: 'Add ginger-garlic paste and all powdered spices including turmeric. Stir well for 2 minutes on medium heat.',
    emoji: '🌶️',
    timerMinutes: 2,
    tip: "Don't let the spices burn — keep stirring.",
  },
  {
    title: 'Cook the Chicken',
    description: 'Add chicken pieces and mix well with the masala. Cook on medium heat until chicken is tender and cooked through, about 8-10 minutes.',
    emoji: '🍳',
    timerMinutes: 10,
    tip: 'Cover the pan for the first 5 minutes to cook through, then uncover to dry out.',
  },
  {
    title: 'Dry Roast Finish',
    description: 'Add crushed black pepper and cook on high heat for 1-2 minutes until the chicken is slightly charred and dry.',
    emoji: '🔥',
    timerMinutes: 2,
    tip: "This high heat finish is what gives Pepper Chicken its signature texture.",
  },
  {
    title: 'Serve Hot',
    description: 'Squeeze lemon juice, garnish with fresh coriander. Serve hot with rice or bread.',
    emoji: '✨',
    timerMinutes: 1,
    tip: 'Adjust pepper to your taste — more pepper = more heat!',
  },
];

/** Healthy Paneer Stir Fry cooking steps. */
const HEALTHY_PANEER_STIR_FRY_STEPS: CookingStep[] = [
  {
    title: 'Sauté the Paneer',
    description: 'Heat 1 tbsp olive oil or ghee in a pan. Add paneer cubes and sauté until golden on all sides. Set aside.',
    emoji: '🧀',
    timerMinutes: 5,
    tip: 'Use olive oil for a leaner recipe.',
  },
  {
    title: 'Toast Cumin Seeds',
    description: 'In the same pan, heat 1 tsp oil or ghee. Add cumin seeds and let them splutter for about 30 seconds.',
    emoji: '🫙',
    timerMinutes: 2,
    tip: 'Hot oil + cumin seeds = the base of every great Indian dish.',
  },
  {
    title: 'Cook Onions & Aromatics',
    description: 'Add sliced onions and ginger-garlic paste. Sauté on medium heat until onions are light brown.',
    emoji: '🧅',
    timerMinutes: 5,
    tip: "Don't rush the onions — light brown gives the best flavour.",
  },
  {
    title: 'Add Vegetables & Spices',
    description: 'Add chopped tomato, capsicum, turmeric, coriander powder and red chili powder. Cook for 2-3 minutes. Add ¼ cup water.',
    emoji: '🌶️',
    timerMinutes: 3,
    tip: 'Add fresh veggies like spinach or peas for extra nutrients.',
  },
  {
    title: 'Add Yogurt',
    description: 'Reduce heat to low. Add whisked yogurt and stir continuously for 2 minutes to prevent curdling.',
    emoji: '🥛',
    timerMinutes: 2,
    tip: 'Always whisk yogurt before adding and keep heat low.',
  },
  {
    title: 'Add Back Paneer',
    description: 'Add the sautéed paneer back into the pan. Add lemon juice and simmer for a few minutes until sauce coats the paneer.',
    emoji: '🍳',
    timerMinutes: 3,
    tip: 'Lemon juice brightens all the flavours at the end.',
  },
  {
    title: 'Finish & Serve',
    description: 'Garnish with fresh coriander. Serve hot with roti or brown rice.',
    emoji: '✨',
    timerMinutes: 1,
    tip: 'Use olive oil throughout for a leaner, healthier version.',
  },
];

/** Indian Tikka Bites cooking steps. */
const INDIAN_TIKKA_BITES_STEPS: CookingStep[] = [
  {
    title: 'Mix the Marinade',
    description: 'Mix together the yogurt, minced ginger, minced garlic and cilantro in a large bowl until well combined.',
    emoji: '🥣',
    timerMinutes: 5,
    tip: 'Use full-fat Greek yogurt — the lactic acid tenderizes the chicken beautifully.',
  },
  {
    title: 'Add the Spices',
    description: 'Add turmeric, cayenne, smoked paprika, cumin, coriander, garam masala and salt into the yogurt mixture. Stir well to combine all spices.',
    emoji: '🌶️',
    timerMinutes: 2,
    tip: "Smoked paprika mimics the charred tandoor flavor — don't skip it.",
  },
  {
    title: 'Marinate the Chicken',
    description: 'Cut chicken into bite-sized pieces. Add to the marinade and mix until every piece is well coated. Marinate for at least 30 minutes — up to 24 hours in the fridge for best results.',
    emoji: '🍗',
    timerMinutes: 30,
    tip: 'Longer marination = more tender chicken. Overnight is ideal especially for chicken breast.',
  },
  {
    title: 'Heat the Ghee',
    description: 'Heat ghee in a heavy pan or cast iron skillet on medium-high heat until shimmering.',
    emoji: '🧈',
    timerMinutes: 2,
    tip: 'Ghee has a high smoke point — perfect for getting that sear without burning.',
  },
  {
    title: 'Sear the Chicken',
    description: 'Add marinated chicken pieces to the hot pan in a single layer. Cook undisturbed for 3-4 minutes to develop a golden char, then flip and cook the other side.',
    emoji: '🔥',
    timerMinutes: 8,
    tip: "Don't overcrowd the pan — cook in batches for the best sear and smoky tandoori flavour.",
  },
  {
    title: 'Finish with Lemon',
    description: 'Squeeze fresh lemon juice over the chicken bites. Garnish with fresh cilantro and serve hot with naan, rice or as a snack.',
    emoji: '🍋',
    timerMinutes: 1,
    tip: 'Adjust cayenne to taste — add more after cooking for extra heat on individual portions.',
  },
];

/** Fried Masala Tofu cooking steps. */
const FRIED_MASALA_TOFU_STEPS: CookingStep[] = [
  {
    title: 'Press the Tofu',
    description: 'Discard any water from tofu packaging. Rinse under cold tap water. Wrap in 2-3 thick paper towels and place on a colander with a heavy weight on top for 30 minutes to 1 hour.',
    emoji: '🟫',
    timerMinutes: 30,
    tip: 'Removing moisture is the key to crispy tofu — don\'t skip this step.',
  },
  {
    title: 'Make the Masala Paste',
    description: 'In a bowl mix together yogurt, curry powder, kashmiri chilli powder, turmeric, garam masala, salt, sugar and 1 tsp oil. Mix into a smooth paste.',
    emoji: '🌶️',
    timerMinutes: 5,
    tip: 'If using store-bought curry powder that already has chilli, skip the kashmiri chilli powder.',
  },
  {
    title: 'Apply the Marinade',
    description: 'Cut tofu into thick cubes — don\'t slice too thin. Apply the masala paste with your fingers, coating each piece well. Marinate for at least 30 minutes — overnight gives the best flavour.',
    emoji: '🧈',
    timerMinutes: 5,
    tip: 'Apply masala with your fingers for best coverage. You can add 1 tsp ginger garlic paste for extra depth.',
  },
  {
    title: 'Fry the Tofu',
    description: 'Heat 1 tbsp oil in a non-stick pan on medium heat. Fry tofu in a single layer — work in batches if pan is small. Fry until lightly golden brown on each side.',
    emoji: '🔥',
    timerMinutes: 8,
    tip: 'Don\'t fry on high heat — it burns the masala. Remove as soon as golden brown to preserve all the flavours.',
  },
  {
    title: 'Garnish & Serve',
    description: 'Transfer to a serving plate. Garnish with freshly chopped coriander and a few drops of lemon juice. Serve immediately — tastes best the day it is made.',
    emoji: '✨',
    timerMinutes: 1,
    tip: 'Serve as appetizer, snack or side dish. Paneer works great as a substitute for tofu.',
  },
];

/** Pepper Shrimp Fry cooking steps. */
const PEPPER_SHRIMP_FRY_STEPS: CookingStep[] = [
  {
    title: 'Prepare the Masala',
    description: 'Dry roast fennel seeds, coriander seeds and peppercorns until fragrant. Cool and grind to a fine powder.',
    emoji: '🫙',
    timerMinutes: 5,
    tip: 'Freshly ground masala is the secret to this dish.',
  },
  {
    title: 'Heat Oil & Aromatics',
    description: 'Heat oil in a pan. Add curry leaves and green chillies. Let them splutter for 30 seconds.',
    emoji: '🌿',
    timerMinutes: 3,
    tip: 'Hot oil with curry leaves releases incredible aroma.',
  },
  {
    title: 'Add Ginger-Garlic',
    description: 'Add ginger-garlic paste, turmeric and salt. Cook for 1 minute on medium heat.',
    emoji: '🧅',
    timerMinutes: 2,
    tip: "Don't let the ginger-garlic burn — keep stirring.",
  },
  {
    title: 'Add Shrimp',
    description: "Add shrimp and cook for 2-3 minutes until they turn pink. Don't overcook.",
    emoji: '🦐',
    timerMinutes: 3,
    tip: 'Shrimp cook fast — pink and curled means done!',
  },
  {
    title: 'Add Ground Masala',
    description: 'Add the freshly prepared spice powder. Mix well to coat all the shrimp evenly.',
    emoji: '🌶️',
    timerMinutes: 3,
    tip: 'Adjust pepper level to your taste at this stage.',
  },
  {
    title: 'Fry & Garnish',
    description: 'Cook on high heat for 2 more minutes until slightly charred. Garnish with fresh coriander and serve hot.',
    emoji: '🔥',
    timerMinutes: 2,
    tip: 'High heat finish gives the perfect dry fry texture.',
  },
];

/** Indian Pork Curry cooking steps. */
const INDIAN_PORK_CURRY_STEPS: CookingStep[] = [
  {
    title: 'Prep & Sear',
    description: 'Heat oil or ghee in a pressure cooker or heavy pot on medium-high heat. Add whole spices (bay leaves, cinnamon, fennel seeds) if using and let them splutter. Add chopped onions, minced garlic and grated ginger. Sauté until deep golden brown.',
    emoji: '🧅',
    timerMinutes: 10,
    tip: 'Well-browned onions are the foundation of a rich curry — don\'t rush this step.',
  },
  {
    title: 'Combine & Coat',
    description: 'Add the diced pork pieces to the pot. Stir in turmeric, coriander powder, garam masala, chili powder and salt. Toss well until every piece of pork is coated in the spices.',
    emoji: '🌶️',
    timerMinutes: 5,
    tip: 'Coating the pork in dry spices before adding liquid gives deeper flavour throughout.',
  },
  {
    title: 'Pressure Cook',
    description: 'Add canned tomatoes and water. Stir well. Cover the pressure cooker and cook for 5-6 whistles on medium heat. If using a regular pot, cover and simmer for 35-40 minutes until pork is tender.',
    emoji: '🫕',
    timerMinutes: 20,
    tip: 'Add more water during cooking if the curry looks too dry — pork shoulder needs enough liquid to become tender.',
  },
  {
    title: 'Finish & Serve',
    description: 'Let pressure release naturally — don\'t force it open. Once safe to open, simmer uncovered for 3-4 minutes to thicken the gravy to your liking. Garnish with fresh coriander and serve hot with rice or roti.',
    emoji: '✨',
    timerMinutes: 5,
    tip: 'Natural pressure release keeps the pork tender — forced release can toughen the meat.',
  },
];

/** Healthy Lamb Curry cooking steps. */
const HEALTHY_LAMB_CURRY_STEPS: CookingStep[] = [
  {
    title: 'Marinate the Lamb',
    description: 'In a bowl, mix cubed lamb with 1 tbsp curry powder, ½ tsp turmeric, salt and a little lemon juice. Marinate for at least 20 minutes — up to 2 hours in the fridge for deeper flavour.',
    emoji: '🥩',
    timerMinutes: 5,
    tip: 'Marinating helps tenderise the lamb and infuse the first layer of spices.',
  },
  {
    title: 'Sauté Aromatics',
    description: 'Heat oil in a heavy pot. Add chopped onion and fry until golden. Add garlic, ginger, green chilli and curry leaves. Sauté for 2–3 minutes until fragrant.',
    emoji: '🧅',
    timerMinutes: 8,
    tip: 'Curry leaves in hot oil release their signature aroma — don’t skip them.',
  },
  {
    title: 'Add Spices',
    description: 'Add remaining curry powder, turmeric, cumin, garam masala, mixed seeds and black pepper. Stir on medium heat for 1–2 minutes until spices are toasted and fragrant.',
    emoji: '🌶️',
    timerMinutes: 2,
    tip: 'Toasting spices briefly in oil unlocks their flavour — avoid burning.',
  },
  {
    title: 'Add Tomato Base',
    description: 'Add canned chopped tomatoes and tomato puree. Stir well and cook for 5–6 minutes until the mixture thickens and oil starts to separate.',
    emoji: '🍅',
    timerMinutes: 6,
    tip: 'Cook the tomato base until it loses raw tang — this builds the curry depth.',
  },
  {
    title: 'Simmer the Lamb',
    description: 'Add marinated lamb and mix to coat in the masala. Pour in 100–200ml water (adjust for desired consistency). Cover and simmer on low heat for 25–30 minutes until lamb is tender.',
    emoji: '🥘',
    timerMinutes: 30,
    tip: 'Low and slow ensures tender lamb; add more water if the curry gets too thick.',
  },
  {
    title: 'Finish & Serve',
    description: 'Stir in remaining lemon juice. Taste and adjust salt. Garnish with fresh coriander. Serve hot with rice, roti or naan.',
    emoji: '✨',
    timerMinutes: 2,
    tip: 'Lemon at the end brightens the curry and balances the spices.',
  },
];

/** Goat Chops (Mutton Chaap) cooking steps. */
const GOAT_CHOPS_STEPS: CookingStep[] = [
  {
    title: 'Marinate the Chops',
    description: 'In a large bowl mix yogurt, ginger-garlic paste, red chili powder, turmeric, garam masala, cumin powder, coriander powder and salt. Add goat chops and coat thoroughly. Marinate for at least 1 hour — overnight in the fridge for maximum tenderness.',
    emoji: '🥣',
    timerMinutes: 60,
    tip: 'The yogurt tenderizes the goat meat beautifully — overnight marination makes a huge difference.',
  },
  {
    title: 'Fry the Onions',
    description: 'Heat 2 tbsp oil or ghee in a pressure cooker on medium heat. Add finely sliced onions and fry until deep golden brown.',
    emoji: '🧅',
    timerMinutes: 8,
    tip: 'Well-browned onions are essential for a rich, deep flavoured gravy — be patient here.',
  },
  {
    title: 'Sear the Chops',
    description: 'Add the marinated chops to the pressure cooker. Increase heat to high and sear for 3-4 minutes to lock in the juices. Add ¼ cup water to prevent sticking.',
    emoji: '🔥',
    timerMinutes: 5,
    tip: 'Searing on high heat locks in the juices and gives a beautiful colour to the meat.',
  },
  {
    title: 'Pressure Cook',
    description: 'Close the pressure cooker lid and cook on medium flame for 3-4 whistles (approximately 15-20 minutes) until the meat is tender.',
    emoji: '🫕',
    timerMinutes: 20,
    tip: 'Always let pressure release naturally — forced release can toughen goat meat.',
  },
  {
    title: 'Bhuna (Dry Roast)',
    description: 'Once pressure releases naturally, open the lid. Turn heat to medium-high to evaporate excess water. Stir continuously until the gravy thickens, turns dark, coats the chops and oil starts to separate from the masala.',
    emoji: '🌶️',
    timerMinutes: 8,
    tip: 'The bhuna stage is where all the deep flavour develops — keep stirring and don\'t walk away.',
  },
  {
    title: 'Finish & Serve',
    description: 'Add slit green chili and fresh coriander. Squeeze lemon juice over the chops. Serve hot with sautéed vegetables, fresh salad, roti or naan.',
    emoji: '✨',
    timerMinutes: 2,
    tip: 'Serve with vegetables or salad to increase fiber content for a complete balanced meal.',
  },
];

/** Healthy Egg Curry cooking steps. */
const HEALTHY_EGG_CURRY_STEPS: CookingStep[] = [
  {
    title: 'Prepare the Eggs',
    description: 'Peel the hard-boiled eggs and make 3-4 small slits on the sides of each egg. This helps them absorb the curry flavours beautifully.',
    emoji: '🥚',
    timerMinutes: 3,
    tip: 'Pre-boil eggs the night before to save time — store peeled in the fridge.',
  },
  {
    title: 'Sauté Aromatics',
    description: 'Heat oil in a pan over medium flame. Add cumin seeds and let them splutter. Add chopped onions and green chilies. Sauté until onions turn golden brown.',
    emoji: '🧅',
    timerMinutes: 8,
    tip: 'Golden brown onions — not just soft — give the curry its rich base flavour.',
  },
  {
    title: 'Add Ginger-Garlic',
    description: 'Stir in the ginger-garlic paste and sauté for about 1 minute until the raw smell completely disappears.',
    emoji: '🫙',
    timerMinutes: 2,
    tip: "Cook until you can no longer smell raw garlic — that's when it's ready.",
  },
  {
    title: 'Cook Tomato Base',
    description: 'Add tomato puree or chopped tomatoes. Cook for 3-5 minutes until they soften and the mixture begins to leave the sides of the pan.',
    emoji: '🍅',
    timerMinutes: 5,
    tip: 'The mixture leaving the pan sides means the tomatoes are fully cooked and the base is ready.',
  },
  {
    title: 'Add Spices',
    description: 'Add turmeric, red chili powder, coriander powder and salt. Mix well and fry for 1 minute until the spices are aromatic.',
    emoji: '🌶️',
    timerMinutes: 2,
    tip: 'Frying spices in the masala for 1 minute removes the raw taste and deepens the flavour.',
  },
  {
    title: 'Simmer the Gravy',
    description: 'Pour in 1 cup of water to reach your desired consistency. Bring the curry to a boil on medium-high heat.',
    emoji: '🫕',
    timerMinutes: 5,
    tip: 'Add more or less water depending on whether you want a thick or thin curry.',
  },
  {
    title: 'Add the Eggs',
    description: 'Add the boiled eggs to the gravy. Cover and simmer on low heat for 5-10 minutes to allow the flavours to penetrate the eggs through the slits.',
    emoji: '🥚',
    timerMinutes: 8,
    tip: 'Low and slow here — gentle simmering lets the eggs soak up all the curry flavours.',
  },
  {
    title: 'Finish & Serve',
    description: 'Stir in garam masala and garnish with fresh coriander leaves. Serve hot with rice or roti.',
    emoji: '✨',
    timerMinutes: 1,
    tip: 'Stir in 3-4 tbsp beaten yogurt instead of water for a creamy, high-protein gravy without the extra fat.',
  },
];

/** Pan-Seared Tandoori Fish cooking steps. */
const PAN_SEARED_TANDOORI_FISH_STEPS: CookingStep[] = [
  {
    title: 'Prep the Fish',
    description: 'Pat the fish fillets very dry with paper towels. This is essential — moisture prevents the marinade from sticking and stops you getting a good sear.',
    emoji: '🐟',
    timerMinutes: 5,
    tip: "The drier the fish, the better the char — don't skip the paper towel step.",
  },
  {
    title: 'Make the Marinade',
    description: 'In a bowl mix yogurt, ginger-garlic paste, kashmiri chili powder, turmeric, garam masala, coriander powder, lemon juice, kasuri methi (if using) and salt into a thick paste. Coat fish fillets thoroughly.',
    emoji: '🌶️',
    timerMinutes: 5,
    tip: 'Kashmiri chili gives beautiful red colour without too much heat — perfect for the tandoori look.',
  },
  {
    title: 'Marinate',
    description: 'Let the coated fish rest for at least 15-20 minutes to allow the spices to penetrate the fillets.',
    emoji: '⏱️',
    timerMinutes: 20,
    tip: 'Marinate up to 2 hours in the fridge for deeper flavour — but even 15 minutes makes a difference.',
  },
  {
    title: 'Sear the Fish',
    description: 'Heat a non-stick pan on medium-high heat. Add oil. Place marinated fish in the pan — do not overcrowd. Cook for 3-5 minutes on each side WITHOUT moving them to allow a proper char to develop.',
    emoji: '🔥',
    timerMinutes: 8,
    tip: "Resist the urge to move the fish — leaving it undisturbed creates the tandoori char effect.",
  },
  {
    title: 'Finish & Serve',
    description: 'Fish is done when it turns opaque and flakes easily with a fork. Garnish with fresh coriander and extra lemon juice. Serve with green salad or cauliflower rice for a low-carb high-protein meal.',
    emoji: '✨',
    timerMinutes: 2,
    tip: 'Flakes easily = perfectly cooked. Overcooked fish falls apart — watch it closely in the last minute.',
  },
];

/** Soya Masala cooking steps. */
const SOYA_MASALA_STEPS: CookingStep[] = [
  {
    title: 'Prep the Soya',
    description: 'Soak soya chunks in hot salted water for 10 minutes until they double in size and soften. Drain the water and squeeze the chunks thoroughly to remove all excess liquid.',
    emoji: '🫘',
    timerMinutes: 10,
    tip: 'Squeezing out excess liquid helps the chunks absorb all the curry flavors — don\'t skip this step.',
  },
  {
    title: 'Sauté the Base',
    description: 'Heat oil in a pan. Add cumin seeds and let them splutter. Add chopped onions and sauté on medium heat until golden brown, about 5 minutes.',
    emoji: '🧅',
    timerMinutes: 6,
    tip: 'Golden brown onions — not just soft — are the key to a rich flavourful curry base.',
  },
  {
    title: 'Add Aromatics & Tomatoes',
    description: 'Stir in ginger-garlic paste and sauté for 1 minute until raw smell disappears. Add chopped tomatoes, turmeric and salt. Cook until tomatoes become mushy and mixture looks like a thick paste.',
    emoji: '🍅',
    timerMinutes: 8,
    tip: 'No need to blend — keeping it chunky makes this a one-pot meal with great texture.',
  },
  {
    title: 'Cook the Curry',
    description: 'Add squeezed soya chunks and mix well so every piece is coated in masala. Add 1 to 1.5 cups water depending on how much gravy you like. Cover and simmer on low-medium heat for 8-10 minutes.',
    emoji: '🫕',
    timerMinutes: 10,
    tip: 'More water = more gravy. Less water = dry style soya. Your choice!',
  },
  {
    title: 'Finish the Masala',
    description: 'Stir in coriander powder and garam masala. Cook uncovered for another 2 minutes to let the spices bloom and sauce thicken.',
    emoji: '🌶️',
    timerMinutes: 2,
    tip: 'Adding garam masala at the end preserves its aroma — early addition dulls the fragrance.',
  },
  {
    title: 'Garnish & Serve',
    description: 'Turn off heat. Garnish with fresh cilantro and a squeeze of lemon juice. Serve with Greek yogurt or cucumber-tomato salad for extra protein.',
    emoji: '✨',
    timerMinutes: 1,
    tip: 'Lemon juice is key — Vitamin C helps your body absorb the plant-based iron in soy!',
  },
];

/** Rajma Masala cooking steps. */
const RAJMA_MASALA_STEPS: CookingStep[] = [
  {
    title: 'Build the Base',
    description: 'Heat oil in a deep pan or pot. Add cumin seeds and let them sizzle. Add diced onions and sauté on medium heat until deep golden brown.',
    emoji: '🧅',
    timerMinutes: 8,
    tip: 'Golden brown onions are non-negotiable for a rich Rajma — this step sets the whole flavour.',
  },
  {
    title: 'Add Aromatics & Tomatoes',
    description: 'Add ginger-garlic paste and cook for 1 minute until raw smell disappears. Add tomato puree, turmeric, chili powder and salt. Cook until oil starts to separate from the masala — about 5-7 minutes.',
    emoji: '🍅',
    timerMinutes: 7,
    tip: 'Oil separating from the masala means your base is fully cooked — don\'t rush past this stage.',
  },
  {
    title: 'Add the Beans',
    description: 'Add drained kidney beans to the masala. Stir well to coat every bean in the spiced masala base.',
    emoji: '🫘',
    timerMinutes: 3,
    tip: 'Using canned beans saves 8 hours of soaking and 30 minutes of pressure cooking — smart shortcut!',
  },
  {
    title: 'Simmer & Thicken',
    description: 'Add 1.5 cups water. Use a potato masher or back of spoon to lightly crush about 10% of the beans directly in the pot. Simmer on medium-low for 10 minutes.',
    emoji: '🥄',
    timerMinutes: 10,
    tip: 'Crushing some beans releases natural starch for thick creamy gravy — no heavy cream needed!',
  },
  {
    title: 'Add Rajma Masala',
    description: 'Stir in the Rajma Masala or Garam Masala. Let it simmer for 2 more minutes to let the spices fully bloom into the curry.',
    emoji: '🌶️',
    timerMinutes: 2,
    tip: 'Adding masala at the end preserves its aroma and gives a fresh spice hit.',
  },
  {
    title: 'The Protein Boost',
    description: 'Turn heat to low. Whisk the Greek yogurt separately then slowly stir it into the curry. This adds tangy richness and bumps protein count by 11g.',
    emoji: '💪',
    timerMinutes: 2,
    tip: 'Always whisk yogurt before adding and keep heat LOW — high heat will cause it to split.',
  },
  {
    title: 'Garnish & Serve',
    description: 'Turn off heat. Garnish with fresh cilantro and a good squeeze of lime juice. Serve with rice, roti or as a standalone high-protein bowl.',
    emoji: '✨',
    timerMinutes: 1,
    tip: 'Paired with rice this becomes a complete protein — all essential amino acids covered!',
  },
];

/** Dry Chana Masala cooking steps. */
const DRY_CHANA_MASALA_STEPS: CookingStep[] = [
  {
    title: 'Tempering',
    description: 'Heat oil in a wide pan. Add cumin seeds and let them crackle. Add chopped onions and sauté until translucent and slightly browned.',
    emoji: '🫙',
    timerMinutes: 3,
    tip: 'A wide pan is key — more surface area means better sear on the chickpeas later.',
  },
  {
    title: 'Flavor Base',
    description: 'Add ginger-garlic paste and slit green chilies. Sauté for 1 minute until raw smell disappears.',
    emoji: '🧅',
    timerMinutes: 2,
    tip: 'Green chilies are optional but add a fresh heat that complements the dry spices.',
  },
  {
    title: 'Toast the Spices',
    description: 'Lower the heat. Add turmeric, coriander powder, amchur, and chana masala powder. Stir continuously for 30 seconds to toast the spices in the oil.',
    emoji: '🌶️',
    timerMinutes: 1,
    tip: 'Toasting spices in oil is the secret to the deep Pindi-style flavour — don\'t skip and don\'t burn!',
  },
  {
    title: 'Toss the Chickpeas',
    description: 'Add drained chickpeas and salt. Toss thoroughly so every single chickpea is coated in the dark spice mix.',
    emoji: '🫛',
    timerMinutes: 3,
    tip: 'The more evenly coated the chickpeas are the better the sear in the next step.',
  },
  {
    title: 'The Sear',
    description: 'Cook on medium-high heat for 5 minutes, stirring occasionally. You want the chickpea skins to get slightly crisp. If too dry, sprinkle just 1 tsp water to deglaze the pan.',
    emoji: '🔥',
    timerMinutes: 5,
    tip: 'Slightly crisp chickpea skins = restaurant quality Chana. Resist the urge to add too much water.',
  },
  {
    title: 'Protein Boost',
    description: 'Sprinkle hemp seeds or crushed roasted peanuts over the top. Give it a final toss to mix through.',
    emoji: '💪',
    timerMinutes: 1,
    tip: 'Hemp seeds add all essential amino acids — making this a complete plant-based protein meal.',
  },
  {
    title: 'Garnish & Serve',
    description: 'Garnish generously with fresh cilantro, ginger juliennes and a heavy squeeze of lemon juice. Serve hot as a main or side dish.',
    emoji: '✨',
    timerMinutes: 1,
    tip: 'Ginger juliennes on top add a beautiful fresh crunch — don\'t skip the garnish!',
  },
];

/** Masoor Dal Curry cooking steps. */
const MASOOR_DAL_CURRY_STEPS: CookingStep[] = [
  {
    title: 'Sauté the Base',
    description: 'Heat oil directly in pressure cooker. Add cumin seeds and a pinch of hing. Once they sizzle add diced onions and sauté until light brown — about 3 minutes.',
    emoji: '🧅',
    timerMinutes: 4,
    tip: 'Hing (asafetida) adds a subtle depth and also helps with digestion of lentils.',
  },
  {
    title: 'Add Aromatics & Tomatoes',
    description: 'Add ginger-garlic paste and sauté for 1 minute. Add chopped tomatoes, turmeric, chili powder, coriander powder and salt. Cook for 2 minutes until tomatoes soften slightly.',
    emoji: '🍅',
    timerMinutes: 3,
    tip: "Don't fully cook the tomatoes here — they'll finish perfectly under pressure.",
  },
  {
    title: 'Pressure Cook',
    description: 'Add rinsed masoor dal and 3.5 cups water. Close the lid. Standard pressure cooker: 2-3 whistles on medium-high heat. Instant Pot: Manual/Pressure Cook High for 4 minutes.',
    emoji: '🫕',
    timerMinutes: 10,
    tip: "Masoor dal cooks faster than other lentils — don't over-pressure or it turns mushy.",
  },
  {
    title: 'Release Pressure',
    description: 'Let pressure release naturally for 5 minutes then manually vent the remaining pressure. Do not force open immediately.',
    emoji: '⏱️',
    timerMinutes: 5,
    tip: 'Natural release for 5 minutes gives the dal time to finish cooking in residual steam.',
  },
  {
    title: 'High Protein Finish',
    description: 'Open lid and stir the dal well. If too thick add a splash of hot water to adjust consistency. Rub kasuri methi between your palms and sprinkle in along with garam masala. Stir well.',
    emoji: '💪',
    timerMinutes: 2,
    tip: 'Rubbing kasuri methi releases its oils — it smells incredible and transforms the dal.',
  },
  {
    title: 'Garnish & Serve',
    description: 'Add fresh cilantro and a generous squeeze of lemon juice. Serve hot with rice, roti or as a standalone protein bowl.',
    emoji: '✨',
    timerMinutes: 1,
    tip: 'Lemon juice at the end brightens all the flavours — add it just before serving.',
  },
];

/** Built-in recipes (e.g. Chicken) for checklist/cooking flow. Resolved by id. */
const BUILTIN_RECIPES: SavedRecipe[] = [
  {
    id: 'builtin-chicken-butter',
    name: 'Butter Chicken (Murgh Makhani)',
    proteinId: 'chicken',
    proteinName: 'Chicken',
    proteinEmoji: '🍗',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': butterChicken1lbFlat,
    },
    steps: BUTTER_CHICKEN_STEPS,
    chefTip: 'High-protein classic.',
    createdAt: 0,
  },
  {
    id: 'builtin-chicken-pepper',
    name: "Venky's Pepper Chicken",
    proteinId: 'chicken',
    proteinName: 'Chicken',
    proteinEmoji: '🍗',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(PEPPER_CHICKEN_1LB_GROUPS),
    },
    steps: PEPPER_CHICKEN_STEPS,
    chefTip: '42g protein, 380 kcal, 25m cook time. Adjust pepper to your taste.',
    createdAt: 0,
  },
  {
    id: 'builtin-chicken-tikka',
    name: 'Chicken Tikka Masala',
    proteinId: 'chicken',
    proteinName: 'Chicken',
    proteinEmoji: '🍗',
    ingredients: defaultIngredientsByTier(),
    steps: [{ title: 'Prepare', description: 'Follow the recipe.' }],
    chefTip: 'High-protein classic.',
    createdAt: 0,
  },
  {
    id: 'builtin-chicken-biryani',
    name: 'Chicken Biryani',
    proteinId: 'chicken',
    proteinName: 'Chicken',
    proteinEmoji: '🍗',
    ingredients: defaultIngredientsByTier(),
    steps: [{ title: 'Prepare', description: 'Follow the recipe.' }],
    chefTip: 'High-protein classic.',
    createdAt: 0,
  },
  {
    id: 'builtin-chicken-grilled',
    name: 'Grilled Chicken',
    proteinId: 'chicken',
    proteinName: 'Chicken',
    proteinEmoji: '🍗',
    ingredients: defaultIngredientsByTier(),
    steps: [{ title: 'Prepare', description: 'Follow the recipe.' }],
    chefTip: 'High-protein classic.',
    createdAt: 0,
  },
  {
    id: 'builtin-chicken-tikka-bites',
    name: 'Indian Tikka Bites',
    proteinId: 'chicken',
    proteinName: 'Chicken',
    proteinEmoji: '🍗',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(INDIAN_TIKKA_BITES_1LB_GROUPS),
    },
    steps: INDIAN_TIKKA_BITES_STEPS,
    chefTip: '42g protein, 320 kcal, 30m cook time. Tender, spice-marinated chicken bites cooked until juicy and lightly charred — a bold, high-protein Indian classic made quick and healthy.',
    createdAt: 0,
  },
  {
    id: 'builtin-paneer-stirfry',
    name: 'Healthy Paneer Stir Fry',
    proteinId: 'paneer',
    proteinName: 'Paneer',
    proteinEmoji: '🧀',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(HEALTHY_PANEER_STIR_FRY_1LB_GROUPS),
    },
    steps: HEALTHY_PANEER_STIR_FRY_STEPS,
    chefTip: '18g protein, 320 kcal, 25m cook time.',
    createdAt: 0,
  },
  {
    id: 'builtin-prawns-pepper-fry',
    name: 'Pepper Shrimp Fry',
    proteinId: 'prawns',
    proteinName: 'Prawns',
    proteinEmoji: '🦐',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(PEPPER_SHRIMP_FRY_1LB_GROUPS),
    },
    steps: PEPPER_SHRIMP_FRY_STEPS,
    chefTip: '24g protein, 280 kcal, 20m cook time.',
    createdAt: 0,
  },
  {
    id: 'builtin-tofu-fried-masala',
    name: 'Fried Masala Tofu',
    proteinId: 'tofu',
    proteinName: 'Tofu',
    proteinEmoji: '🟫',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(FRIED_MASALA_TOFU_1LB_GROUPS),
    },
    steps: FRIED_MASALA_TOFU_STEPS,
    chefTip: '17g protein, 220 kcal, 15m cook time.',
    createdAt: 0,
  },
  {
    id: 'builtin-pork-vindaloo',
    name: 'Goan Pork Vindaloo',
    proteinId: 'pork',
    proteinName: 'Pork',
    proteinEmoji: '🥩',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(GOAN_PORK_VINDALOO_1LB_GROUPS),
    },
    steps: [{ title: 'Prepare', description: 'Follow the recipe for Goan Pork Vindaloo.' }],
    chefTip: '28g protein, 45 min cook time. Spicy Goan classic.',
    createdAt: 0,
  },
  {
    id: 'builtin-pork-pepper-fry',
    name: 'Pork Pepper Fry',
    proteinId: 'pork',
    proteinName: 'Pork',
    proteinEmoji: '🥩',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(PORK_PEPPER_FRY_1LB_GROUPS),
    },
    steps: [{ title: 'Prepare', description: 'Follow the recipe for Pork Pepper Fry.' }],
    chefTip: '29g protein, 30 min cook time.',
    createdAt: 0,
  },
  {
    id: 'builtin-pork-indian-curry',
    name: 'Indian Pork Curry',
    proteinId: 'pork',
    proteinName: 'Pork',
    proteinEmoji: '🥩',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(INDIAN_PORK_CURRY_1LB_GROUPS),
    },
    steps: INDIAN_PORK_CURRY_STEPS,
    chefTip: '31g protein, 380 kcal, 40m cook time.',
    createdAt: 0,
  },
  {
    id: 'builtin-lamb-healthy-curry',
    name: 'Healthy Lamb Curry',
    proteinId: 'lamb',
    proteinName: 'Lamb',
    proteinEmoji: '🥩',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(HEALTHY_LAMB_CURRY_1LB_GROUPS),
    },
    steps: HEALTHY_LAMB_CURRY_STEPS,
    chefTip: '28g protein, 45 min cook time. Aromatic, medium-spice lamb curry with tomato base.',
    createdAt: 0,
  },
  {
    id: 'builtin-goat-chops',
    name: 'Goat Chops (Mutton Chaap)',
    proteinId: 'goat',
    proteinName: 'Goat',
    proteinEmoji: '🐐',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(GOAT_CHOPS_1LB_GROUPS),
    },
    steps: GOAT_CHOPS_STEPS,
    chefTip: '27g protein, 340 kcal, 35m cook time.',
    createdAt: 0,
  },
  {
    id: 'builtin-eggs-healthy-curry',
    name: 'Healthy Egg Curry',
    proteinId: 'eggs',
    proteinName: 'Eggs',
    proteinEmoji: '🥚',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(HEALTHY_EGG_CURRY_1LB_GROUPS),
    },
    steps: HEALTHY_EGG_CURRY_STEPS,
    chefTip: '13g protein, 280 kcal, 25m cook time.',
    createdAt: 0,
  },
  {
    id: 'builtin-fish-tandoori',
    name: 'Pan-Seared Tandoori Fish',
    proteinId: 'fish',
    proteinName: 'Fish',
    proteinEmoji: '🐟',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(TANDOORI_FISH_1LB_GROUPS),
    },
    steps: PAN_SEARED_TANDOORI_FISH_STEPS,
    chefTip: '32g protein, 260 kcal, 25m cook time.',
    createdAt: 0,
  },
  {
    id: 'builtin-soy-soya-masala',
    name: 'Soya Masala',
    proteinId: 'soy',
    proteinName: 'Soy',
    proteinEmoji: '🫘',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(SOYA_MASALA_1LB_GROUPS),
    },
    steps: SOYA_MASALA_STEPS,
    chefTip: 'High-protein soya chunks in rich onion tomato masala. 36g protein, 280 kcal, 20m cook time.',
    createdAt: 0,
  },
  {
    id: 'builtin-beans-rajma-masala',
    name: 'Rajma Masala',
    proteinId: 'beans',
    proteinName: 'Beans',
    proteinEmoji: '🫘',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(RAJMA_MASALA_1LB_GROUPS),
    },
    steps: RAJMA_MASALA_STEPS,
    chefTip: 'Creamy red kidney bean curry — complete protein, one pot, zero fuss. 20g protein, 320 kcal, 25m cook time.',
    createdAt: 0,
  },
  {
    id: 'builtin-beans-dry-chana-masala',
    name: 'Dry Chana Masala',
    proteinId: 'beans',
    proteinName: 'Beans',
    proteinEmoji: '🫘',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(DRY_CHANA_MASALA_1LB_GROUPS),
    },
    steps: DRY_CHANA_MASALA_STEPS,
    chefTip: 'Crispy spiced chickpeas with bold Pindi-style dry masala — ready in 15 minutes. 19g protein, 290 kcal, 15m cook time.',
    createdAt: 0,
  },
  {
    id: 'builtin-beans-masoor-dal-curry',
    name: 'Masoor Dal Curry',
    proteinId: 'beans',
    proteinName: 'Beans',
    proteinEmoji: '🫘',
    ingredients: {
      ...defaultIngredientsByTier(),
      '1lb': flattenIngredientGroups(MASOOR_DAL_CURRY_1LB_GROUPS),
    },
    steps: MASOOR_DAL_CURRY_STEPS,
    chefTip: 'Silky red lentil curry — fast, nutritious and packed with plant protein. 18g protein, 260 kcal, 12m cook time.',
    createdAt: 0,
  },
];

export function getBuiltInRecipeById(recipeId: string): SavedRecipe | null {
  return BUILTIN_RECIPES.find((r) => r.id === recipeId) ?? null;
}

export async function getRecipeById(recipeId: string): Promise<SavedRecipe | null> {
  const saved = await getRecipes();
  const found = saved.find((r) => r.id === recipeId);
  if (found) return found;
  return getBuiltInRecipeById(recipeId);
}
