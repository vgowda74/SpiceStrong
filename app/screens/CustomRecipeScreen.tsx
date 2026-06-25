import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { saveRecipe, getRecipes, QUANTITY_TIERS, type QuantityTier, type IngredientsByTier } from '../../src/store/recipes';

const defaultIngredientsByTier = (): IngredientsByTier => ({
  '2-3 servings': [{ name: '', quantity: '' }],
  '4-6 servings': [],
});

export default function CustomRecipeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    proteinId: string;
    proteinName: string;
    proteinEmoji: string;
    recipeId?: string;
  }>();
  const { proteinId, proteinName, proteinEmoji, recipeId } = params;
  const recipeIdStr = typeof recipeId === 'string' ? recipeId : Array.isArray(recipeId) ? recipeId[0] : undefined;

  const [recipeName, setRecipeName] = useState('');
  const [ingredientsByTier, setIngredientsByTier] = useState<IngredientsByTier>(defaultIngredientsByTier);
  const [selectedTier, setSelectedTier] = useState<QuantityTier>('2-3 servings');
  const [steps, setSteps] = useState([{ title: '', description: '' }]);
  const [chefTip, setChefTip] = useState('');
  const [existingId, setExistingId] = useState<string | null>(null);
  const [existingCreatedAt, setExistingCreatedAt] = useState<number>(Date.now());
  const [loaded, setLoaded] = useState(!recipeIdStr);

  useEffect(() => {
    if (!recipeIdStr) {
      setLoaded(true);
      return;
    }
    getRecipes().then((all) => {
      const recipe = all.find((r) => r.id === recipeIdStr);
      if (recipe) {
        setRecipeName(recipe.name);
        const ing = recipe.ingredients;
        setIngredientsByTier({
          '2-3 servings': ing['2-3 servings']?.length ? ing['2-3 servings'] : [{ name: '', quantity: '' }],
          '4-6 servings': ing['4-6 servings']?.length ? ing['4-6 servings'] : [],
        });
        setSteps(recipe.steps.length > 0 ? recipe.steps : [{ title: '', description: '' }]);
        setChefTip(recipe.chefTip ?? '');
        setExistingId(recipe.id);
        setExistingCreatedAt(recipe.createdAt ?? Date.now());
      }
      setLoaded(true);
    });
  }, [recipeIdStr]);

  const currentIngredients = ingredientsByTier[selectedTier];
  const addIngredient = () => {
    setIngredientsByTier((prev) => ({
      ...prev,
      [selectedTier]: [...prev[selectedTier], { name: '', quantity: '' }],
    }));
  };
  const addStep = () => setSteps([...steps, { title: '', description: '' }]);

  const updateIngredient = (tier: QuantityTier, index: number, field: 'name' | 'quantity', value: string) => {
    setIngredientsByTier((prev) => {
      const list = [...prev[tier]];
      if (list[index]) list[index] = { ...list[index], [field]: value };
      return { ...prev, [tier]: list };
    });
  };

  const updateStep = (index: number, field: 'title' | 'description', value: string) => {
    const updated = [...steps];
    updated[index][field] = value;
    setSteps(updated);
  };

