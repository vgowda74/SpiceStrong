import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ImageBackground,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QUANTITY_TIERS, type QuantityTier, type SavedRecipe, type MealType, saveRecipe as upsertRecipe } from '../../src/store/recipes';
import { generateAllRecipeImages, saveRecipeImages, type RecipeImageResults } from '../../services/imageGenerationService';
import { saveAIRecipe, uploadRecipeHeroImage, updateRecipeStatus } from '../../services/recipeService';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

/** Max AI recipes allowed PER PROTEIN TYPE for free users. Set to 0 for unlimited.
 * Change this single constant to adjust the limit for all proteins at launch. */
const MAX_FREE_AI_RECIPES_PER_PROTEIN = __DEV__ ? 0 : 1;

/** AsyncStorage key for per-protein AI recipe count */
const AI_COUNT_KEY_PREFIX = 'aiRecipeCount_';

/** Beta-enabled proteins for AI builder. Empty array = all enabled. */
const BETA_AI_PROTEINS = ['chicken', 'paneer', 'eggs'];

/** Protein emoji & name lookup for the limit modal */
const PROTEIN_INFO: Record<string, { name: string; emoji: string }> = {
  chicken: { name: 'Chicken', emoji: '🍗' },
  paneer: { name: 'Paneer', emoji: '🧀' },
  eggs: { name: 'Eggs', emoji: '🥚' },
  lamb: { name: 'Lamb', emoji: '🥩' },
  goat: { name: 'Goat', emoji: '🐐' },
  pork: { name: 'Pork', emoji: '🥓' },
  fish: { name: 'Fish', emoji: '🐟' },
  prawns: { name: 'Prawns', emoji: '🦐' },
  tofu: { name: 'Tofu', emoji: '🟫' },
  soy: { name: 'Soy', emoji: '🫘' },
  beans: { name: 'Beans', emoji: '🫘' },
  milk: { name: 'Milk', emoji: '🥛' },
  whey: { name: 'Whey', emoji: '🥤' },
};

const ACCENT = '#E85D26';
const GLASS = 'rgba(255,255,255,0.1)';
const BORDER_LIGHT = 'rgba(255,255,255,0.2)';

const VEG_PROTEIN_IDS = ['paneer', 'tofu', 'soy', 'beans', 'milk', 'whey'];
const DRINK_PROTEIN_IDS = ['milk', 'whey'];

// Meat type options per protein
const MEAT_TYPE_MAP: Record<string, { id: string; label: string }[]> = {
  chicken: [
    { id: 'drumstick', label: '🍗 Drumstick' },
    { id: 'boneless', label: '🥩 Boneless' },
    { id: 'bone-in', label: '🦴 Bone-In' },
    { id: 'minced', label: '🫕 Minced' },
  ],
  lamb: [
    { id: 'boneless', label: '🥩 Boneless' },
    { id: 'bone-in', label: '🦴 Bone-In' },
    { id: 'minced', label: '🫕 Minced' },
  ],
  pork: [
    { id: 'boneless', label: '🥩 Boneless' },
    { id: 'bone-in', label: '🦴 Bone-In' },
    { id: 'minced', label: '🫕 Minced' },
  ],
  goat: [
    { id: 'boneless', label: '🥩 Boneless' },
    { id: 'bone-in', label: '🦴 Bone-In' },
    { id: 'minced', label: '🫕 Minced' },
  ],
  fish: [
    { id: 'fillet', label: '🐟 Fillet' },
    { id: 'whole', label: '🐠 Whole' },
    { id: 'boneless', label: '🥩 Boneless' },
  ],
  prawns: [
    { id: 'whole', label: '🦐 Whole' },
    { id: 'peeled', label: '🍤 Peeled' },
  ],
};

const PROTEIN_GOAL_OPTIONS = [
  { id: 'under-20', label: '🥗 Under 20g' },
  { id: '20-plus', label: '💪 20g+' },
  { id: '30-plus', label: '🔥 30g+' },
];

const MEAL_TYPE_OPTIONS = [
  { id: 'breakfast', label: '🌅 Breakfast' },
  { id: 'lunch-dinner', label: '🥗 Lunch/Dinner' },
  { id: 'snack', label: '🥜 Snack/Dessert/Drink' },
];

const COOKING_TIME_OPTIONS = [
  { id: 'under-20', label: '⚡ Under 20 Min' },
  { id: '30-min', label: '🕐 30 Min' },
  { id: 'slow-cook', label: '🍲 Slow Cook' },
];

const SPICE_LEVEL_OPTIONS = [
  { id: 'mild', label: '😌 Mild' },
  { id: 'medium', label: '🌶️ Medium' },
  { id: 'hot', label: '🔥 Hot' },
  { id: 'extra-hot', label: '💀 Extra Hot' },
];

