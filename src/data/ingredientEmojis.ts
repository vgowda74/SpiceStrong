/**
 * ingredientEmojis.ts — SpiceStrong
 * Maps ingredient names to specific food emojis for visual display.
 * Falls back to category emoji if no specific match found.
 */

const INGREDIENT_EMOJI_MAP: Record<string, string> = {
  // Proteins
  chicken: '🍗', 'chicken breast': '🍗', 'chicken thigh': '🍗', 'ground chicken': '🍗',
  beef: '🥩', steak: '🥩', 'ground beef': '🥩', sirloin: '🥩',
  lamb: '🥩', mutton: '🥩', 'ground lamb': '🥩',
  goat: '🐐', 'goat meat': '🐐',
  pork: '🥓', 'pork tenderloin': '🥓', bacon: '🥓',
  fish: '🐟', salmon: '🐟', tuna: '🐟', cod: '🐟', tilapia: '🐟',
  prawn: '🦐', prawns: '🦐', shrimp: '🦐',
  egg: '🥚', eggs: '🥚', 'egg whites': '🥚',
  paneer: '🧀', cheese: '🧀', 'cottage cheese': '🧀',
  tofu: '🟫', tempeh: '🟫',
  turkey: '🦃',

  // Vegetables
  onion: '🧅', 'red onion': '🧅', 'spring onion': '🧅', shallot: '🧅',
  garlic: '🧄',
  tomato: '🍅', tomatoes: '🍅', 'tomato puree': '🍅', 'tomato paste': '🍅',
  potato: '🥔', 'sweet potato': '🍠',
  carrot: '🥕', carrots: '🥕',
  broccoli: '🥦',
  corn: '🌽',
  pepper: '🌶️', 'bell pepper': '🫑', capsicum: '🫑', 'green pepper': '🫑', 'red pepper': '🫑', chili: '🌶️',
  spinach: '🥬', kale: '🥬', lettuce: '🥬', 'bok choy': '🥬',
  mushroom: '🍄', mushrooms: '🍄',
  cucumber: '🥒', zucchini: '🥒',
  eggplant: '🍆', aubergine: '🍆',
  ginger: '🫚',
  peas: '🟢', 'green peas': '🟢',
  cauliflower: '🥦',
  cabbage: '🥬',
  celery: '🥬',
  avocado: '🥑',

  // Fruits
  apple: '🍎', banana: '🍌', orange: '🍊', lemon: '🍋', lime: '🍋',
  mango: '🥭', pineapple: '🍍', strawberry: '🍓', blueberry: '🫐',
  grape: '🍇', watermelon: '🍉', peach: '🍑', cherry: '🍒',
  coconut: '🥥', 'coconut milk': '🥥', 'coconut cream': '🥥',
  dates: '🫘', raisin: '🫘',

  // Dairy
  milk: '🥛', cream: '🥛', 'heavy cream': '🥛',
  yogurt: '🥛', 'greek yogurt': '🥛', curd: '🥛',
  butter: '🧈', ghee: '🧈',

  // Grains
  rice: '🍚', 'basmati rice': '🍚', 'brown rice': '🍚',
  pasta: '🍝', noodle: '🍜', noodles: '🍜', ramen: '🍜',
  bread: '🍞', naan: '🫓', roti: '🫓', tortilla: '🫓', pita: '🫓',
  flour: '🌾', oats: '🌾', quinoa: '🌾', couscous: '🌾',

  // Legumes
  lentil: '🫘', lentils: '🫘', dal: '🫘',
  chickpea: '🫘', chickpeas: '🫘',
  beans: '🫘', 'black beans': '🫘', 'kidney beans': '🫘', rajma: '🫘',
  'soy chunks': '🫘', edamame: '🫘',

  // Spices & Condiments
  salt: '🧂', 'sea salt': '🧂',
  oil: '🫒', 'olive oil': '🫒', 'coconut oil': '🫒', 'vegetable oil': '🫒',
  honey: '🍯',
  'soy sauce': '🫙', vinegar: '🫙', ketchup: '🫙', mustard: '🫙',
  sugar: '🧂', 'brown sugar': '🧂',

  // Nuts
  peanut: '🥜', 'peanut butter': '🥜', peanuts: '🥜',
  almond: '🌰', almonds: '🌰', cashew: '🌰', walnut: '🌰',

  // Drinks
  coffee: '☕', tea: '🍵',
  water: '💧',
  'protein powder': '🏋️', whey: '🏋️', 'whey protein': '🏋️',

  // Processed/Junk
  coke: '🥤', soda: '🥤', cola: '🥤',
  chips: '🍟', fries: '🍟',
  pizza: '🍕',
  chocolate: '🍫',
  'ice cream': '🍦',
  cake: '🍰',
  cookie: '🍪', cookies: '🍪',
};

const CATEGORY_EMOJI: Record<string, string> = {
  PROTEIN: '💪',
  VEGETABLE: '🥬',
  FRUIT: '🍎',
  DAIRY: '🥛',
  GRAIN: '🌾',
  CONDIMENT: '🫙',
  SPICE: '🧂',
  PANTRY: '📦',
};

/**
 * Get the best emoji for an ingredient name.
 * Checks exact match, then partial match, then falls back to category emoji.
 */
export function getIngredientEmoji(name: string, category?: string): string {
  const lower = name.toLowerCase().trim();

  // Exact match
  if (INGREDIENT_EMOJI_MAP[lower]) return INGREDIENT_EMOJI_MAP[lower];

  // Partial match — check if any key is contained in the name
  for (const [key, emoji] of Object.entries(INGREDIENT_EMOJI_MAP)) {
    if (lower.includes(key)) return emoji;
  }

  // Reverse — check if name is contained in any key
  for (const [key, emoji] of Object.entries(INGREDIENT_EMOJI_MAP)) {
    if (key.includes(lower) && lower.length >= 3) return emoji;
  }

  // Category fallback
  if (category && CATEGORY_EMOJI[category]) return CATEGORY_EMOJI[category];

  return '🍽️';
}
