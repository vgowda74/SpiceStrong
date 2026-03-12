import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  ImageBackground,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { PROTEINS } from '../../src/theme';

const screenWidth = Dimensions.get('window').width;
const CARD_WIDTH = (screenWidth - 56) / 2;
const CARD_HEIGHT = 150;

const FILTERS = ['All', 'Non-Veg', 'Vegetarian', 'Vegan'] as const;
type Filter = (typeof FILTERS)[number];

const HEADER_BG = '#2A1005';
const BODY_BG = '#FAF7F2';
const SEARCH_BG = '#3D1A0A';
const ORANGE = '#E85D26';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'GOOD MORNING, CHEF';
  if (hour < 17) return 'GOOD AFTERNOON, CHEF';
  return 'GOOD EVENING, CHEF';
}

function filterMatches(filter: Filter, category: 'NON-VEG' | 'VEG'): boolean {
  if (filter === 'All') return true;
  if (filter === 'Non-Veg') return category === 'NON-VEG';
  if (filter === 'Vegetarian' || filter === 'Vegan') return category === 'VEG';
  return true;
}

type ProteinItem = (typeof PROTEINS)[0];

function ProteinCard({
  item,
  onPress,
}: {
  item: ProteinItem;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.emojiCircle}>
        <Text style={styles.emojiText}>{item.emoji}</Text>
      </View>
      <Text style={styles.proteinName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.proteinGrams}>
        {item.proteinPer100g}g protein / 100g
      </Text>
      <View style={styles.categoryBadge}>
        <Text style={styles.categoryBadgeText}>{item.category}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ProteinSelectionScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');

  const greeting = useMemo(() => getGreeting(), []);

  const filtered = useMemo(() => {
    return PROTEINS.filter((p) => {
      const matchesFilter = filterMatches(activeFilter, p.category);
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, search]);

  const nonVeg = filtered.filter((p) => p.category === 'NON-VEG');
  const veg = filtered.filter((p) => p.category === 'VEG');

  const navigateToRecipes = (item: (typeof PROTEINS)[0]) => {
    router.push({
      pathname: '/screens/RecipeListScreen',
      params: { proteinId: item.id, proteinName: item.name, proteinEmoji: item.emoji },
    });
  };

  return (
    <ImageBackground
      source={require('../../assets/images/splash-bg.png')}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      <View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.45)',
        }}
      />
      <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        keyboardDismissMode="on-drag"
      >
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.headingLine1}>What's your</Text>
          <Text style={styles.headingLine2}>protein today?</Text>
          <TextInput
            style={styles.search}
            placeholder="Search proteins..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* BODY */}
        <View style={styles.body}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersScrollContent}
            style={styles.filtersScroll}
            nestedScrollEnabled={true}
          >
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterBtn, activeFilter === f && styles.filterActive]}
                onPress={() => setActiveFilter(f)}
              >
                <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {nonVeg.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>NON-VEGETARIAN</Text>
              <View style={styles.gridWrap}>
                <FlatList
                  key="two-col"
                  data={nonVeg}
                  numColumns={2}
                  scrollEnabled={false}
                  nestedScrollEnabled={true}
                  keyExtractor={(p) => p.id}
                  renderItem={({ item }) => (
                    <ProteinCard item={item} onPress={() => navigateToRecipes(item)} />
                  )}
                  columnWrapperStyle={styles.gridRow}
                  initialNumToRender={20}
                />
              </View>
            </>
          )}

          {veg.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>VEGETARIAN & VEGAN</Text>
              <View style={styles.gridWrap}>
                <FlatList
                  key="two-col"
                  data={veg}
                  numColumns={2}
                  scrollEnabled={false}
                  nestedScrollEnabled={true}
                  keyExtractor={(p) => p.id}
                  renderItem={({ item }) => (
                    <ProteinCard item={item} onPress={() => navigateToRecipes(item)} />
                  )}
                  columnWrapperStyle={styles.gridRow}
                  initialNumToRender={20}
                />
              </View>
            </>
          )}
        </View>
      </ScrollView>

      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  greeting: {
    fontSize: 12,
    letterSpacing: 3,
    color: '#9CA3AF',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  headingLine1: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
  },
  headingLine2: {
    fontSize: 32,
    fontWeight: '700',
    color: ORANGE,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    marginBottom: 20,
  },
  search: {
    backgroundColor: SEARCH_BG,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#E5E7EB',
    fontSize: 16,
  },
  body: {
    backgroundColor: 'transparent',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  filtersScroll: {
    marginBottom: 16,
  },
  filtersScrollContent: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    alignItems: 'center',
  },
  filterBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    flexShrink: 0,
  },
  filterActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  filterText: {
    color: '#6B7280',
    fontSize: 14,
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sectionHeader: {
    fontSize: 11,
    letterSpacing: 3,
    color: '#6B7280',
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  gridWrap: {
    marginHorizontal: 4,
    marginBottom: 24,
  },
  gridRow: {
    marginBottom: 12,
    justifyContent: 'space-between',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 8,
    overflow: 'visible',
    borderBottomWidth: 4,
    borderRightWidth: 2,
    borderBottomColor: '#D4D4D4',
    borderRightColor: '#E0E0E0',
  },
  emojiCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF3E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 6,
    shadowColor: '#E85D26',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  emojiText: {
    fontSize: 30,
  },
  proteinName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A0A00',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  proteinGrams: {
    fontSize: 12,
    color: '#E85D26',
    textAlign: 'center',
  },
  categoryBadge: {
    backgroundColor: '#E85D26',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 'auto',
    marginBottom: 10,
  },
  categoryBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  fabAI: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: ORANGE,
    borderRadius: 30,
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ORANGE,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  fabAIText: { fontSize: 28 },
});
