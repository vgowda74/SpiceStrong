import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  ImageBackground,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QUANTITY_TIERS, type QuantityTier, type SavedRecipe } from '../../src/store/recipes';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

const ACCENT = '#E85D26';
const GLASS = 'rgba(255,255,255,0.1)';
const BORDER_LIGHT = 'rgba(255,255,255,0.2)';

const VEG_PROTEIN_IDS = ['paneer', 'tofu', 'soy', 'beans', 'eggs'];

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
  if (params.meatType) parts.push(`Meat cut/type: ${params.meatType}.`);
  if (params.proteinGoal) parts.push(`Protein goal per serving: ${params.proteinGoal}.`);
  if (params.mealType) parts.push(`Meal type: ${params.mealType}.`);
  if (params.cookingTime) parts.push(`Cooking time: ${params.cookingTime}.`);
  if (params.spiceLevel) parts.push(`Spice level: ${params.spiceLevel}.`);
  if (params.dietary.length > 0) parts.push(`Dietary requirements: ${params.dietary.join(', ')}.`);
  parts.push(`Cuisine style: ${params.cuisine || 'Indian'}.`);

  const constraintsText = parts.join(' ');

  const systemPrompt = `You are a professional chef and nutritionist. Generate a complete high-protein recipe and return ONLY valid JSON.

Return this exact JSON structure:
{
  "name": "Recipe Name",
  "proteinId": "chicken|lamb|fish|prawns|pork|goat|paneer|tofu|eggs|soy|beans",
  "proteinName": "Chicken",
  "proteinEmoji": "🍗",
  "description": "One line description",
  "cookTime": "25 min",
  "difficulty": "Easy|Medium|Hard",
  "protein": "32g",
  "calories": "320 kcal",
  "ingredients": {
    "1lb": [
      {
        "category": "PROTEIN",
        "categoryEmoji": "🍗",
        "name": "Ingredient name",
        "quantity": "1 cup"
      }
    ]
  },
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
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? 'API request failed');
  }
  const text = data.content?.[0]?.text ?? '';
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
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
  }
  return result as SavedRecipe['ingredients'];
}

async function saveRecipe(recipe: Record<string, unknown>): Promise<SavedRecipe> {
  const existing = await AsyncStorage.getItem('spicestrong_recipes');
  const recipes: Record<string, unknown>[] = existing ? JSON.parse(existing) : [];

  const steps = (recipe.steps as { title?: string; description?: string; emoji?: string; tip?: string; timerSeconds?: number }[]) ?? [];
  const stepsNormalized = steps.map((s) => ({
    title: s.title ?? '',
    description: s.description ?? '',
    emoji: s.emoji,
    tip: s.tip,
    timerMinutes: typeof s.timerSeconds === 'number' ? Math.round(s.timerSeconds / 60) : undefined,
  }));

  const newRecipe: SavedRecipe = {
    id: Date.now().toString(),
    name: String(recipe.name ?? 'Untitled'),
    proteinId: String(recipe.proteinId ?? 'chicken'),
    proteinName: String(recipe.proteinName ?? 'Chicken'),
    proteinEmoji: String(recipe.proteinEmoji ?? '🍗'),
    description: String(recipe.description ?? ''),
    ingredients: normalizeAIIngredients(recipe.ingredients),
    steps: stepsNormalized,
    chefTip: String(recipe.description ?? steps[0]?.tip ?? ''),
    createdAt: Date.now(),
  };

  const toStore = {
    ...newRecipe,
    isAIGenerated: true,
  };
  recipes.push(toStore);
  await AsyncStorage.setItem('spicestrong_recipes', JSON.stringify(recipes));
  return newRecipe;
}

// Chip row helper
function ChipRow({
  options,
  selected,
  onSelect,
  multi = false,
  disabled = false,
}: {
  options: { id: string; label: string }[];
  selected: string | string[];
  onSelect: (id: string) => void;
  multi?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={styles.chipsWrap}>
      {options.map((opt) => {
        const active = multi
          ? (selected as string[]).includes(opt.id)
          : selected === opt.id;
        return (
          <TouchableOpacity
            key={opt.id}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(opt.id)}
            disabled={disabled}
            activeOpacity={0.8}
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

  const isVegProtein = VEG_PROTEIN_IDS.includes(paramProteinId ?? '');
  const meatTypeOptions = MEAT_TYPE_MAP[paramProteinId ?? ''] ?? [];
  const showMeatType = !isVegProtein && meatTypeOptions.length > 0;

  // Filter dietary options contextually
  const visibleDietary = useMemo(() => {
    if (isVegProtein) {
      return DIETARY_OPTIONS;
    }
    // Non-veg: don't show vegan
    return DIETARY_OPTIONS.filter((d) => d.id !== 'vegan');
  }, [isVegProtein]);

  const toggleDietary = (id: string) => {
    setSelectedDietary((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  };

  // Build selected keywords summary
  const selectedKeywords = useMemo(() => {
    const tags: string[] = [];
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
    selectedDietary.forEach((id) => {
      const d = DIETARY_OPTIONS.find((o) => o.id === id);
      if (d) tags.push(d.label);
    });
    if (selectedCuisine) {
      const c = CUISINE_OPTIONS.find((o) => o.id === selectedCuisine);
      if (c) tags.push(c.label);
    }
    return tags;
  }, [showMeatType, selectedMeatType, selectedProteinGoal, selectedMealType, selectedCookingTime, selectedSpiceLevel, selectedDietary, selectedCuisine, meatTypeOptions]);

  const handleGenerate = async () => {
    if (!ANTHROPIC_KEY) {
      Alert.alert('', 'AI is not configured. Set EXPO_PUBLIC_ANTHROPIC_KEY.');
      return;
    }
    setLoading(true);
    setGeneratedRecipe(null);
    try {
      const findLabel = (options: { id: string; label: string }[], id: string) =>
        options.find((o) => o.id === id)?.label.replace(/^.\s/, '') ?? '';

      const result = await callClaudeAPI(
        paramProteinId ?? 'chicken',
        paramProteinName ?? 'Chicken',
        {
          meatType: showMeatType ? findLabel(meatTypeOptions, selectedMeatType) : undefined,
          proteinGoal: findLabel(PROTEIN_GOAL_OPTIONS, selectedProteinGoal),
          mealType: findLabel(MEAL_TYPE_OPTIONS, selectedMealType),
          cookingTime: findLabel(COOKING_TIME_OPTIONS, selectedCookingTime),
          spiceLevel: findLabel(SPICE_LEVEL_OPTIONS, selectedSpiceLevel),
          dietary: selectedDietary.map((id) => findLabel(DIETARY_OPTIONS, id)),
          cuisine: findLabel(CUISINE_OPTIONS, selectedCuisine),
        },
      );
      setGeneratedRecipe(result);
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof SyntaxError ? 'Could not read the recipe, try again' : 'AI is busy, please try again';
      Alert.alert('', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!generatedRecipe) return;
    try {
      const saved = await saveRecipe(generatedRecipe);
      router.push({
        pathname: '/screens/RecipeListScreen',
        params: { proteinId: saved.proteinId, proteinName: saved.proteinName, proteinEmoji: saved.proteinEmoji },
      });
    } catch (e) {
      console.error(e);
      Alert.alert('', 'Could not save recipe, try again');
    }
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
          <Text style={styles.title}>AI Recipe Builder</Text>
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
              {/* Meat Type — only for non-veg */}
              {showMeatType && (
                <>
                  <Text style={styles.sectionLabel}>🥩 Meat Type</Text>
                  <ChipRow
                    options={meatTypeOptions}
                    selected={selectedMeatType}
                    onSelect={setSelectedMeatType}
                    disabled={loading}
                  />
                </>
              )}

              {/* Protein Goal */}
              <Text style={styles.sectionLabel}>🎯 Protein Goal (per serving)</Text>
              <ChipRow
                options={PROTEIN_GOAL_OPTIONS}
                selected={selectedProteinGoal}
                onSelect={setSelectedProteinGoal}
                disabled={loading}
              />

              {/* Meal Type */}
              <Text style={styles.sectionLabel}>🍽️ Meal Type</Text>
              <ChipRow
                options={MEAL_TYPE_OPTIONS}
                selected={selectedMealType}
                onSelect={setSelectedMealType}
                disabled={loading}
              />

              {/* Cooking Time */}
              <Text style={styles.sectionLabel}>⏱️ Cooking Time</Text>
              <ChipRow
                options={COOKING_TIME_OPTIONS}
                selected={selectedCookingTime}
                onSelect={setSelectedCookingTime}
                disabled={loading}
              />

              {/* Spice Level */}
              <Text style={styles.sectionLabel}>🌶️ Spice Level</Text>
              <ChipRow
                options={SPICE_LEVEL_OPTIONS}
                selected={selectedSpiceLevel}
                onSelect={setSelectedSpiceLevel}
                disabled={loading}
              />

              {/* Dietary Preference */}
              <Text style={styles.sectionLabel}>🥗 Dietary Preference</Text>
              <ChipRow
                options={visibleDietary}
                selected={selectedDietary}
                onSelect={toggleDietary}
                multi
                disabled={loading}
              />

              {/* Cuisine Style */}
              <Text style={styles.sectionLabel}>🌍 Cuisine Style</Text>
              <ChipRow
                options={CUISINE_OPTIONS}
                selected={selectedCuisine}
                onSelect={setSelectedCuisine}
                disabled={loading}
              />
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
              <Text style={styles.primaryBtnText}>🤖 Generate Recipe with AI</Text>
            </TouchableOpacity>
          )}

          {loading && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={ACCENT} />
              <Text style={styles.loadingText}>🤖 Claude is crafting your recipe...</Text>
            </View>
          )}

          {/* After generation: show selected keywords + recipe card */}
          {generatedRecipe && !loading && (
            <>
              {/* Selected keywords summary */}
              <View style={styles.keywordsWrap}>
                {selectedKeywords.map((tag, i) => (
                  <View key={i} style={styles.keywordTag}>
                    <Text style={styles.keywordTagText}>{tag}</Text>
                  </View>
                ))}
              </View>

              {/* Recipe preview card */}
              <View style={styles.previewCard}>
                <Text style={styles.previewName}>{String(generatedRecipe.name)}</Text>
                <Text style={styles.previewDesc}>{String(generatedRecipe.description ?? '')}</Text>
                <View style={styles.previewMeta}>
                  <Text style={styles.previewMetaText}>{String(generatedRecipe.cookTime ?? '')}</Text>
                  <Text style={styles.previewMetaDot}> · </Text>
                  <Text style={styles.previewMetaText}>{String(generatedRecipe.difficulty ?? '')}</Text>
                  <Text style={styles.previewMetaDot}> · </Text>
                  <Text style={styles.previewMetaText}>{String(generatedRecipe.protein ?? '')}</Text>
                </View>
                <Text style={styles.previewCounts}>
                  {ingredientCount} ingredients · {stepCount} steps
                </Text>
                <View style={styles.previewActions}>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
                    <Text style={styles.saveBtnText}>💾 Save Recipe</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.regenBtn}
                    onPress={() => {
                      setGeneratedRecipe(null);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.regenBtnText}>✏️ Edit Filters</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.regenFullBtn}
                  onPress={handleGenerate}
                  activeOpacity={0.85}
                >
                  <Text style={styles.regenFullBtnText}>🔄 Regenerate</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </View>
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
});
