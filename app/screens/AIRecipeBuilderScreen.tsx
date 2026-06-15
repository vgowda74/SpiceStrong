import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { HomeButton } from '../../components/HomeButton';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QUANTITY_TIERS, type QuantityTier, type SavedRecipe, type MealType, saveRecipe as upsertRecipe } from '../../src/store/recipes';
import { generateAllRecipeImages, saveRecipeImages, type RecipeImageResults } from '../../services/imageGenerationService';
import { saveAIRecipe, uploadRecipeHeroImage, updateRecipeStatus, classifyAndEnrichRecipe, type RecipeSyncResult } from '../../services/recipeService';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'expo-image';
import { PROTEINS } from '../../src/theme';
import { filterProteinsForPreference, getDietPreference, hasNonVegText, isNonVegProteinId, type DietPreference } from '../../src/utils/dietPreference';

import { SPICEBUILDER_SYSTEM_PROMPT } from '../../src/prompts/spiceBuilderPrompt';
import { analyzeNutrition } from '../../services/nutritionService';
import { getDietaryRestrictions } from '../../services/dietaryService';
import { getSavedMacroTargets } from '../../services/fitnessProfileService';
import { checkLimit, recordUsage, type LimitCheck } from '../../services/subscriptionService';
import PaywallModal from '../../components/PaywallModal';
import { trackEvent } from '../../services/analyticsService';
import { logScreenView } from '../../services/firebaseAnalytics';
import { ProcessingRing } from '../../components/ProcessingRing';
import { invokeAnthropicMessages } from '../../services/anthropicService';

/** Max AI recipes allowed PER PROTEIN TYPE for free users. Set to 0 for unlimited.
 * Change this single constant to adjust the limit for all proteins at launch. */
const MAX_FREE_AI_RECIPES_PER_PROTEIN = 0; // Disabled — using global limit instead
const MAX_TOTAL_AI_RECIPES = 30;
const GLOBAL_AI_COUNT_KEY = 'spicestrong_total_ai_count';

/** AsyncStorage key for per-protein AI recipe count */
const AI_COUNT_KEY_PREFIX = 'aiRecipeCount_';

/** Enabled proteins for AI builder. Empty array = all enabled. */
const AI_ENABLED_PROTEINS: string[] = [];

/** Protein emoji & name lookup for the limit modal */
const PROTEIN_INFO: Record<string, { name: string; emoji: string }> = {
  chicken: { name: 'Chicken', emoji: '🍗' },
  beef: { name: 'Beef', emoji: '🥩' },
  paneer: { name: 'Paneer', emoji: '🧀' },
  eggs: { name: 'Eggs', emoji: '🥚' },
  lamb: { name: 'Lamb', emoji: '🥩' },
  goat: { name: 'Goat', emoji: '🐐' },
  pork: { name: 'Pork', emoji: '🥓' },
  fish: { name: 'Fish', emoji: '🐟' },
  prawns: { name: 'Prawns', emoji: '🦐' },
  tofu: { name: 'Tofu', emoji: '🟫' },
  soy: { name: 'Soy', emoji: '🫘' },
  beans: { name: 'Beans & Lentils', emoji: '🫘' },
  milk: { name: 'Dairy', emoji: '🥛' },
  whey: { name: 'Protein Powder', emoji: '🏋️' },
};

