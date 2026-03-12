import React, { useState } from 'react';
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

const DIETARY_OPTIONS = [
  { id: 'low-carb', label: '🥗 Low Carb' },
  { id: 'gluten-free', label: '🌾 Gluten Free' },
  { id: 'low-fat', label: '💧 Low Fat' },
  { id: 'sugar-free', label: '🚫 Sugar Free' },
  { id: 'keto', label: '🥑 Keto' },
  { id: 'dairy-free', label: '🥛 Dairy Free' },
];

const CUISINE_OPTIONS = [
  { id: 'indian', label: '🇮🇳 Indian' },
  { id: 'mediterranean', label: '🫒 Mediterranean' },
  { id: 'asian', label: '🥢 Asian' },
  { id: 'mexican', label: '🌮 Mexican' },
  { id: 'italian', label: '🍝 Italian' },
];

async function callClaudeAPI(
  proteinId: string,
  proteinName: string,
  dietary: string[],
  cuisine: string,
) {
  const dietaryText = dietary.length > 0 ? `Dietary requirements: ${dietary.join(', ')}.` : '';
  const cuisineText = cuisine ? `Cuisine style: ${cuisine}.` : 'Cuisine style: Indian.';

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
${dietaryText}
${cuisineText}`;

  const userMessage = `Generate a complete high-protein ${proteinName} recipe. ${dietaryText} ${cuisineText}`;

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

export default function AIRecipeBuilderScreen() {
  const router = useRouter();
  const { proteinId: paramProteinId, proteinName: paramProteinName, proteinEmoji } = useLocalSearchParams<{
    proteinId?: string;
    proteinName?: string;
    proteinEmoji?: string;
  }>();
  const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
  const [selectedCuisine, setSelectedCuisine] = useState<string>('indian');
  const [loading, setLoading] = useState(false);
  const [generatedRecipe, setGeneratedRecipe] = useState<Record<string, unknown> | null>(null);

  const isVegProtein = VEG_PROTEIN_IDS.includes(paramProteinId ?? '');

  const visibleDietary = DIETARY_OPTIONS.filter(
    (d) => d.id !== 'dairy-free' || isVegProtein,
  );

  const toggleDietary = (id: string) => {
    setSelectedDietary((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  };

  const handleGenerate = async () => {
    if (!ANTHROPIC_KEY) {
      Alert.alert('', 'AI is not configured. Set EXPO_PUBLIC_ANTHROPIC_KEY.');
      return;
    }
    setLoading(true);
    setGeneratedRecipe(null);
    try {
      const dietaryLabels = selectedDietary.map(
        (id) => DIETARY_OPTIONS.find((d) => d.id === id)?.label.replace(/^.\s/, '') ?? id,
      );
      const cuisineLabel =
        CUISINE_OPTIONS.find((c) => c.id === selectedCuisine)?.label.replace(/^.\s/, '') ?? 'Indian';
      const result = await callClaudeAPI(
        paramProteinId ?? 'chicken',
        paramProteinName ?? 'Chicken',
        dietaryLabels,
        cuisineLabel,
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

  const handleRegenerate = () => {
    handleGenerate();
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

          {/* Dietary section */}
          <Text style={styles.sectionLabel}>🥗 Dietary Preference</Text>
          <View style={styles.chipsWrap}>
            {visibleDietary.map((opt) => {
              const active = selectedDietary.includes(opt.id);
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleDietary(opt.id)}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Cuisine section */}
          <Text style={styles.sectionLabel}>🌍 Cuisine Style</Text>
          <View style={styles.chipsWrap}>
            {CUISINE_OPTIONS.map((opt) => {
              const active = selectedCuisine === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSelectedCuisine(opt.id)}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Generate button */}
          <TouchableOpacity
            style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
            onPress={handleGenerate}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>🤖 Generate Recipe with AI</Text>
          </TouchableOpacity>

          {loading && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={ACCENT} />
              <Text style={styles.loadingText}>🤖 Claude is crafting your recipe...</Text>
            </View>
          )}

          {generatedRecipe && !loading && (
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
                <TouchableOpacity style={styles.regenBtn} onPress={handleRegenerate} activeOpacity={0.85}>
                  <Text style={styles.regenBtnText}>🔄 Regenerate</Text>
                </TouchableOpacity>
              </View>
            </View>
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
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  chip: {
    backgroundColor: GLASS,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
  },
  chipActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  chipText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '500' },
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
  previewActions: { flexDirection: 'row', gap: 12 },
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
});