const handleSave = async () => {
    if (!recipeName.trim()) {
      Alert.alert('Missing Info', 'Please enter a recipe name.');
      return;
    }
    const mainTier = ingredientsByTier['2-3 servings'].filter((i) => i.name.trim());
    if (mainTier.length === 0) {
      Alert.alert('Missing Info', 'Please add at least one ingredient.');
      return;
    }
    if (!steps[0].description.trim()) {
      Alert.alert('Missing Info', 'Please add at least one cooking step.');
      return;
    }

    const isUpdate = !!existingId;
    const recipeToSave = {
      id: existingId ?? Date.now().toString(),
      name: recipeName,
      proteinId: proteinId as string,
      proteinName: proteinName as string,
      proteinEmoji: proteinEmoji as string,
      ingredients: ingredientsByTier,
      steps,
      chefTip,
      createdAt: isUpdate ? existingCreatedAt : Date.now(),
    };

    await saveRecipe(recipeToSave);
    Alert.alert(isUpdate ? 'Updated!' : 'Saved!', `${recipeName} has been ${isUpdate ? 'updated' : 'saved'}.`, [
      { text: 'OK', onPress: () => router.back() }
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={{
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
      }} />
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={styles.backText}>←</Text>
      </TouchableOpacity>

      <Text style={styles.header}>{existingId ? 'Edit' : 'New'} {proteinEmoji} {proteinName} Recipe</Text>

      {/* Recipe Name */}
      <Text style={styles.sectionTitle}>Recipe Name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Spicy Chicken Curry"
        placeholderTextColor="#555"
        value={recipeName}
        onChangeText={setRecipeName}
      />

      {/* Ingredients */}
      <Text style={styles.sectionTitle}>Ingredients</Text>
      <View style={styles.tierTabs}>
        {QUANTITY_TIERS.map((tier) => (
          <TouchableOpacity
            key={tier}
            style={[styles.tierTab, selectedTier === tier && styles.tierTabActive]}
            onPress={() => setSelectedTier(tier)}
          >
            <Text style={[styles.tierTabText, selectedTier === tier && styles.tierTabTextActive]}>{tier}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {currentIngredients.length === 0 ? (
        <TouchableOpacity style={styles.addBtn} onPress={addIngredient}>
          <Text style={styles.addBtnText}>+ Add first ingredient for {selectedTier}</Text>
        </TouchableOpacity>
      ) : (
        <>
          {currentIngredients.map((ing, i) => (
            <View key={i} style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex2]}
                placeholder="Ingredient"
                placeholderTextColor="#555"
                value={ing.name}
                onChangeText={(v) => updateIngredient(selectedTier, i, 'name', v)}
              />
              <TextInput
                style={[styles.input, styles.flex1]}
                placeholder="Qty"
                placeholderTextColor="#555"
                value={ing.quantity}
                onChangeText={(v) => updateIngredient(selectedTier, i, 'quantity', v)}
              />
            </View>
          ))}
          <TouchableOpacity style={styles.addBtn} onPress={addIngredient}>
            <Text style={styles.addBtnText}>+ Add Ingredient</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Steps */}
      <Text style={styles.sectionTitle}>Cooking Steps</Text>
      {steps.map((step, i) => (
        <View key={i} style={styles.stepCard}>
          <Text style={styles.stepNumber}>Step {i + 1}</Text>
          <TextInput
            style={styles.input}
            placeholder="Step title (e.g. Marinate)"
            placeholderTextColor="#555"
            value={step.title}
            onChangeText={v => updateStep(i, 'title', v)}
          />
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Describe what to do..."
            placeholderTextColor="#555"
            value={step.description}
            onChangeText={v => updateStep(i, 'description', v)}
            multiline
            numberOfLines={3}
          />
        </View>
      ))}
      <TouchableOpacity style={styles.addBtn} onPress={addStep}>
        <Text style={styles.addBtnText}>+ Add Step</Text>
      </TouchableOpacity>

      {/* Chef's Tip */}
      <Text style={styles.sectionTitle}>Chef's Tip (optional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Any secret tips?"
        placeholderTextColor="#555"
        value={chefTip}
        onChangeText={setChefTip}
        multiline
        numberOfLines={3}
      />

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save Recipe</Text>
      </TouchableOpacity>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0D0B09' },
  container: { flex: 1 },
  content: { padding: 16, paddingTop: 60, paddingBottom: 60 },
  backBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(13,11,9,0.54)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  backText: { color: '#FFFFFF', fontSize: 28, lineHeight: 30, fontWeight: '900' },
  header: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#8F3A1F', marginTop: 24, marginBottom: 10 },
  tierTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tierTab: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  tierTabActive: { borderColor: '#8F3A1F', backgroundColor: '#2A1A14' },
  tierTabText: { color: '#999', fontSize: 13, fontWeight: '600' },
  tierTabTextActive: { color: '#8F3A1F' },
  input: { backgroundColor: '#1A1A1A', borderRadius: 10, padding: 12, color: '#FFFFFF', borderWidth: 1, borderColor: '#333', marginBottom: 8 },
  multiline: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  stepCard: { backgroundColor: '#1A1A1A', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  stepNumber: { color: '#8F3A1F', fontWeight: 'bold', marginBottom: 8 },
  addBtn: { borderWidth: 1, borderColor: '#8F3A1F', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 8 },
  addBtnText: { color: '#8F3A1F', fontWeight: 'bold' },
  saveBtn: { backgroundColor: '#8F3A1F', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 32 },
  saveBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
});