const ACCENT = '#8F3A1F';
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
  beef: [
    { id: 'steak', label: '🥩 Steak' },
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
    { id: 'salmon', label: '🐟 Salmon' },
    { id: 'tilapia', label: '🐠 Tilapia' },
    { id: 'cod', label: '🐟 Cod' },
    { id: 'tuna', label: '🐠 Tuna' },
    { id: 'mackerel', label: '🐟 Mackerel' },
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

const ALL_MEAL_TYPE_OPTIONS = [
  { id: 'breakfast', label: '🌅 Breakfast' },
  { id: 'lunch-dinner', label: '🥗 Lunch/Dinner' },
  { id: 'snack', label: '🥜 Snack/Dessert/Drink' },
];

/** Meal types suitable for each protein. Proteins not listed get all options. */
const PROTEIN_MEAL_TYPES: Record<string, string[]> = {
  chicken:  ['breakfast', 'lunch-dinner', 'snack'],
  beef:     ['lunch-dinner'],
  paneer:   ['breakfast', 'lunch-dinner', 'snack'],
  eggs:     ['breakfast', 'lunch-dinner', 'snack'],
  fish:     ['lunch-dinner'],
  prawns:   ['lunch-dinner', 'snack'],
  lamb:     ['lunch-dinner'],
  goat:     ['lunch-dinner'],
  pork:     ['breakfast', 'lunch-dinner'],
  tofu:     ['breakfast', 'lunch-dinner', 'snack'],
  soy:      ['breakfast', 'lunch-dinner', 'snack'],
  beans:    ['breakfast', 'lunch-dinner', 'snack'],
  // milk & whey use DRINK_MEAL_OPTIONS instead, handled separately
};

const COOKING_TIME_OPTIONS = [
  { id: 'under-20', label: '⚡ Under 20 Min' },
  { id: '30-min', label: '🕐 30 Min' },
  { id: 'slow-cook', label: '🍲 Slow Cook' },
];

const ALL_SPICE_LEVEL_OPTIONS = [
  { id: 'mild', label: '😌 Mild' },
  { id: 'medium', label: '🌶️ Medium' },
  { id: 'hot', label: '🔥 Hot' },
  { id: 'extra-hot', label: '💀 Extra Hot' },
];

/** Spice levels suitable for each protein. Proteins not listed get all options. */
const PROTEIN_SPICE_LEVELS: Record<string, string[]> = {
  beef:     ['mild', 'medium', 'hot', 'extra-hot'],
  fish:     ['mild', 'medium'],          // delicate fish — avoid overpowering
  prawns:   ['mild', 'medium', 'hot'],
  tofu:     ['mild', 'medium', 'hot'],   // tofu absorbs spice well but extra-hot uncommon
  beans:    ['mild', 'medium', 'hot'],
  soy:      ['mild', 'medium'],
};

const ALL_DIETARY_OPTIONS = [
  { id: 'low-carb', label: '🥦 Low Carb' },
  { id: 'gluten-free', label: '🌾 Gluten Free' },
  { id: 'low-fat', label: '💧 Low Fat' },
  { id: 'vegan', label: '🌱 Vegan' },
  { id: 'dairy-free', label: '🥛 Dairy Free' },
];

/** Dietary options suitable for each protein. Proteins not listed get contextual defaults. */
const PROTEIN_DIETARY: Record<string, string[]> = {
  chicken:  ['low-carb', 'gluten-free', 'low-fat', 'dairy-free'],
  beef:     ['low-carb', 'gluten-free', 'dairy-free'],
  fish:     ['low-carb', 'gluten-free', 'low-fat', 'dairy-free'],
  prawns:   ['low-carb', 'gluten-free', 'low-fat', 'dairy-free'],
  lamb:     ['low-carb', 'gluten-free', 'dairy-free'],
  goat:     ['low-carb', 'gluten-free', 'dairy-free'],
  pork:     ['low-carb', 'gluten-free', 'low-fat', 'dairy-free'],
  eggs:     ['low-carb', 'gluten-free', 'low-fat', 'dairy-free'],
  paneer:   ['low-carb', 'gluten-free', 'low-fat'],         // paneer is dairy — no dairy-free or vegan
  tofu:     ['low-carb', 'gluten-free', 'low-fat', 'vegan', 'dairy-free'],
  soy:      ['low-carb', 'gluten-free', 'low-fat', 'vegan', 'dairy-free'],
  beans:    ['low-carb', 'gluten-free', 'low-fat', 'vegan', 'dairy-free'],
};

const ALL_CUISINE_OPTIONS = [
  { id: 'indian', label: '🇮🇳 Indian' },
  { id: 'thai', label: '🇹🇭 Thai' },
  { id: 'mediterranean', label: '🫒 Mediterranean' },
  { id: 'chinese', label: '🇨🇳 Chinese' },
  { id: 'mexican', label: '🇲🇽 Mexican' },
  { id: 'american', label: '🇺🇸 American' },
];

/** Cuisines suitable for each protein. Proteins not listed get all options. */
const PROTEIN_CUISINES: Record<string, string[]> = {
  chicken:  ['indian', 'thai', 'mediterranean', 'chinese', 'mexican', 'american'],
  beef:     ['indian', 'thai', 'chinese', 'mexican', 'american'],
  paneer:   ['indian', 'mediterranean'],
  eggs:     ['indian', 'thai', 'mediterranean', 'chinese', 'mexican', 'american'],
  fish:     ['indian', 'thai', 'mediterranean', 'chinese', 'american'],
  prawns:   ['indian', 'thai', 'chinese', 'mediterranean', 'american'],
  lamb:     ['indian', 'mediterranean', 'mexican', 'american'],
  goat:     ['indian', 'mexican'],
  pork:     ['thai', 'chinese', 'mexican', 'american'],
  tofu:     ['indian', 'thai', 'chinese', 'mexican'],
  soy:      ['indian', 'thai', 'chinese'],
  beans:    ['indian', 'mexican', 'mediterranean', 'american'],
};

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
    targetCal?: string;
    targetProtein?: string;
    targetCarbs?: string;
    targetFat?: string;
  },
  proteinEmoji: string = '🍗',
  referenceImageBase64?: string | null,
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

  // Add macro targets
  if (params.targetCal) parts.push(`Target per serving: ~${params.targetCal} calories.`);
  if (params.targetProtein) parts.push(`Target protein: ~${params.targetProtein}g per serving.`);
  if (params.targetCarbs) parts.push(`Target carbs: ~${params.targetCarbs}g per serving.`);
  if (params.targetFat) parts.push(`Target fat: ~${params.targetFat}g per serving.`);

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

  const systemPrompt = SPICEBUILDER_SYSTEM_PROMPT + `

ADDITIONAL CONTEXT FOR THIS REQUEST:
- proteinId must be: "${proteinId}"
- proteinName must be: "${proteinName}"
- proteinEmoji must be: "${proteinEmoji}"
${servingRule}

IMPORTANT — OUTPUT FORMAT OVERRIDE:
The nutrition values ("protein", "calories", "fatG", "carbsG", etc.) must be the TOTAL for the entire "2-3 servings" batch, NOT per serving.
Formula: per-serving value × 2.5 = batch total.
Example: if per-serving protein is 37g → report "protein": "92g" (37 × 2.5 ≈ 92)

Return this exact JSON structure (no markdown, no preamble):
{
  "name": "Recipe Full Name",
  "proteinId": "${proteinId}",
  "proteinName": "${proteinName}",
  "proteinEmoji": "${proteinEmoji}",
  "description": "2 sentences max. Lead with protein content and cuisine origin.",
  "cookTime": "25 min",
  "difficulty": "Easy|Medium|Hard",
  "protein": "92g",
  "calories": "1100 kcal",
  "fatG": 30,
  "carbsG": 15,
  "fiberG": 3,
  "sugarG": 4,
  "sodiumMg": 680,
  "mealType": "breakfast|lunch_dinner|snack_dessert",
  "chefTip": "One actionable technique tip specific to this dish.",
  ${ingredientStructure},
  "steps": [
    {
      "id": "step1",
      "title": "Step Title (max 4 words)",
      "emoji": "🔥",
      "description": "Clear instruction with visual doneness cues, 2-4 sentences.",
      "tip": "Specific technique tip for this step",
      "timerSeconds": 300,
      "ingredientsUsed": "comma-separated ingredient names used in this step",
      "imagePrompt": "Short literal description of ONLY what is physically visible at this exact moment — e.g. 'spinach leaves in a pot of boiling water'. Do NOT mention the recipe name or ingredients from other steps. Max 15 words."
    }
  ]
}
${constraintsText}`;

  const userMessageText = referenceImageBase64
    ? `I have a photo of a dish. Create a high-protein recipe inspired by this dish using ${proteinName} as the primary protein. ${constraintsText}

IMPORTANT RULES FOR IMAGE-BASED RECIPES:
- If the image is NOT food (e.g. a person, landscape, object), IGNORE the image entirely and generate a standard recipe based on the filters.
- If the image shows food with a DIFFERENT protein than "${proteinName}", adapt the recipe to use ${proteinName} instead while keeping the same cooking style and flavors.
- If the image conflicts with dietary filters (e.g. image shows dairy but user selected dairy-free), prioritize the user's dietary filters.
- The recipe MUST use ${proteinName} as the primary protein regardless of what the image shows.
- Focus on recreating the cooking style, cuisine, and flavor profile from the image — not the exact ingredients.`
    : `Generate a complete high-protein ${proteinName} recipe. ${constraintsText}`;

  // Build message content — with optional reference image
  const messageContent: any = referenceImageBase64
    ? [
        { type: 'image', source: { type: 'base64', media_type: referenceImageBase64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg', data: referenceImageBase64 } },
        { type: 'text', text: userMessageText },
      ]
    : userMessageText;

  const data = await invokeAnthropicMessages({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      { role: 'user', content: messageContent },
      { role: 'assistant', content: '{' },
    ],
  });

  const rawText = data.content?.[0]?.text ?? '';
  // Assistant prefill usually makes Claude continue after "{", but some models
  // still return a full JSON object. Accept both shapes.
  const rawTrimmed = rawText.trim();
  const text = rawTrimmed.startsWith('{') ? rawTrimmed : `{${rawText}`;
  console.log('[SpiceStrong] Raw Claude response length:', text.length);
  // Strip markdown fences and extract JSON object
  let cleaned = text.replace(/```json|```/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    console.error('[SpiceStrong] No JSON in response. First 300 chars:', cleaned.substring(0, 300));
    throw new Error('Recipe generation returned no JSON. Please try again.');
  }
  cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  // Remove control characters that can break JSON.parse
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, (ch: string) => (ch === '\n' || ch === '\r' || ch === '\t' ? ch : ''));
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
  const { proteinId: routeProteinId, proteinName: routeProteinName, proteinEmoji: routeProteinEmoji } = useLocalSearchParams<{
    proteinId?: string;
    proteinName?: string;
    proteinEmoji?: string;
  }>();

  // Protein selection — use route param if provided, otherwise user picks
  const [selectedProtein, setSelectedProtein] = useState(routeProteinId || 'chicken');
  const [selectedProteinName, setSelectedProteinName] = useState(routeProteinName || 'Chicken');
  const [selectedProteinEmoji, setSelectedProteinEmoji] = useState(routeProteinEmoji || '🍗');
  const [dietPreference, setDietPreferenceState] = useState<DietPreference | null>('veg');

  // Use selected protein throughout (replaces paramProteinId/paramProteinName/proteinEmoji)
  const paramProteinId = selectedProtein;
  const paramProteinName = selectedProteinName;
  const proteinEmoji = selectedProteinEmoji;

  const [selectedMeatType, setSelectedMeatType] = useState<string>('');
  const [selectedProteinGoal, setSelectedProteinGoal] = useState<string>('20-plus');
  const [selectedMealType, setSelectedMealType] = useState<string>('lunch-dinner');
  const [selectedCookingTime, setSelectedCookingTime] = useState<string>('');
  const [selectedSpiceLevel, setSelectedSpiceLevel] = useState<string>('medium');
  const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
  const [selectedCuisine, setSelectedCuisine] = useState<string>('indian');
  const [loading, setLoading] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  // Macro target inputs — pre-filled from fitness profile per-meal split
  const [targetCal, setTargetCal] = useState('450');
  const [targetProtein, setTargetProtein] = useState('35');
  const [targetCarbs, setTargetCarbs] = useState('30');
  const [targetFat, setTargetFat] = useState('15');

  useEffect(() => { logScreenView('AIRecipeBuilderScreen'); }, []);

  // Load fitness profile targets on mount
  useEffect(() => {
    (async () => {
      const targets = await getSavedMacroTargets();
      if (targets) {
        // Per-meal split (~30% of daily for lunch/dinner)
        const mealSplit = 0.30;
        setTargetCal(String(Math.round(targets.calories * mealSplit)));
        setTargetProtein(String(Math.round(targets.proteinG * mealSplit)));
        setTargetCarbs(String(Math.round(targets.carbsG * mealSplit)));
        setTargetFat(String(Math.round(targets.fatG * mealSplit)));
      }
    })();
  }, []);
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState('');
  const [genRecipeId, setGenRecipeId] = useState<string | null>(null);
  // Image upload for reference photo
  const [referenceImageUri, setReferenceImageUri] = useState<string | null>(null);
  const [referenceImageBase64, setReferenceImageBase64] = useState<string | null>(null);
  const [generatedRecipe, setGeneratedRecipe] = useState<Record<string, unknown> | null>(null);
  const [filtersConfirmed, setFiltersConfirmed] = useState(false);
  // Entry mode: 'choose' = pick import or builder, 'import' = photo import in progress, 'review' = save/publish choice, 'builder' = current flow
  const [screenMode, setScreenMode] = useState<'choose' | 'import' | 'review' | 'builder'>('choose');
  const [importImageUri, setImportImageUri] = useState<string | null>(null);
  const [importImageBase64, setImportImageBase64] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState('');
  const [importedRecipe, setImportedRecipe] = useState<SavedRecipe | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [availableProteins, setAvailableProteins] = useState<{ id: string; name: string; emoji: string }[]>([]);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallCheck, setPaywallCheck] = useState<LimitCheck | null>(null);
  const allowedProteins = filterProteinsForPreference(PROTEINS, dietPreference);

  useEffect(() => {
    getDietPreference().then((preference) => {
      setDietPreferenceState(preference);
      if (preference === 'veg' && isNonVegProteinId(selectedProtein)) {
        const fallback = PROTEINS.find((p) => p.id === 'paneer') ?? PROTEINS.find((p) => p.category === 'VEG');
        if (fallback) {
          setSelectedProtein(fallback.id);
          setSelectedProteinName(fallback.name);
          setSelectedProteinEmoji(fallback.emoji);
        }
      }
    });
  }, [selectedProtein]);

  const isVegProtein = VEG_PROTEIN_IDS.includes(paramProteinId ?? '');
  const isDrinkProtein = DRINK_PROTEIN_IDS.includes(paramProteinId ?? '');
  const meatTypeOptions = MEAT_TYPE_MAP[paramProteinId ?? ''] ?? [];
  const showMeatType = !isVegProtein && meatTypeOptions.length > 0;

  // Drink proteins (milk/whey) have different state
  const [selectedDrinkType, setSelectedDrinkType] = useState<string>('smoothie');
  const [selectedDrinkFlavor, setSelectedDrinkFlavor] = useState<string>('');

  // Filter dietary options based on protein suitability
  const visibleDietary = useMemo(() => {
    if (isDrinkProtein) {
      return ALL_DIETARY_OPTIONS.filter((d) => ['low-carb', 'low-fat', 'dairy-free'].includes(d.id));
    }
    const allowed = PROTEIN_DIETARY[paramProteinId ?? ''];
    if (allowed) return ALL_DIETARY_OPTIONS.filter((d) => allowed.includes(d.id));
    if (isVegProtein) return ALL_DIETARY_OPTIONS;
    return ALL_DIETARY_OPTIONS.filter((d) => d.id !== 'vegan');
  }, [paramProteinId, isVegProtein, isDrinkProtein]);

  // Filter spice levels based on protein suitability
  const visibleSpiceLevels = useMemo(() => {
    const allowed = PROTEIN_SPICE_LEVELS[paramProteinId ?? ''];
    if (!allowed) return ALL_SPICE_LEVEL_OPTIONS;
    return ALL_SPICE_LEVEL_OPTIONS.filter((o) => allowed.includes(o.id));
  }, [paramProteinId]);

  // Filter cuisine options based on protein suitability
  const visibleCuisines = useMemo(() => {
    const allowed = PROTEIN_CUISINES[paramProteinId ?? ''];
    if (!allowed) return ALL_CUISINE_OPTIONS;
    return ALL_CUISINE_OPTIONS.filter((o) => allowed.includes(o.id));
  }, [paramProteinId]);

  // Filter meal type options based on protein suitability
  const MEAL_TYPE_OPTIONS = useMemo(() => {
    const allowed = PROTEIN_MEAL_TYPES[paramProteinId ?? ''];
    if (!allowed) return ALL_MEAL_TYPE_OPTIONS;
    return ALL_MEAL_TYPE_OPTIONS.filter((o) => allowed.includes(o.id));
  }, [paramProteinId]);

  // Reset selections if current choices are not valid for this protein
  useEffect(() => {
    const pid = paramProteinId ?? '';
    const allowedMeals = PROTEIN_MEAL_TYPES[pid];
    if (allowedMeals && !allowedMeals.includes(selectedMealType)) {
      setSelectedMealType(allowedMeals[0] ?? 'lunch-dinner');
    }
    const allowedSpice = PROTEIN_SPICE_LEVELS[pid];
    if (allowedSpice && !allowedSpice.includes(selectedSpiceLevel)) {
      setSelectedSpiceLevel(allowedSpice[0] ?? 'medium');
    }
    const allowedCuisine = PROTEIN_CUISINES[pid];
    if (allowedCuisine && !allowedCuisine.includes(selectedCuisine)) {
      setSelectedCuisine(allowedCuisine[0] ?? 'indian');
    }
    const allowedDietary = PROTEIN_DIETARY[pid];
    if (allowedDietary) {
      setSelectedDietary((prev) => prev.filter((d) => allowedDietary.includes(d)));
    }
  }, [paramProteinId]);

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
        const sl = ALL_SPICE_LEVEL_OPTIONS.find((o) => o.id === selectedSpiceLevel);
        if (sl) tags.push(sl.label);
      }
      if (selectedCuisine) {
        const c = ALL_CUISINE_OPTIONS.find((o) => o.id === selectedCuisine);
        if (c) tags.push(c.label);
      }
    }
    selectedDietary.forEach((id) => {
      const d = ALL_DIETARY_OPTIONS.find((o) => o.id === id);
      if (d) tags.push(d.label);
    });
    return tags;
  }, [isDrinkProtein, showMeatType, selectedMeatType, selectedDrinkType, selectedDrinkFlavor, selectedProteinGoal, selectedMealType, selectedCookingTime, selectedSpiceLevel, selectedDietary, selectedCuisine, meatTypeOptions]);

  const pickReferenceImage = async (useCamera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      base64: false,
    };
    let result: ImagePicker.ImagePickerResult;
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Camera access required.'); return; }
      result = await ImagePicker.launchCameraAsync(opts);
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Gallery access required.'); return; }
      result = await ImagePicker.launchImageLibraryAsync(opts);
    }
    if (!result.canceled && result.assets?.[0]) {
      const uri = result.assets[0].uri;
      setReferenceImageUri(uri);
      try {
        const manipulated = await manipulateAsync(
          uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.5, format: SaveFormat.JPEG, base64: true },
        );
        const b64 = manipulated.base64 || '';
        console.log(`[SpiceStrong] Reference: compressed base64=${Math.round(b64.length / 1024)}KB`);
        setReferenceImageBase64(b64 || null);
      } catch (e) {
        console.error('[SpiceStrong] Image compression failed:', e);
        Alert.alert('Could not process image', 'Try a different photo.');
      }
    }
  };

  // ── Photo Import: pick image and extract recipe via Claude Vision ──
  const pickImportImage = async (useCamera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      base64: false, // Don't get base64 from picker — we'll resize first
    };
    let result: ImagePicker.ImagePickerResult;
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Camera access required.'); return; }
      result = await ImagePicker.launchCameraAsync(opts);
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Gallery access required.'); return; }
      result = await ImagePicker.launchImageLibraryAsync(opts);
    }
    if (!result.canceled && result.assets?.[0]) {
      const uri = result.assets[0].uri;
      setImportImageUri(uri);

      // Resize to 1024px wide + 50% JPEG compression (guaranteed under 5MB base64)
      try {
        const manipulated = await manipulateAsync(
          uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.5, format: SaveFormat.JPEG, base64: true },
        );
        const b64 = manipulated.base64 || '';
        console.log(`[SpiceStrong] Import: compressed base64=${Math.round(b64.length / 1024)}KB`);
        setImportImageBase64(b64 || null);
        setScreenMode('import');
      } catch (e) {
        console.error('[SpiceStrong] Image compression failed:', e);
        Alert.alert('Could not process image', 'Try a different photo.');
      }
    }
  };

  const handleImportFromPhoto = async () => {
    if (!importImageBase64) return;
    // Freemium limit check
    const limitResult = await checkLimit('ai_recipe');
    if (!limitResult.allowed) { setPaywallCheck(limitResult); setPaywallVisible(true); return; }

    setImporting(true);
    setImportStep('Analyzing your photo...');

    try {
      // Enforce global AI recipe limit
      try {
        const countStr = await AsyncStorage.getItem(GLOBAL_AI_COUNT_KEY);
        const totalCount = countStr ? parseInt(countStr, 10) : 0;
        if (totalCount >= MAX_TOTAL_AI_RECIPES) {
          Alert.alert('Recipe Limit Reached', `You've created ${MAX_TOTAL_AI_RECIPES} AI recipes. Upgrade to Premium for unlimited recipes!`);
          setImporting(false);
          return;
        }
      } catch { /* proceed */ }

      // ── Step 1: Extract recipe from image (same prompt as AddRecipeScreen) ──
      setImportStep('Extracting recipe details...');

      let mediaType = 'image/jpeg';
      if (importImageBase64.startsWith('iVBOR')) mediaType = 'image/png';
      else if (importImageBase64.startsWith('UklGR')) mediaType = 'image/webp';

      const extractData = await invokeAnthropicMessages({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: `You are a recipe extraction engine for a high-protein cooking app.

STEP 1: Determine if the image contains food.
- If the image is NOT food (person, landscape, object, text without recipe, etc.), return: {"error": "not_food"}
- If the image IS food or a recipe (screenshot, book, handwritten, or a dish), proceed to Step 2.

STEP 2: Extract the recipe and identify the PRIMARY protein.
Return ONLY this JSON:
{
  "name": "Recipe name",
  "description": "1-2 sentence description",
  "primaryProtein": "chicken|fish|lamb|goat|pork|beef|prawns|eggs|paneer|tofu|soy|beans|milk|whey",
  "mealType": "breakfast|lunch_dinner|snack_dessert",
  "difficulty": "Easy|Medium|Hard",
  "cookTime": "30 min",
  "cuisine": "Indian|Thai|Mediterranean|Chinese|Mexican|American|Other",
  "ingredients": {
    "2-3 servings": [{"name": "Ingredient", "quantity": "500g"}],
    "4-6 servings": [{"name": "Ingredient", "quantity": "1kg"}]
  },
  "steps": [{"title": "Step", "description": "Details with quantities for each ingredient used", "emoji": "🔥", "timerMinutes": 5, "ingredientsUsed": "comma-separated ingredient names ONLY from this step", "imagePrompt": "Short literal description of ONLY what is physically visible at this moment — max 15 words, no recipe name"}],
  "chefTip": "One line tip"
}

CRITICAL RULES:
- primaryProtein MUST be one of: chicken, fish, lamb, goat, pork, beef, prawns, eggs, paneer, tofu, soy, beans, milk, whey
- If the dish has multiple proteins, pick the DOMINANT one
- If no clear protein is visible, use "eggs" as default
- Max 15 ingredients, 4-8 steps, precise quantities, 4-6 tier = 2x of 2-3 tier
- ingredientsUsed for each step must ONLY list ingredients actually used in THAT step — never include ingredients from other steps
- Every ingredient from the ingredient list must appear in exactly one step's ingredientsUsed
- Step description must mention each ingredient in ingredientsUsed with its quantity`,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: importImageBase64 } },
            { type: 'text', text: 'Analyze this image. If it contains food or a recipe, extract the full recipe. If not food, return {"error": "not_food"}.' },
          ],
        }],
      });
      let text = (extractData.content?.[0]?.text || '').trim();
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace <= firstBrace) throw new Error('Could not parse response');
      const parsed = JSON.parse(text.substring(firstBrace, lastBrace + 1));

      if (parsed.error === 'not_food') {
        Alert.alert('Not a Recipe', 'This doesn\'t look like food or a recipe. Please upload a photo of a dish or a recipe screenshot.');
        setImporting(false);
        return;
      }
      if (!parsed.name) {
        Alert.alert('Could Not Read', 'Could not identify a recipe from this image. Try a clearer photo.');
        setImporting(false);
        return;
      }
      if (dietPreference === 'veg' && hasNonVegText(JSON.stringify(parsed))) {
        Alert.alert('Vegetarian Mode', 'This recipe appears to include non-vegetarian ingredients. Vegetarian mode only supports vegetarian recipes.');
        setImporting(false);
        return;
      }

      // ── Step 2: Auto-fix for high-protein standards (same as AddRecipeScreen) ──
      setImportStep('Optimizing for high-protein standards...');
      try {
        const fixData = await invokeAnthropicMessages({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: `You are a high-protein recipe optimizer for SpiceStrong. Fix the recipe to meet these MANDATORY requirements:

1. PROTEIN DENSITY: proteinG / calories × 100 >= 6.4 (CRITICAL)
   - If too low: increase protein source quantity, reduce oils/carbs, add protein-rich ingredients
2. MAX 15 ingredients, MIN 4 steps, MAX 8 steps
3. ALL quantities must be precise (no "to taste", "some", "a pinch")
4. "2-3 servings" and "4-6 servings" tiers (4-6 = exactly 2× of 2-3)
5. Description must mention the protein name and be 1-2 sentences
6. Each step must have a clear title and detailed description with quantities
7. chefTip must mention protein per serving and calories
8. Each step MUST have "ingredientsUsed" listing ONLY ingredients used in THAT step (not other steps)
9. Every ingredient must appear in exactly one step's ingredientsUsed
10. Each step MUST have "imagePrompt": a short (max 15 words) literal description of what is physically visible at that cooking moment — no recipe name, no ingredients from other steps

Return the FIXED recipe as the same JSON format. If already compliant, return as-is.
Return ONLY the JSON, no explanation.`,
          messages: [{ role: 'user', content: `Fix this recipe to meet SpiceStrong standards:\n${JSON.stringify(parsed)}` }],
        });
        if (fixData) {
          const fixText = (fixData.content?.[0]?.text || '').trim();
          const fixFirst = fixText.indexOf('{');
          const fixLast = fixText.lastIndexOf('}');
          if (fixFirst !== -1 && fixLast > fixFirst) {
            const fixed = JSON.parse(fixText.substring(fixFirst, fixLast + 1));
            if (fixed.name) parsed.name = fixed.name;
            if (fixed.description) parsed.description = fixed.description;
            if (fixed.ingredients) parsed.ingredients = fixed.ingredients;
            if (fixed.steps?.length > 0) parsed.steps = fixed.steps;
            if (fixed.chefTip) parsed.chefTip = fixed.chefTip;
            if (fixed.mealType) parsed.mealType = fixed.mealType;
            console.log('[SpiceStrong] Recipe optimized for SpiceStrong standards');
          }
        }
      } catch (fixErr) {
        console.warn('[SpiceStrong] Auto-fix failed (non-blocking):', fixErr);
      }

      // ── Step 3: Get real nutrition from Edamam ──
      setImportStep('Getting nutrition details...');
      let nutritionData: { calories: number; proteinG: number; fatG: number; carbsG: number; fiberG: number; sugarG?: number; sodiumMg?: number } | null = null;
      try {
        const tier23 = parsed.ingredients?.['2-3 servings'] || [];
        if (tier23.length > 0) {
          nutritionData = await analyzeNutrition(tier23, 2.5);
          if (nutritionData) {
            console.log(`[SpiceStrong] Nutrition: ${nutritionData.calories} cal, ${nutritionData.proteinG}g P`);
          }
        }
      } catch (nutritionErr) {
        console.warn('[SpiceStrong] Nutrition analysis failed (non-blocking):', nutritionErr);
      }

      // ── Step 4: Map to SavedRecipe and save ──
      setImportStep('Saving recipe...');

      // Detect protein from extracted data
      const detectedProtein = parsed.primaryProtein || (dietPreference === 'veg' ? 'paneer' : 'eggs');
      const proteinMatch = allowedProteins.find((p: any) => p.id === detectedProtein);
      const fallbackProtein = allowedProteins.find((p) => p.id === 'paneer') ?? allowedProteins[0];
      const pId = proteinMatch?.id || fallbackProtein?.id || 'paneer';
      const pName = proteinMatch?.name || fallbackProtein?.name || 'Paneer';
      const pEmoji = proteinMatch?.emoji || fallbackProtein?.emoji || '🧀';

      // Build the recipe object matching saveRecipeFromAI format
      const recipeForSave: Record<string, unknown> = {
        name: parsed.name,
        proteinId: pId,
        proteinName: pName,
        proteinEmoji: pEmoji,
        description: parsed.description || '',
        mealType: parsed.mealType || 'lunch_dinner',
        difficulty: parsed.difficulty,
        cookTime: parsed.cookTime,
        ingredients: parsed.ingredients,
        steps: (parsed.steps || []).map((s: any, i: number) => ({
          id: `step${i + 1}`,
          title: s.title || '',
          description: s.description || '',
          emoji: s.emoji || '🔥',
          tip: s.tip || '',
          timerSeconds: s.timerMinutes ? s.timerMinutes * 60 : 0,
        })),
        // Use Edamam nutrition if available, else fall back to AI values
        protein: nutritionData ? `${Math.round(nutritionData.proteinG)}g` : (parsed.protein || '0g'),
        calories: nutritionData ? `${Math.round(nutritionData.calories)} kcal` : (parsed.calories || '0 kcal'),
        fatG: nutritionData ? `${Math.round(nutritionData.fatG)}g` : (parsed.fatG || '0g'),
        carbsG: nutritionData ? `${Math.round(nutritionData.carbsG)}g` : (parsed.carbsG || '0g'),
        fiberG: nutritionData ? `${Math.round(nutritionData.fiberG)}g` : (parsed.fiberG || '0g'),
      };

      const placeholderId = Date.now().toString();
      const saved = await saveRecipeFromAI(recipeForSave, placeholderId);
      saved.status = 'ready';

      // ── Step 5: Generate images (hero + step) ──
      setImportStep('Creating recipe images...');
      try {
        const stepsForImages = (parsed.steps || []).map((s: any) => ({
          title: s.title || '', description: s.description || '',
        }));
        const ingredientsForImages = parsed.ingredients || { '2-3 servings': [] };

        const aiImages = await generateAllRecipeImages({
          id: saved.id,
          name: parsed.name || 'Recipe',
          ingredients: ingredientsForImages,
          steps: stepsForImages,
        });
        await saveRecipeImages(saved.id, aiImages);

        // Upload hero to Supabase
        if (aiImages.dishImage) {
          uploadRecipeHeroImage(saved.id, aiImages.dishImage).catch(() => {});
        }
      } catch (imgErr) {
        console.warn('[SpiceStrong] Image generation failed (non-blocking):', imgErr);
        // Save with no images — don't use uploaded photo as hero
        await saveRecipeImages(saved.id, { dishImage: null, ingredientImages: {}, stepImages: {} });
      }

      // Save locally
      await saveAIRecipe(saved);
      updateRecipeStatus(saved.id, 'ready').catch(() => {});

      // Increment global count
      try {
        const countStr = await AsyncStorage.getItem(GLOBAL_AI_COUNT_KEY);
        const totalCount = countStr ? parseInt(countStr, 10) : 0;
        await AsyncStorage.setItem(GLOBAL_AI_COUNT_KEY, String(totalCount + 1));
      } catch { /* non-critical */ }
      recordUsage('ai_recipe');

      // Show the review screen with Save/Publish options
      setImportedRecipe(saved);
      setImporting(false);
      setScreenMode('review');

    } catch (err: any) {
      console.error('[SpiceStrong] Photo import failed:', err);
      setImporting(false);
      Alert.alert('Import Failed', 'Could not extract recipe from this photo. Try a clearer image.');
    }
  };

  const handleGenerate = async () => {
    // Freemium limit check
    const limitResult = await checkLimit('ai_recipe');
    if (!limitResult.allowed) { setPaywallCheck(limitResult); setPaywallVisible(true); return; }

    // Protein restriction (empty = all enabled)
    if (AI_ENABLED_PROTEINS.length > 0 && !AI_ENABLED_PROTEINS.includes(paramProteinId ?? '')) {
      Alert.alert('Coming Soon', 'SpiceBuilder recipes for this protein will be available soon!');
      return;
    }
    // Enforce global AI recipe limit (30 total across all proteins)
    try {
      const countStr = await AsyncStorage.getItem(GLOBAL_AI_COUNT_KEY);
      const totalCount = countStr ? parseInt(countStr, 10) : 0;
      if (totalCount >= MAX_TOTAL_AI_RECIPES) {
        Alert.alert(
          'Recipe Limit Reached',
          `You've created ${MAX_TOTAL_AI_RECIPES} AI recipes. Upgrade to Premium for unlimited recipes!`,
          [{ text: 'OK' }],
        );
        return;
      }
    } catch { /* proceed if check fails */ }

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
    } catch (e) {
      console.error(e);
      Alert.alert('', 'Could not save recipe, try again');
      return;
    }

    // Stay on screen with progress steps
    setGenerating(true);
    setGenStep('Understanding your preferences...');
    trackEvent('ai_recipe_generated', {
      screen: 'AIRecipeBuilderScreen',
      proteinId,
      metadata: { proteinName },
    });

    const findLabel = (options: { id: string; label: string }[], id: string) =>
      options.find((o) => o.id === id)?.label.replace(/^.\s/, '') ?? '';

    let saved: SavedRecipe | null = null;
    try {
      // Step 1: Generate recipe via Claude API
      setGenStep('Understanding your preferences...');
      const globalDietary = await getDietaryRestrictions();
      const globalDietaryLabels = [
        ...globalDietary.dietaryTags,
        ...globalDietary.allergenTags,
      ];
      const userDietaryLabels = selectedDietary.map((id) => findLabel(ALL_DIETARY_OPTIONS, id));
      const mergedDietary = Array.from(new Set([...globalDietaryLabels, ...userDietaryLabels]));

      setGenStep('Gathering ingredients...');
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
              dietary: mergedDietary,
              cuisine: '',
              targetCal, targetProtein, targetCarbs, targetFat,
            }
          : {
              meatType: showMeatType ? findLabel(meatTypeOptions, selectedMeatType) : undefined,
              proteinGoal: findLabel(PROTEIN_GOAL_OPTIONS, selectedProteinGoal),
              mealType: findLabel(ALL_MEAL_TYPE_OPTIONS, selectedMealType),
              cookingTime: findLabel(COOKING_TIME_OPTIONS, selectedCookingTime),
              spiceLevel: findLabel(ALL_SPICE_LEVEL_OPTIONS, selectedSpiceLevel),
              dietary: mergedDietary,
              cuisine: findLabel(ALL_CUISINE_OPTIONS, selectedCuisine),
              targetCal, targetProtein, targetCarbs, targetFat,
            },
        proteinEmojiVal,
        referenceImageBase64,
      );

      // Step 2: Save recipe and show immediately — don't wait for images
      setGenStep('Saving your recipe...');
      saved = await saveRecipeFromAI(result, placeholderId);
      saved.source = 'ai';
      saved.status = 'ready';
      const syncResult = await saveAIRecipe(saved);
      if (syncResult.duplicate) await saveAIRecipe(saved, true);
      updateRecipeStatus(saved.id, 'ready').catch(() => {});

      // Increment count
      try {
        const countStr = await AsyncStorage.getItem(GLOBAL_AI_COUNT_KEY);
        const totalCount = countStr ? parseInt(countStr, 10) : 0;
        await AsyncStorage.setItem(GLOBAL_AI_COUNT_KEY, String(totalCount + 1));
      } catch { /* non-critical */ }
      recordUsage('ai_recipe');

      // Show recipe immediately — user can view it while images generate
      setGenRecipeId(saved.id);
      setGenStep('Your recipe is ready! Generating images...');

      // All remaining work in BACKGROUND (non-blocking)
      const bgSavedId = saved.id;
      const bgName = String(result.name ?? '');
      const bgIngredients = result.ingredients as Record<string, { name: string; quantity?: string }[]>;
      const bgSteps = (result.steps as { title?: string; description?: string }[]) ?? [];
      (async () => {
        try {
          // Classify (non-blocking)
          classifyAndEnrichRecipe(saved).catch(() => {});

          // Generate hero + step images in parallel
          const { generateAllRecipeImages: genImages, saveRecipeImages: saveImgs } = require('../../services/imageGenerationService');
          const imgResult = await genImages({ id: bgSavedId, name: bgName, ingredients: bgIngredients, steps: bgSteps });
          await saveImgs(bgSavedId, imgResult);
          if (imgResult.dishImage) uploadRecipeHeroImage(bgSavedId, imgResult.dishImage).catch(() => {});
          console.log(`[SpiceStrong] Background images done for: ${bgName}`);
        } catch (e) {
          console.warn('[SpiceStrong] Background image generation failed:', e);
        }
      })();

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SpiceStrong] Recipe generation failed:', err);
      try {
        const toFix = saved ?? placeholder;
        toFix.status = 'ready';
        if (!saved) toFix.description = 'Recipe generation failed. Please delete and try again.';
        await saveAIRecipe(toFix);
      } catch { /* best effort */ }
      setGenerating(false);
      Alert.alert('Generation Failed', message || 'Something went wrong. Please try again.');
    }
  };

  const ingredientCount = generatedRecipe?.ingredients
    ? Object.values(generatedRecipe.ingredients as Record<string, unknown[]>).flat().length
    : 0;
  const stepCount = Array.isArray(generatedRecipe?.steps) ? (generatedRecipe!.steps as unknown[]).length : 0;

  return (
    <ImageBackground
      source={require('../../assets/images/splash-bg.jpg')}
      style={styles.bg}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => {
            if (screenMode === 'review') {
              // From review, go back to choose (recipe already saved locally)
              setScreenMode('choose');
              setImportedRecipe(null);
              setImportImageUri(null);
              setImportImageBase64(null);
            } else if (screenMode === 'builder' || screenMode === 'import') {
              setScreenMode('choose');
              setImportImageUri(null);
              setImportImageBase64(null);
            } else {
              router.back();
            }
          }} activeOpacity={0.8}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>SpiceBuilder</Text>
          <HomeButton />
        </View>

        {/* ── Entry screen: Choose mode ── */}
        {screenMode === 'choose' && !generating && (
          <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { justifyContent: 'center', paddingTop: 40 }]} showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 8, fontFamily: Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'serif', default: 'serif' }) }}>
              How would you like to create?
            </Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)', textAlign: 'center', marginBottom: 28 }}>
              Import a recipe from a photo or build one with AI
            </Text>

            {/* Import from Photo card */}
            <TouchableOpacity
              style={styles.modeCard}
              onPress={() => pickImportImage(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modeCardEmoji}>📸</Text>
              <View style={styles.modeCardTextBlock}>
                <Text style={styles.modeCardTitle}>Import from Photo</Text>
                <Text style={styles.modeCardDesc}>Photograph a cookbook page, recipe card, or screenshot</Text>
              </View>
              <Text style={styles.modeCardArrow}>›</Text>
            </TouchableOpacity>

            {/* Take Photo option */}
            <TouchableOpacity
              style={styles.modeCard}
              onPress={() => pickImportImage(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.modeCardEmoji}>📷</Text>
              <View style={styles.modeCardTextBlock}>
                <Text style={styles.modeCardTitle}>Take a Photo</Text>
                <Text style={styles.modeCardDesc}>Snap a picture of a recipe right now</Text>
              </View>
              <Text style={styles.modeCardArrow}>›</Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 20 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: '600', marginHorizontal: 14 }}>OR</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />
            </View>

            {/* SpiceBuilder AI card */}
            <TouchableOpacity
              style={[styles.modeCard, { borderColor: 'rgba(143,58,31,0.40)' }]}
              onPress={() => setScreenMode('builder')}
              activeOpacity={0.85}
            >
              <Text style={styles.modeCardEmoji}>🍳</Text>
              <View style={styles.modeCardTextBlock}>
                <Text style={[styles.modeCardTitle, { color: '#8F3A1F' }]}>Build with AI</Text>
                <Text style={styles.modeCardDesc}>Pick your protein, cuisine, macros and let AI create the recipe</Text>
              </View>
              <Text style={[styles.modeCardArrow, { color: '#8F3A1F' }]}>›</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── Import confirmation screen ── */}
        {screenMode === 'import' && !importing && (
          <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { alignItems: 'center', paddingTop: 30 }]} showsVerticalScrollIndicator={false}>
            {importImageUri && (
              <Image source={{ uri: importImageUri }} style={{ width: 280, height: 380, borderRadius: 20, marginBottom: 20 }} contentFit="contain" />
            )}
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 6, fontFamily: Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'serif', default: 'serif' }) }}>
              Ready to import
            </Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)', textAlign: 'center', marginBottom: 28, paddingHorizontal: 20 }}>
              AI will extract the recipe, calculate nutrition, and create cooking steps
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { width: '100%' }]}
              onPress={handleImportFromPhoto}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Import Recipe</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ marginTop: 14, paddingVertical: 10 }}
              onPress={() => { setScreenMode('choose'); setImportImageUri(null); setImportImageBase64(null); }}
              activeOpacity={0.75}
            >
              <Text style={{ color: 'rgba(255,255,255,0.50)', fontSize: 14, fontWeight: '600' }}>Choose a different photo</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Import progress */}
        {importing && (
          <View style={styles.genOverlay}>
            <View style={styles.genContent}>
              <ProcessingRing label={importStep} sublabel="Extracting recipe from your photo" expectedMs={22000} size={108} />
              <Text style={styles.genEmoji}>📸</Text>
              <Text style={styles.genTitle}>Importing Recipe</Text>
            </View>
          </View>
        )}

        {/* ── Post-import review: Save or Publish ── */}
        {screenMode === 'review' && importedRecipe && (
          <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { alignItems: 'center', paddingTop: 20 }]} showsVerticalScrollIndicator={false}>
            {importImageUri && (
              <Image source={{ uri: importImageUri }} style={{ width: 220, height: 220, borderRadius: 20, marginBottom: 16 }} contentFit="cover" />
            )}
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 4, fontFamily: Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'serif', default: 'serif' }) }}>
              {importedRecipe.name}
            </Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)', textAlign: 'center', marginBottom: 6 }}>
              {importedRecipe.proteinEmoji} {importedRecipe.proteinName}
            </Text>
            {importedRecipe.aiNutrition && (
              <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20 }}>
                <Text style={{ color: '#8F3A1F', fontSize: 13, fontWeight: '700' }}>{Math.round((importedRecipe.aiNutrition.proteinG || 0) / 2.5)}g protein</Text>
                <Text style={{ color: 'rgba(255,255,255,0.50)', fontSize: 13 }}>{Math.round((importedRecipe.aiNutrition.calories || 0) / 2.5)} cal</Text>
                <Text style={{ color: 'rgba(255,255,255,0.50)', fontSize: 13 }}>{(importedRecipe.steps?.length || 0)} steps</Text>
              </View>
            )}
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginBottom: 24, paddingHorizontal: 20 }}>
              Recipe extracted successfully. Save it to your recipe library.
            </Text>

            <TouchableOpacity
              style={[styles.primaryBtn, { width: '100%', marginBottom: 12 }, publishing && { opacity: 0.6 }]}
              onPress={async () => {
                if (publishing) return;
                setPublishing(true);
                try {
                  importedRecipe.source = 'ai';
                  await saveAIRecipe(importedRecipe);
                  try { await classifyAndEnrichRecipe(importedRecipe); } catch { /* non-fatal */ }
                  if (importImageUri) uploadRecipeHeroImage(importedRecipe.id, importImageUri).catch(() => {});
                  updateRecipeStatus(importedRecipe.id, 'ready').catch(() => {});
                  Alert.alert('Saved!', `"${importedRecipe.name}" is saved to your recipe library.`, [
                    { text: 'View Recipe', onPress: () => router.replace({ pathname: '/screens/RecipeOverviewScreen', params: { recipeId: importedRecipe.id, quantityTier: '2-3 servings' } }) },
                  ]);
                } catch (e) {
                  Alert.alert('Save Failed', 'Could not save this recipe. Please try again.');
                } finally {
                  setPublishing(false);
                }
              }}
              disabled={publishing}
              activeOpacity={0.85}
            >
              {publishing ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Save Recipe</Text>
              )}
            </TouchableOpacity>

            {/* Save locally button */}
            <TouchableOpacity
              style={{ width: '100%', backgroundColor: GLASS, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: BORDER_LIGHT }}
              onPress={() => {
                Alert.alert('Saved!', `"${importedRecipe.name}" is saved to your recipes.`, [
                  { text: 'View Recipe', onPress: () => router.replace({ pathname: '/screens/RecipeOverviewScreen', params: { recipeId: importedRecipe.id, quantityTier: '2-3 servings' } }) },
                ]);
              }}
              disabled={publishing}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Save Locally Only</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Generation progress screen */}
        {generating && (
          <View style={styles.genOverlay}>
            <View style={styles.genContent}>
              <ProcessingRing label={genStep} sublabel="AI is crafting your recipe" expectedMs={20000} size={108} />
              <Text style={styles.genEmoji}>👨‍🍳</Text>
              <Text style={styles.genTitle}>Creating Your Recipe</Text>
              {genRecipeId && (
                <TouchableOpacity
                  style={styles.genViewBtn}
                  onPress={() => {
                    setGenerating(false);
                    router.replace({
                      pathname: '/screens/RecipeOverviewScreen',
                      params: { recipeId: genRecipeId, quantityTier: '2-3 servings' },
                    });
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.genViewBtnText}>View Recipe</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <ScrollView
          style={[styles.scroll, (generating || screenMode !== 'builder') && { display: 'none' }]}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Protein selector */}
          {!generatedRecipe && (
            <View style={styles.proteinPickerSection}>
              <Text style={styles.proteinPickerLabel}>SELECT PROTEIN</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.proteinPickerRow}>
                  {allowedProteins.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.proteinPickerChip, selectedProtein === p.id && styles.proteinPickerChipActive]}
                      onPress={() => {
                        setSelectedProtein(p.id);
                        setSelectedProteinName(p.name);
                        setSelectedProteinEmoji(p.emoji);
                        setSelectedMeatType('');
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.proteinPickerEmoji}>{p.emoji}</Text>
                      <Text style={[styles.proteinPickerText, selectedProtein === p.id && styles.proteinPickerTextActive]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Meal Type */}
          {!generatedRecipe && (
            <>
              <Text style={styles.sectionLabel}>🍽️ {isDrinkProtein ? 'When' : 'Meal Type'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <ChipRow
                  options={isDrinkProtein ? DRINK_MEAL_OPTIONS : MEAL_TYPE_OPTIONS}
                  selected={selectedMealType}
                  onSelect={setSelectedMealType}
                  disabled={loading}
                />
              </ScrollView>

              {/* Target per serving — macro inputs */}
              <Text style={styles.sectionLabel}>🎯 TARGET PER SERVING</Text>
              <View style={styles.macroInputRow}>
                <View style={styles.macroInputBox}>
                  <TextInput style={styles.macroInputField} value={targetCal} onChangeText={setTargetCal} keyboardType="numeric" returnKeyType="done" placeholder="450" placeholderTextColor="rgba(255,255,255,0.20)" />
                  <Text style={styles.macroInputUnit}>cal</Text>
                </View>
                <View style={styles.macroInputBox}>
                  <TextInput style={[styles.macroInputField, { color: '#8F3A1F' }]} value={targetProtein} onChangeText={setTargetProtein} keyboardType="numeric" returnKeyType="done" placeholder="35" placeholderTextColor="rgba(255,255,255,0.20)" />
                  <Text style={[styles.macroInputUnit, { color: '#8F3A1F' }]}>g P</Text>
                </View>
                <View style={styles.macroInputBox}>
                  <TextInput style={styles.macroInputField} value={targetCarbs} onChangeText={setTargetCarbs} keyboardType="numeric" returnKeyType="done" placeholder="30" placeholderTextColor="rgba(255,255,255,0.20)" />
                  <Text style={styles.macroInputUnit}>g C</Text>
                </View>
                <View style={styles.macroInputBox}>
                  <TextInput style={styles.macroInputField} value={targetFat} onChangeText={setTargetFat} keyboardType="numeric" returnKeyType="done" placeholder="15" placeholderTextColor="rgba(255,255,255,0.20)" />
                  <Text style={styles.macroInputUnit}>g F</Text>
                </View>
              </View>

              {/* More Options — collapsible */}
              <TouchableOpacity style={styles.moreOptionsToggle} onPress={() => setShowMoreOptions(!showMoreOptions)} activeOpacity={0.75}>
                <Text style={styles.moreOptionsText}>{showMoreOptions ? '▲' : '▼'} More Options</Text>
              </TouchableOpacity>

              {showMoreOptions && (
                <>
                  {/* Meat Type — only for non-veg */}
                  {showMeatType && (
                    <>
                      <Text style={styles.sectionLabel}>🥩 Meat Type</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                        <ChipRow options={meatTypeOptions} selected={selectedMeatType} onSelect={setSelectedMeatType} disabled={loading} />
                      </ScrollView>
                    </>
                  )}

                  {/* Drink Type */}
                  {isDrinkProtein && (
                    <>
                      <Text style={styles.sectionLabel}>🥤 Type</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                        <ChipRow options={DRINK_TYPE_OPTIONS} selected={selectedDrinkType} onSelect={setSelectedDrinkType} disabled={loading} />
                      </ScrollView>
                    </>
                  )}

                  {/* Cooking Time */}
                  {!isDrinkProtein && (
                    <>
                      <Text style={styles.sectionLabel}>⏱️ Cooking Time</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                        <ChipRow options={COOKING_TIME_OPTIONS} selected={selectedCookingTime} onSelect={setSelectedCookingTime} disabled={loading} />
                      </ScrollView>
                    </>
                  )}

                  {/* Spice Level — not for dairy/protein powder */}
                  {!isDrinkProtein && (
                    <>
                      <Text style={styles.sectionLabel}>🌶️ Spice Level</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                        <ChipRow options={visibleSpiceLevels} selected={selectedSpiceLevel} onSelect={setSelectedSpiceLevel} disabled={loading} />
                      </ScrollView>
                    </>
                  )}

                  {/* Cuisine Style */}
                  {!isDrinkProtein && (
                    <>
                      <Text style={styles.sectionLabel}>🌍 Cuisine Style</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                        <ChipRow options={visibleCuisines} selected={selectedCuisine} onSelect={setSelectedCuisine} disabled={loading} />
                      </ScrollView>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* Generate button */}
          {!generatedRecipe && (
            <TouchableOpacity
              style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
              onPress={handleGenerate}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>🍳 Generate Recipe</Text>
            </TouchableOpacity>
          )}

          {loading && (
            <View style={styles.loadingWrap}>
              <ProcessingRing label="SpiceBuilder is crafting your recipe..." expectedMs={20000} />
            </View>
          )}

          {/* Recipe generation submitted — no preview needed, generating in background */}
          {false && (
            <View />
          )}
        </ScrollView>
      </View>

      {/* ===== Limit Modal ===== */}
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
            <Text style={styles.modalTitle}>Limit Reached</Text>

            {/* Message */}
            <Text style={styles.modalMessage}>
              You've used your free AI recipe for{' '}
              <Text style={styles.modalProteinHighlight}>{paramProteinName}</Text>.
              {'\n\n'}Try generating a recipe for a different protein! 🚀
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
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} limitCheck={paywallCheck} onUpgrade={() => { setPaywallVisible(false); /* TODO: IAP */ }} />
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

  // Generation progress overlay
  genOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  genContent: {
    alignItems: 'center',
    gap: 8,
  },
  genEmoji: { fontSize: 64, marginBottom: 8 },
  genTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'PlayfairDisplay_700Bold', android: 'serif', default: 'serif' }),
  },
  genStep: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: 4,
  },
  genViewBtn: {
    marginTop: 24,
    backgroundColor: '#8F3A1F',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 40,
    ...Platform.select({
      ios: { shadowColor: '#8F3A1F', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  genViewBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },

  // Reference image upload
  refImageSection: {
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  refImageLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1,
    marginBottom: 10,
  },
  refImageBtnRow: { flexDirection: 'row', gap: 10 },
  refImageBtn: {
    flex: 1,
    backgroundColor: 'rgba(143,58,31,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.30)',
  },
  refImageBtnText: { fontSize: 14, fontWeight: '700', color: '#8F3A1F' },
  refImagePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  refImageThumb: { width: 80, height: 80, borderRadius: 12 },
  refImageActions: { flex: 1, gap: 4 },
  refImageHint: { fontSize: 13, fontWeight: '600', color: '#22C55E' },
  refImageRemove: { fontSize: 13, fontWeight: '600', color: '#8F3A1F', textDecorationLine: 'underline' },
  refImageOptional: { fontSize: 11, color: 'rgba(255,255,255,0.30)', marginTop: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,11,9,0.54)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  backText: { color: '#fff', fontSize: 28, lineHeight: 30, fontWeight: '900' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  headerSpacer: { width: 44 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  // Protein picker
  proteinPickerSection: { marginBottom: 16 },
  proteinPickerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1,
    marginBottom: 10,
  },
  proteinPickerRow: { flexDirection: 'row', gap: 8 },
  proteinPickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  proteinPickerChipActive: {
    borderColor: '#8F3A1F',
    backgroundColor: 'rgba(143,58,31,0.15)',
  },
  proteinPickerEmoji: { fontSize: 18 },
  proteinPickerText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.60)' },
  proteinPickerTextActive: { color: '#8F3A1F', fontWeight: '700' },

  // Macro input boxes
  macroInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  macroInputBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 2,
  },
  macroInputField: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 4,
  },
  macroInputUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.40)',
  },

  // More options toggle
  moreOptionsToggle: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 8,
  },
  moreOptionsText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
  },

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
    backgroundColor: 'rgba(143,58,31,0.25)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.4)',
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

  // Limit Modal
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
    borderColor: 'rgba(143,58,31,0.35)',
    ...Platform.select({
      ios: { shadowColor: '#8F3A1F', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
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
    color: '#8F3A1F',
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
    color: '#8F3A1F',
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
    backgroundColor: 'rgba(143,58,31,0.2)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(143,58,31,0.4)',
  },
  modalOtherChipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  modalDismissBtn: {
    backgroundColor: '#8F3A1F',
    borderRadius: 16,
    height: 50,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#8F3A1F', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
    }),
  },
  modalDismissBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Mode selection cards
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 14,
  },
  modeCardEmoji: { fontSize: 32 },
  modeCardTextBlock: { flex: 1 },
  modeCardTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', marginBottom: 3 },
  modeCardDesc: { fontSize: 12, color: 'rgba(255,255,255,0.50)', lineHeight: 17 },
  modeCardArrow: { fontSize: 28, color: 'rgba(255,255,255,0.30)', fontWeight: '300' },
});