const DIETARY_OPTIONS = [
  { id: 'low-carb', label: '🥦 Low Carb' },
  { id: 'gluten-free', label: '🌾 Gluten Free' },
  { id: 'low-fat', label: '💧 Low Fat' },
  { id: 'vegan', label: '🌱 Vegan' },
  { id: 'dairy-free', label: '🥛 Dairy Free' },
];

const CUISINE_OPTIONS = [
  { id: 'indian', label: '🇮🇳 Indian' },
  { id: 'thai', label: '🇹🇭 Thai' },
  { id: 'mediterranean', label: '🫒 Mediterranean' },
  { id: 'chinese', label: '🇨🇳 Chinese' },
  { id: 'mexican', label: '🇲🇽 Mexican' },
  { id: 'american', label: '🇺🇸 American' },
];

// Drink/shake-specific options for milk & whey
const DRINK_MEAL_OPTIONS = [
  { id: 'pre-workout', label: '💪 Pre-Workout' },
  { id: 'post-workout', label: '🏋️ Post-Workout' },
  { id: 'breakfast', label: '🌅 Breakfast' },
  { id: 'snack', label: '🥜 Snack' },
];

const DRINK_TYPE_OPTIONS = [
  { id: 'smoothie', label: '🥤 Smoothie' },
  { id: 'shake', label: '🥛 Protein Shake' },
  { id: 'lassi', label: '🫗 Lassi' },
  { id: 'overnight-oats', label: '🥣 Overnight Oats' },
  { id: 'paneer-dish', label: '🧀 Paneer Dish' },
];

const DRINK_FLAVOR_OPTIONS = [
  { id: 'chocolate', label: '🍫 Chocolate' },
  { id: 'vanilla', label: '🍦 Vanilla' },
  { id: 'mango', label: '🥭 Mango' },
  { id: 'banana', label: '🍌 Banana' },
  { id: 'berry', label: '🫐 Berry' },
  { id: 'coffee', label: '☕ Coffee' },
  { id: 'traditional', label: '🇮🇳 Traditional' },
];

