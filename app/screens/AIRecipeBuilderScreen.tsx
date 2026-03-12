import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ImageBackground,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QUANTITY_TIERS, type QuantityTier, type SavedRecipe } from '../../src/store/recipes';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

const ACCENT = '#E85D26';
const GLASS = 'rgba(255,255,255,0.1)';
const TAB_ACTIVE = '#E85D26';
const TAB_INACTIVE = 'rgba(255,255,255,0.2)';
const BORDER_LIGHT = 'rgba(255,255,255,0.2)';

type TabMode = 'describe' | 'paste' | 'photo';

const SUGGESTION_CHIPS = [
  '🦐 High protein shrimp',
  '🍗 Easy chicken under 20 min',
  '🫘 Vegan dal recipe',
  '🥚 Quick egg curry',
];

async function callClaudeAPI(userInput: string, mode: 'paste' | 'describe') {
  const systemPrompt = `You are a professional Indian chef and nutritionist. Extract or generate a complete high-protein Indian recipe and return ONLY valid JSON.

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
- Always Indian cuisine style
- 4-8 cooking steps maximum
- timerSeconds: use realistic times (300 = 5 min)
- Return ONLY the JSON object, no other text
- proteinId must match one of the options exactly`;

  const userMessage =
    mode === 'paste'
      ? `Extract this recipe into the JSON format: ${userInput}`
      : `Generate a complete recipe for: ${userInput}`;

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
  const { proteinId, proteinName, proteinEmoji } = useLocalSearchParams<{
    proteinId?: string;
    proteinName?: string;
    proteinEmoji?: string;
  }>();
  const [tab, setTab] = useState<TabMode>('describe');
  const [pasteText, setPasteText] = useState('');
  const [describeText, setDescribeText] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedRecipe, setGeneratedRecipe] = useState<Record<string, unknown> | null>(null);
  const [lastInput, setLastInput] = useState({ text: '', mode: 'describe' as TabMode });

  const handleExtractOrGenerate = async () => {
    if (tab === 'photo') return;
    const text = (tab === 'paste' ? pasteText : describeText).trim();
    if (!text) {
      Alert.alert('', 'Please paste or describe a recipe first');
      return;
    }
    if (!ANTHROPIC_KEY) {
      Alert.alert('', 'AI is not configured. Set EXPO_PUBLIC_ANTHROPIC_KEY.');
      return;
    }
    setLoading(true);
    setGeneratedRecipe(null);
    setLastInput({ text, mode: tab });
    try {
      const result = await callClaudeAPI(text, tab);
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
    if (!lastInput.text.trim()) return;
    setGeneratedRecipe(null);
    setLoading(true);
    callClaudeAPI(lastInput.text, lastInput.mode)
      .then(setGeneratedRecipe)
      .catch((e) => {
        const msg =
          e instanceof SyntaxError ? 'Could not read the recipe, try again' : 'AI is busy, please try again';
        Alert.alert('', msg);
      })
      .finally(() => setLoading(false));
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

  const handleChipPress = (label: string) => {
    setDescribeText((prev) => (prev ? `${prev}\n${label}` : label));
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
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>AI Recipe Builder</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tab, tab === 'describe' && styles.tabActive]}
            onPress={() => setTab('describe')}
            activeOpacity={0.8}
          >
            <Text style={styles.tabText}>💬 Describe</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'paste' && styles.tabActive]}
            onPress={() => setTab('paste')}
            activeOpacity={0.8}
          >
            <Text style={styles.tabText}>📋 Paste</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'photo' && styles.tabActive]}
            onPress={() => setTab('photo')}
            activeOpacity={0.8}
          >
            <Text style={styles.tabText}>📸 Photo</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {tab === 'describe' && (
            <>
              <TextInput
                style={[styles.input, styles.inputDescribe]}
                placeholder={
                  proteinName
                    ? `e.g. Create a healthy high-protein ${proteinName} recipe with Indian spices under 25 minutes`
                    : 'e.g. Create a healthy high protein easy to cook shrimp recipe with Indian spices under 20 minutes'
                }
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={describeText}
                onChangeText={setDescribeText}
                multiline
                editable={!loading}
              />
              <View style={styles.chipsWrap}>
                {SUGGESTION_CHIPS.map((label) => (
                  <TouchableOpacity
                    key={label}
                    style={styles.chip}
                    onPress={() => handleChipPress(label)}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.chipText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleExtractOrGenerate}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>🤖 Generate Recipe with AI</Text>
              </TouchableOpacity>
            </>
          )}

          {tab === 'paste' && (
            <>
              <TextInput
                style={[styles.input, styles.inputPaste]}
                placeholder="Paste any recipe here — ingredients, instructions, anything. AI will extract everything."
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={pasteText}
                onChangeText={setPasteText}
                multiline
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleExtractOrGenerate}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>✨ Extract Recipe with AI</Text>
              </TouchableOpacity>
            </>
          )}

          {tab === 'photo' && (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>📸 Photo of recipe</Text>
              <Text style={styles.photoPlaceholderSubtext}>
                Take or upload a photo of a recipe — AI will read it and build your recipe. Coming in v2.0.
              </Text>
            </View>
          )}

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
      </KeyboardAvoidingView>
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
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: TAB_INACTIVE,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: TAB_ACTIVE },
  tabText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  input: {
    backgroundColor: GLASS,
    color: '#fff',
    borderRadius: 16,
    padding: 16,
    fontSize: 14,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
  },
  inputPaste: { height: 280, marginBottom: 20, textAlignVertical: 'top' },
  inputDescribe: { height: 160, marginBottom: 12, textAlignVertical: 'top' },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    backgroundColor: BORDER_LIGHT,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  chipText: { color: '#fff', fontSize: 13 },
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
  photoPlaceholder: {
    backgroundColor: GLASS,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    alignItems: 'center',
    marginBottom: 24,
  },
  photoPlaceholderText: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  photoPlaceholderSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
  },
});