async function callClaudeAPI(
  proteinId: string,
  proteinName: string,
  params: {
    meatType?: string;
    proteinGoal?: string;
    mealType?: string;
    cookingTime?: string;
    spiceLevel?: string;
    dietary: string[];
    cuisine: string;
  },
) {
  const parts: string[] = [];
  const isDrink = ['milk', 'whey'].includes(proteinId);
  if (isDrink) {
    if (params.meatType) parts.push(`Drink/recipe type: ${params.meatType}.`);
    if (params.proteinGoal) parts.push(`Protein goal per serving: ${params.proteinGoal}.`);
    if (params.mealType) parts.push(`Intended for: ${params.mealType}.`);
    if (params.spiceLevel) parts.push(`Flavor: ${params.spiceLevel}.`);
    if (params.dietary.length > 0) parts.push(`Dietary requirements: ${params.dietary.join(', ')}.`);
  } else {
    if (params.meatType) parts.push(`Meat cut/type: ${params.meatType}.`);
    if (params.proteinGoal) parts.push(`Protein goal per serving: ${params.proteinGoal}.`);
    if (params.mealType) parts.push(`Meal type: ${params.mealType}.`);
    if (params.cookingTime) parts.push(`Cooking time: ${params.cookingTime}.`);
    if (params.spiceLevel) parts.push(`Spice level: ${params.spiceLevel}.`);
    if (params.dietary.length > 0) parts.push(`Dietary requirements: ${params.dietary.join(', ')}.`);
    parts.push(`Cuisine style: ${params.cuisine || 'Indian'}.`);
  }

  const constraintsText = parts.join(' ');

  // Determine if this is a dessert/snack — single serving mode
  const isSnackDessert = params.mealType?.toLowerCase().includes('snack') || params.mealType?.toLowerCase().includes('dessert');

  const ingredientStructure = isSnackDessert
    ? `"ingredients": {
    "2-3 servings": [
      {
        "category": "PROTEIN",
        "categoryEmoji": "🍗",
        "name": "Ingredient name",
        "quantity": "1 cup"
      }
    ]
  }`
    : `"ingredients": {
    "2-3 servings": [
      {
        "category": "PROTEIN",
        "categoryEmoji": "🍗",
        "name": "Ingredient name",
        "quantity": "1 cup"
      }
    ],
    "4-6 servings": [
      {
        "category": "PROTEIN",
        "categoryEmoji": "🍗",
        "name": "Ingredient name",
        "quantity": "2 cups"
      }
    ]
  }`;

  const servingRule = isSnackDessert
    ? '- This is a dessert/snack: provide ingredients for 1 SERVING only under "2-3 servings" key. User will multiply as needed.'
    : '- Provide ingredients for BOTH "2-3 servings" and "4-6 servings" tiers. The 4-6 servings should be roughly 2x the 2-3 servings quantities.';

  const systemPrompt = `You are a professional chef and nutritionist. Generate a complete high-protein recipe and return ONLY valid JSON.

Return this exact JSON structure:
{
  "name": "Recipe Name",
  "proteinId": "chicken|lamb|fish|prawns|pork|goat|paneer|tofu|eggs|soy|beans|milk|whey",
  "proteinName": "Chicken",
  "proteinEmoji": "🍗",
  "description": "One line description",
  "cookTime": "25 min",
  "difficulty": "Easy|Medium|Hard",
  "protein": "32g",
  "calories": "320 kcal",
  "fatG": 12,
  "carbsG": 15,
  "fiberG": 3,
  "sugarG": 4,
  "sodiumMg": 450,
  "mealType": "breakfast|lunch_dinner|snack_dessert",
  ${ingredientStructure},
  "steps": [
    {
      "id": "step1",
      "title": "Step Title",
      "emoji": "🔥",
      "description": "Full step instruction",
      "tip": "Chef tip for this step",
      "timerSeconds": 300
    }
  ]
}

Rules:
- Always make it high protein and healthy
- 4-8 cooking steps maximum
- timerSeconds: use realistic times (300 = 5 min)
- Return ONLY the JSON object, no other text
- proteinId must match one of the options exactly
- mealType must be one of: breakfast, lunch_dinner, snack_dessert
${servingRule}
${constraintsText}`;

  const userMessage = `Generate a complete high-protein ${proteinName} recipe. ${constraintsText}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const errMsg = data.error?.message ?? JSON.stringify(data);
    console.error(`[SpiceStrong] Claude API error (${response.status}):`, errMsg);
    throw new Error(errMsg);
  }
  const text = data.content?.[0]?.text ?? '';
  console.log('[SpiceStrong] Raw Claude response length:', text.length);
  // Strip markdown fences and any text before/after the JSON object
  let cleaned = text.replace(/```json|```/g, '').trim();
  // Extract JSON object — find first { and last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  // Remove control characters that can break JSON.parse
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, (ch) => (ch === '\n' || ch === '\r' || ch === '\t' ? ch : ''));
  try {
    return JSON.parse(cleaned);
  } catch (parseErr) {
    console.error('[SpiceStrong] JSON parse failed. First 500 chars:', cleaned.substring(0, 500));
    throw parseErr;
  }
}

function normalizeAIIngredients(ingredients: unknown): SavedRecipe['ingredients'] {
  const tiers = QUANTITY_TIERS as readonly string[];
  const result: Record<string, { name: string; quantity: string }[]> = {};
  for (const tier of tiers) {
    result[tier] = [];
  }
  if (ingredients && typeof ingredients === 'object' && !Array.isArray(ingredients)) {
    const obj = ingredients as Record<string, unknown>;
    for (const tier of tiers) {
      if (Array.isArray(obj[tier])) {
        result[tier] = (obj[tier] as { name?: string; quantity?: string }[]).map((item) =>
          item && typeof item === 'object'
            ? { name: String(item.name ?? ''), quantity: String(item.quantity ?? '') }
            : { name: '', quantity: '' }
        );
      }
    }
    // Fallback: if AI returns '1lb' key, map to '2-3 servings'
    if (result['2-3 servings'].length === 0 && Array.isArray(obj['1lb'])) {
      result['2-3 servings'] = (obj['1lb'] as { name?: string; quantity?: string }[]).map((item) =>
        item && typeof item === 'object'
          ? { name: String(item.name ?? ''), quantity: String(item.quantity ?? '') }
          : { name: '', quantity: '' }
      );
    }
  }
  return result as SavedRecipe['ingredients'];
}

/** Save AI-generated recipe data, updating the placeholder with the given id. */
async function saveRecipeFromAI(recipe: Record<string, unknown>, existingId: string): Promise<SavedRecipe> {
  const steps = (recipe.steps as { title?: string; description?: string; emoji?: string; tip?: string; timerSeconds?: number }[]) ?? [];
  const stepsNormalized = steps.map((s) => ({
    title: s.title ?? '',
    description: s.description ?? '',
    emoji: s.emoji,
    tip: s.tip,
    timerMinutes: typeof s.timerSeconds === 'number' ? Math.round(s.timerSeconds / 60) : undefined,
  }));

  // Determine mealType from AI response or default
  const mealTypeRaw = String(recipe.mealType ?? 'lunch_dinner');
  const validMealTypes: MealType[] = ['breakfast', 'lunch_dinner', 'snack_dessert'];
  const mealType: MealType = validMealTypes.includes(mealTypeRaw as MealType) ? (mealTypeRaw as MealType) : 'lunch_dinner';

  // Parse AI nutrition values
  const parseNum = (v: unknown) => (typeof v === 'number' ? v : parseInt(String(v ?? '0'), 10) || 0);
  const parseCalStr = (v: unknown) => parseInt(String(v ?? '0').replace(/[^0-9]/g, ''), 10) || 0;
  const parseProteinStr = (v: unknown) => parseInt(String(v ?? '0').replace(/[^0-9]/g, ''), 10) || 0;

  const fullRecipe: SavedRecipe = {
    id: existingId,
    name: String(recipe.name ?? 'Untitled'),
    proteinId: String(recipe.proteinId ?? 'chicken'),
    proteinName: String(recipe.proteinName ?? 'Chicken'),
    proteinEmoji: String(recipe.proteinEmoji ?? '🍗'),
    description: String(recipe.description ?? ''),
    ingredients: normalizeAIIngredients(recipe.ingredients),
    steps: stepsNormalized,
    chefTip: `${String(recipe.protein ?? '0g')} protein | ${String(recipe.calories ?? '0 kcal')} | ${String(recipe.description ?? steps[0]?.tip ?? '')}`,
    createdAt: Date.now(),
    mealType,
    status: 'building', // still building until images are done
    aiNutrition: {
      calories: parseCalStr(recipe.calories),
      proteinG: parseProteinStr(recipe.protein),
      fatG: parseNum(recipe.fatG),
      carbsG: parseNum(recipe.carbsG),
      fiberG: parseNum(recipe.fiberG),
      sugarG: parseNum(recipe.sugarG),
      sodiumMg: parseNum(recipe.sodiumMg),
    },
  };

  await upsertRecipe(fullRecipe);
  return fullRecipe;
}

// Chip row helper
function ChipRow({
  options,
  selected,
  onSelect,
  multi = false,
  disabled = false,
  compact = false,
}: {
  options: { id: string; label: string }[];
  selected: string | string[];
  onSelect: (id: string) => void;
  multi?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const visibleOptions = compact
    ? options.filter((opt) =>
        multi ? (selected as string[]).includes(opt.id) : selected === opt.id,
      )
    : options;
  if (compact && visibleOptions.length === 0) return null;
  return (
    <View style={styles.chipsWrap}>
      {visibleOptions.map((opt) => {
        const active = multi
          ? (selected as string[]).includes(opt.id)
          : selected === opt.id;
        return (
          <TouchableOpacity
            key={opt.id}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(opt.id)}
            disabled={disabled || compact}
            activeOpacity={compact ? 1 : 0.8}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AIRecipeBuilderScreen() {
  const router = useRouter();
  const { proteinId: paramProteinId, proteinName: paramProteinName, proteinEmoji } = useLocalSearchParams<{
    proteinId?: string;
    proteinName?: string;
    proteinEmoji?: string;
  }>();

  const [selectedMeatType, setSelectedMeatType] = useState<string>('');
  const [selectedProteinGoal, setSelectedProteinGoal] = useState<string>('20-plus');
  const [selectedMealType, setSelectedMealType] = useState<string>('lunch-dinner');
  const [selectedCookingTime, setSelectedCookingTime] = useState<string>('');
  const [selectedSpiceLevel, setSelectedSpiceLevel] = useState<string>('medium');
  const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
  const [selectedCuisine, setSelectedCuisine] = useState<string>('indian');
  const [loading, setLoading] = useState(false);
  const [generatedRecipe, setGeneratedRecipe] = useState<Record<string, unknown> | null>(null);
  const [filtersConfirmed, setFiltersConfirmed] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [availableProteins, setAvailableProteins] = useState<{ id: string; name: string; emoji: string }[]>([]);

  const isVegProtein = VEG_PROTEIN_IDS.includes(paramProteinId ?? '');
  const isDrinkProtein = DRINK_PROTEIN_IDS.includes(paramProteinId ?? '');
  const meatTypeOptions = MEAT_TYPE_MAP[paramProteinId ?? ''] ?? [];
  const showMeatType = !isVegProtein && meatTypeOptions.length > 0;

  // Drink proteins (milk/whey) have different state
  const [selectedDrinkType, setSelectedDrinkType] = useState<string>('smoothie');
  const [selectedDrinkFlavor, setSelectedDrinkFlavor] = useState<string>('');

  // Filter dietary options contextually
  const visibleDietary = useMemo(() => {
    if (isDrinkProtein) {
      // For milk/whey: only show relevant dietary options
      return DIETARY_OPTIONS.filter((d) => ['low-carb', 'low-fat', 'dairy-free'].includes(d.id));
    }
    if (isVegProtein) {
      return DIETARY_OPTIONS;
    }
    // Non-veg: don't show vegan
    return DIETARY_OPTIONS.filter((d) => d.id !== 'vegan');
  }, [isVegProtein, isDrinkProtein]);

  const toggleDietary = (id: string) => {
    setSelectedDietary((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  };

  // Build selected keywords summary
  const selectedKeywords = useMemo(() => {
    const tags: string[] = [];
    if (isDrinkProtein) {
      if (selectedDrinkType) {
        const dt = DRINK_TYPE_OPTIONS.find((o) => o.id === selectedDrinkType);
        if (dt) tags.push(dt.label);
      }
      if (selectedDrinkFlavor) {
        const df = DRINK_FLAVOR_OPTIONS.find((o) => o.id === selectedDrinkFlavor);
        if (df) tags.push(df.label);
      }
      if (selectedProteinGoal) {
        const pg = PROTEIN_GOAL_OPTIONS.find((o) => o.id === selectedProteinGoal);
        if (pg) tags.push(pg.label);
      }
      if (selectedMealType) {
        const ml = DRINK_MEAL_OPTIONS.find((o) => o.id === selectedMealType);
        if (ml) tags.push(ml.label);
      }
    } else {
      if (showMeatType && selectedMeatType) {
        const mt = meatTypeOptions.find((o) => o.id === selectedMeatType);
        if (mt) tags.push(mt.label);
      }
      if (selectedProteinGoal) {
        const pg = PROTEIN_GOAL_OPTIONS.find((o) => o.id === selectedProteinGoal);
        if (pg) tags.push(pg.label);
      }
      if (selectedMealType) {
        const ml = MEAL_TYPE_OPTIONS.find((o) => o.id === selectedMealType);
        if (ml) tags.push(ml.label);
      }
      if (selectedCookingTime) {
        const ct = COOKING_TIME_OPTIONS.find((o) => o.id === selectedCookingTime);
        if (ct) tags.push(ct.label);
      }
      if (selectedSpiceLevel) {
        const sl = SPICE_LEVEL_OPTIONS.find((o) => o.id === selectedSpiceLevel);
        if (sl) tags.push(sl.label);
      }
      if (selectedCuisine) {
        const c = CUISINE_OPTIONS.find((o) => o.id === selectedCuisine);
        if (c) tags.push(c.label);
      }
    }
    selectedDietary.forEach((id) => {
      const d = DIETARY_OPTIONS.find((o) => o.id === id);
      if (d) tags.push(d.label);
    });
    return tags;
  }, [isDrinkProtein, showMeatType, selectedMeatType, selectedDrinkType, selectedDrinkFlavor, selectedProteinGoal, selectedMealType, selectedCookingTime, selectedSpiceLevel, selectedDietary, selectedCuisine, meatTypeOptions]);

  const handleGenerate = async () => {
    if (!ANTHROPIC_KEY) {
      Alert.alert('', 'AI is not configured. Set EXPO_PUBLIC_ANTHROPIC_KEY.');
      return;
    }
    // Beta protein restriction
    if (BETA_AI_PROTEINS.length > 0 && !BETA_AI_PROTEINS.includes(paramProteinId ?? '')) {
      Alert.alert('Coming Soon', 'SpiceBuilder recipes for this protein will be available soon!');
      return;
    }
    // Enforce AI recipe limit PER PROTEIN (permanent counter — survives recipe deletion)
    if (MAX_FREE_AI_RECIPES_PER_PROTEIN > 0) {
      try {
        const countKey = `${AI_COUNT_KEY_PREFIX}${paramProteinId}`;
        const countStr = await AsyncStorage.getItem(countKey);
        const aiCount = countStr ? parseInt(countStr, 10) : 0;
        if (aiCount >= MAX_FREE_AI_RECIPES_PER_PROTEIN) {
          // Find other beta proteins the user can still generate for
          const others: { id: string; name: string; emoji: string }[] = [];
          for (const pid of BETA_AI_PROTEINS) {
            if (pid === paramProteinId) continue;
            const otherKey = `${AI_COUNT_KEY_PREFIX}${pid}`;
            const otherStr = await AsyncStorage.getItem(otherKey);
            const otherCount = otherStr ? parseInt(otherStr, 10) : 0;
            if (otherCount < MAX_FREE_AI_RECIPES_PER_PROTEIN) {
              const info = PROTEIN_INFO[pid];
              if (info) others.push({ id: pid, ...info });
            }
          }
          setAvailableProteins(others);
          setShowLimitModal(true);
          return;
        }
      } catch { /* proceed if check fails */ }
    }

    const proteinId = paramProteinId ?? 'chicken';
    const proteinName = paramProteinName ?? 'Chicken';
    const proteinEmojiVal = proteinEmoji ?? '🍗';

    // Save placeholder recipe immediately with status: 'building'
    const placeholderId = Date.now().toString();
    const placeholder: SavedRecipe = {
      id: placeholderId,
      name: `Custom ${proteinName} Recipe`,
      proteinId,
      proteinName,
      proteinEmoji: proteinEmojiVal,
      description: 'Your AI recipe is being crafted...',
      ingredients: { '2-3 servings': [], '4-6 servings': [] },
      steps: [],
      chefTip: '',
      createdAt: Date.now(),
      mealType: 'lunch_dinner',
      status: 'building',
    };

    try {
      // Save placeholder to AsyncStorage + Supabase (via recipeService)
      await saveAIRecipe(placeholder);

      // Increment permanent AI recipe counter for this protein
      try {
        const countKey = `${AI_COUNT_KEY_PREFIX}${paramProteinId}`;
        const countStr = await AsyncStorage.getItem(countKey);
        const aiCount = countStr ? parseInt(countStr, 10) : 0;
        await AsyncStorage.setItem(countKey, String(aiCount + 1));
      } catch { /* non-critical */ }
    } catch (e) {
      console.error(e);
      Alert.alert('', 'Could not save recipe, try again');
      return;
    }

    // Show confirmation and navigate to recipe list
    Alert.alert(
      'Recipe is Being Crafted!',
      `Your custom ${proteinName} recipe will be ready in a few minutes. Check back under ${proteinName} recipes soon!`,
    );
    router.back();

    // Fire-and-forget: generate recipe + images in background
    const findLabel = (options: { id: string; label: string }[], id: string) =>
      options.find((o) => o.id === id)?.label.replace(/^.\s/, '') ?? '';

    (async () => {
      let saved: SavedRecipe | null = null;
      try {
        // Step 1: Generate recipe via Claude API
        console.log('[SpiceStrong] Background: generating recipe...');
        const result = await callClaudeAPI(
          proteinId,
          proteinName,
          isDrinkProtein
            ? {
                meatType: findLabel(DRINK_TYPE_OPTIONS, selectedDrinkType),
                proteinGoal: findLabel(PROTEIN_GOAL_OPTIONS, selectedProteinGoal),
                mealType: findLabel(DRINK_MEAL_OPTIONS, selectedMealType),
                cookingTime: undefined,
                spiceLevel: selectedDrinkFlavor ? findLabel(DRINK_FLAVOR_OPTIONS, selectedDrinkFlavor) : undefined,
                dietary: selectedDietary.map((id) => findLabel(DIETARY_OPTIONS, id)),
                cuisine: '',
              }
            : {
                meatType: showMeatType ? findLabel(meatTypeOptions, selectedMeatType) : undefined,
                proteinGoal: findLabel(PROTEIN_GOAL_OPTIONS, selectedProteinGoal),
                mealType: findLabel(MEAL_TYPE_OPTIONS, selectedMealType),
                cookingTime: findLabel(COOKING_TIME_OPTIONS, selectedCookingTime),
                spiceLevel: findLabel(SPICE_LEVEL_OPTIONS, selectedSpiceLevel),
                dietary: selectedDietary.map((id) => findLabel(DIETARY_OPTIONS, id)),
                cuisine: findLabel(CUISINE_OPTIONS, selectedCuisine),
              },
        );

        // Step 2: Save full recipe (update placeholder) — stays in 'building' status
        console.log('[SpiceStrong] Background: recipe generated, saving...');
        saved = await saveRecipeFromAI(result, placeholderId);
        await saveAIRecipe(saved); // Save to AsyncStorage + sync to Supabase
        console.log('[SpiceStrong] Background: recipe saved, generating images...');

        // Step 3: Generate DALL-E images
        const imageResults = await generateAllRecipeImages({
          id: saved.id,
          name: String(result.name ?? ''),
          ingredients: result.ingredients as Record<string, { name: string; quantity?: string }[]>,
          steps: (result.steps as { title?: string; description?: string }[]) ?? [],
        });
        await saveRecipeImages(saved.id, imageResults);

        // Step 3b: Upload hero image to Supabase Storage (best-effort)
        if (imageResults.dishImage) {
          uploadRecipeHeroImage(saved.id, imageResults.dishImage).catch(() => {});
        }

        // Step 4: Mark recipe as ready only after images are done
        saved.status = 'ready';
        await saveAIRecipe(saved); // Update locally + Supabase
        updateRecipeStatus(saved.id, 'ready').catch(() => {}); // Explicit status update
        console.log('[SpiceStrong] Background: recipe complete with images!');
      } catch (err) {
        console.error('[SpiceStrong] Background recipe generation failed:', err);
        // Mark as ready so it doesn't stay stuck in building state
        try {
          const toFix = saved ?? placeholder;
          toFix.status = 'ready';
          if (!saved) toFix.description = 'Recipe generation failed. Please delete and try again.';
          await saveAIRecipe(toFix);
        } catch { /* best effort */ }
      }
    })();
  };

  const ingredientCount = generatedRecipe?.ingredients
    ? Object.values(generatedRecipe.ingredients as Record<string, unknown[]>).flat().length
    : 0;
  const stepCount = Array.isArray(generatedRecipe?.steps) ? (generatedRecipe!.steps as unknown[]).length : 0;

  return (
    <ImageBackground
      source={require('../../assets/images/splash-bg.png')}
      style={styles.bg}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>SpiceBuilder</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Protein info */}
          {paramProteinName && (
            <View style={styles.proteinBanner}>
              <Text style={styles.proteinBannerEmoji}>{proteinEmoji ?? '🍽️'}</Text>
              <Text style={styles.proteinBannerText}>{paramProteinName} Recipe</Text>
            </View>
          )}

          {/* Show filters only before generation */}
          {!generatedRecipe && (
            <>
              {isDrinkProtein ? (
                <>
                  {/* Drink Type */}
                  <Text style={styles.sectionLabel}>🥤 Type</Text>
                  <ChipRow
                    options={DRINK_TYPE_OPTIONS}
                    selected={selectedDrinkType}
                    onSelect={setSelectedDrinkType}
                    disabled={loading}
                    compact={filtersConfirmed}
                  />

                  {/* Flavor */}
                  {(!filtersConfirmed || selectedDrinkFlavor) && (
                    <>
                      <Text style={styles.sectionLabel}>🎨 Flavor</Text>
                      <ChipRow
                        options={DRINK_FLAVOR_OPTIONS}
                        selected={selectedDrinkFlavor}
                        onSelect={setSelectedDrinkFlavor}
                        disabled={loading}
                        compact={filtersConfirmed}
                      />
                    </>
                  )}

                  {/* Protein Goal */}
                  <Text style={styles.sectionLabel}>🎯 Protein Goal</Text>
                  <ChipRow
                    options={PROTEIN_GOAL_OPTIONS}
                    selected={selectedProteinGoal}
                    onSelect={setSelectedProteinGoal}
                    disabled={loading}
                    compact={filtersConfirmed}
                  />

                  {/* Meal Type — drink-specific */}
                  <Text style={styles.sectionLabel}>🍽️ When</Text>
                  <ChipRow
                    options={DRINK_MEAL_OPTIONS}
                    selected={selectedMealType}
                    onSelect={setSelectedMealType}
                    disabled={loading}
                    compact={filtersConfirmed}
                  />

                  {/* Dietary Preference */}
                  {(!filtersConfirmed || selectedDietary.length > 0) && (
                    <>
                      <Text style={styles.sectionLabel}>🥗 Dietary Preference</Text>
                      <ChipRow
                        options={visibleDietary}
                        selected={selectedDietary}
                        onSelect={toggleDietary}
                        multi
                        disabled={loading}
                        compact={filtersConfirmed}
                      />
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* Meat Type — only for non-veg */}
                  {showMeatType && (!filtersConfirmed || selectedMeatType) && (
                    <>
                      <Text style={styles.sectionLabel}>🥩 Meat Type</Text>
                      <ChipRow
                        options={meatTypeOptions}
                        selected={selectedMeatType}
                        onSelect={setSelectedMeatType}
                        disabled={loading}
                        compact={filtersConfirmed}
                      />
                    </>
                  )}

                  {/* Protein Goal */}
                  <Text style={styles.sectionLabel}>🎯 Protein Goal</Text>
                  <ChipRow
                    options={PROTEIN_GOAL_OPTIONS}
                    selected={selectedProteinGoal}
                    onSelect={setSelectedProteinGoal}
                    disabled={loading}
                    compact={filtersConfirmed}
                  />

                  {/* Meal Type */}
                  <Text style={styles.sectionLabel}>🍽️ Meal Type</Text>
                  <ChipRow
                    options={MEAL_TYPE_OPTIONS}
                    selected={selectedMealType}
                    onSelect={setSelectedMealType}
                    disabled={loading}
                    compact={filtersConfirmed}
                  />

                  {/* Cooking Time */}
                  {(!filtersConfirmed || selectedCookingTime) && (
                    <>
                      <Text style={styles.sectionLabel}>⏱️ Cooking Time</Text>
                      <ChipRow
                        options={COOKING_TIME_OPTIONS}
                        selected={selectedCookingTime}
                        onSelect={setSelectedCookingTime}
                        disabled={loading}
                        compact={filtersConfirmed}
                      />
                    </>
                  )}

                  {/* Spice Level */}
                  <Text style={styles.sectionLabel}>🌶️ Spice Level</Text>
                  <ChipRow
                    options={SPICE_LEVEL_OPTIONS}
                    selected={selectedSpiceLevel}
                    onSelect={setSelectedSpiceLevel}
                    disabled={loading}
                    compact={filtersConfirmed}
                  />

                  {/* Dietary Preference */}
                  {(!filtersConfirmed || selectedDietary.length > 0) && (
                    <>
                      <Text style={styles.sectionLabel}>🥗 Dietary Preference</Text>
                      <ChipRow
                        options={visibleDietary}
                        selected={selectedDietary}
                        onSelect={toggleDietary}
                        multi
                        disabled={loading}
                        compact={filtersConfirmed}
                      />
                    </>
                  )}

                  {/* Cuisine Style */}
                  <Text style={styles.sectionLabel}>🌍 Cuisine Style</Text>
                  <ChipRow
                    options={CUISINE_OPTIONS}
                    selected={selectedCuisine}
                    onSelect={setSelectedCuisine}
                    disabled={loading}
                    compact={filtersConfirmed}
                  />
                </>
              )}
            </>
          )}

          {/* Confirm / Generate / Edit buttons */}
          {!generatedRecipe && !filtersConfirmed && (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setFiltersConfirmed(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>✓ Confirm Selections</Text>
            </TouchableOpacity>
          )}
          {!generatedRecipe && filtersConfirmed && (
            <>
              <TouchableOpacity
                style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
                onPress={handleGenerate}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>🍳 Generate Recipe with SpiceBuilder</Text>
              </TouchableOpacity>
              {!loading && (
                <TouchableOpacity
                  style={styles.editFiltersBtn}
                  onPress={() => setFiltersConfirmed(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.editFiltersBtnText}>✏️ Edit Selections</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {loading && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={ACCENT} />
              <Text style={styles.loadingText}>🍳 SpiceBuilder is crafting your recipe...</Text>
            </View>
          )}

          {/* Recipe generation submitted — no preview needed, generating in background */}
          {false && (
            <View />
          )}
        </ScrollView>
      </View>

      {/* ===== Beta Limit Modal ===== */}
      <Modal
        visible={showLimitModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLimitModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {/* Close X */}
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowLimitModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>

            {/* Rocket emoji */}
            <Text style={styles.modalEmoji}>🚀</Text>

            {/* Title */}
            <Text style={styles.modalTitle}>Beta Limit Reached</Text>

            {/* Message */}
            <Text style={styles.modalMessage}>
              You've used your beta AI recipe for{' '}
              <Text style={styles.modalProteinHighlight}>{paramProteinName}</Text>.
              {'\n\n'}Full launch unlocks unlimited AI recipes.{'\n'}Stay tuned! 🚀
            </Text>

            {/* Other available proteins */}
            {availableProteins.length > 0 && (
              <View style={styles.modalOtherSection}>
                <Text style={styles.modalOtherTitle}>You can still generate for:</Text>
                <View style={styles.modalOtherRow}>
                  {availableProteins.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.modalOtherChip}
                      onPress={() => {
                        setShowLimitModal(false);
                        router.replace({
                          pathname: '/screens/AIRecipeBuilderScreen',
                          params: {
                            proteinId: p.id,
                            proteinName: p.name,
                            proteinEmoji: p.emoji,
                          },
                        });
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.modalOtherChipText}>{p.emoji} {p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Dismiss button */}
            <TouchableOpacity
              style={styles.modalDismissBtn}
              onPress={() => {
                setShowLimitModal(false);
                router.back();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.modalDismissBtnText}>Back to Recipes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: { padding: 8 },
  backText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  headerSpacer: { width: 44 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  proteinBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GLASS,
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
  },
  proteinBannerEmoji: { fontSize: 28, marginRight: 10 },
  proteinBannerText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  sectionLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  chip: {
    backgroundColor: GLASS,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
  },
  chipActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  chipText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  primaryBtn: {
    backgroundColor: ACCENT,
    borderRadius: 16,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  editFiltersBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: -16,
    marginBottom: 16,
  },
  editFiltersBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: { color: '#fff', fontSize: 16, marginTop: 16, fontWeight: '600' },

  // Keywords summary after generation
  keywordsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  keywordTag: {
    backgroundColor: 'rgba(232,93,38,0.25)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.4)',
  },
  keywordTagText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  // Preview card
  previewCard: {
    backgroundColor: GLASS,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
  },
  previewName: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  previewDesc: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginBottom: 12 },
  previewMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  previewMetaText: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  previewMetaDot: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  previewCounts: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 20 },
  previewActions: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  saveBtn: {
    flex: 1,
    backgroundColor: ACCENT,
    borderRadius: 16,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  regenBtn: {
    flex: 1,
    backgroundColor: BORDER_LIGHT,
    borderRadius: 16,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regenBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  regenFullBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
  },
  regenFullBtnText: { color: 'rgba(255,255,255,0.8)', fontWeight: '600', fontSize: 14 },

  // Beta Limit Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#1A0A00',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(232,93,38,0.35)',
    ...Platform.select({
      ios: { shadowColor: '#E85D26', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 16 },
    }),
  },
  modalClose: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '600',
  },
  modalEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  modalTitle: {
    color: '#E85D26',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 14,
    textAlign: 'center',
  },
  modalMessage: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalProteinHighlight: {
    color: '#E85D26',
    fontWeight: '800',
  },
  modalOtherSection: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalOtherTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  modalOtherRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  modalOtherChip: {
    backgroundColor: 'rgba(232,93,38,0.2)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.4)',
  },
  modalOtherChipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  modalDismissBtn: {
    backgroundColor: '#E85D26',
    borderRadius: 16,
    height: 50,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#E85D26', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
    }),
  },
  modalDismissBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
