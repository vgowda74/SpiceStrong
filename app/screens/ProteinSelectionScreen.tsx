import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
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
import type { ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';

/** Custom images for proteins (replaces emoji). */
const PROTEIN_IMAGES: Record<string, ImageSourcePropType> = {
  chicken: require('../../assets/images/Protein/Chicken.jpg'),
  beef: require('../../assets/images/Protein/Beef.jpg'),
  lamb: require('../../assets/images/Protein/Lamb.jpg'),
  goat: require('../../assets/images/Protein/goat.jpg'),
  pork: require('../../assets/images/Protein/Pork.jpg'),
  fish: require('../../assets/images/Protein/Fish.jpg'),
  prawns: require('../../assets/images/Protein/Prawn.jpg'),
  eggs: require('../../assets/images/Protein/Egg.jpg'),
  paneer: require('../../assets/images/Protein/paneer_small.png'),
  tofu: require('../../assets/images/Protein/Tofu.jpg'),
  soy: require('../../assets/images/Protein/Soy.jpg'),
  beans: require('../../assets/images/Protein/Beans.jpg'),
  milk: require('../../assets/images/Protein/Dairy.jpg'),
  whey: require('../../assets/images/Protein/ProteinPowder.jpg'),
};
import { PROTEINS } from '../../src/theme';
import { ProfileMenu } from '../../components/ProfileMenu';

const screenWidth = Dimensions.get('window').width;
const CARD_WIDTH = (screenWidth - 56) / 2;
const CARD_HEIGHT = 120;

const FILTERS = ['All', 'Non-Veg', 'Vegetarian'] as const;
type Filter = (typeof FILTERS)[number];

/** Enabled proteins — set to empty array to enable all. */
const ENABLED_PROTEINS: string[] = [];

const HEADER_BG = '#2A1005';
const BODY_BG = '#FAF7F2';
const SEARCH_BG = '#3D1A0A';
const ORANGE = '#E85D26';


function filterMatches(filter: Filter, category: 'NON-VEG' | 'VEG'): boolean {
  if (filter === 'All') return true;
  if (filter === 'Non-Veg') return category === 'NON-VEG';
  if (filter === 'Vegetarian') return category === 'VEG';
  return true;
}

type ProteinItem = (typeof PROTEINS)[0];

function ProteinCard({
  item,
  onPress,
  disabled,
}: {
  item: ProteinItem;
  onPress: () => void;
  disabled?: boolean;
}) {
  const hasImage = !!PROTEIN_IMAGES[item.id];

  return (
    <TouchableOpacity
      style={[styles.card, disabled && styles.cardDisabled]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={disabled ? 1 : 0.8}
    >
      {hasImage ? (
        <>
          <Image source={PROTEIN_IMAGES[item.id]} style={styles.cardFullImage} contentFit="cover" transition={200} />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={styles.cardGradient}
            pointerEvents="none"
          />
          <Text style={[styles.proteinNameOverlay, disabled && styles.proteinNameDisabled]} numberOfLines={1}>
            {item.name}
          </Text>
        </>
      ) : (
        <>
          <View style={[styles.emojiCircle, disabled && styles.emojiCircleDisabled]}>
            <Text style={styles.emojiText}>{item.emoji}</Text>
          </View>
          <Text style={[styles.proteinName, disabled && styles.proteinNameDisabled]} numberOfLines={1}>
            {item.name}
          </Text>
        </>
      )}
      {disabled && (
        <View style={styles.comingSoonBadge}>
          <Text style={styles.comingSoonText}>🔒 Coming Soon</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ProteinSelectionScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');

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
      source={require('../../assets/images/splash-bg.jpg')}
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
          <View style={styles.headerTopRow}>
            <ProfileMenu />
            <Text style={styles.headingLine1}>What's your <Text style={styles.headingLine2}>protein?</Text></Text>
          </View>
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
                  renderItem={({ item }) => {
                    const isLocked = ENABLED_PROTEINS.length > 0 && !ENABLED_PROTEINS.includes(item.id);
                    return (
                      <ProteinCard item={item} onPress={() => navigateToRecipes(item)} disabled={isLocked} />
                    );
                  }}
                  columnWrapperStyle={styles.gridRow}
                  initialNumToRender={20}
                />
              </View>
            </>
          )}

          {veg.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>VEGETARIAN</Text>
              <View style={styles.gridWrap}>
                <FlatList
                  key="two-col"
                  data={veg}
                  numColumns={2}
                  scrollEnabled={false}
                  nestedScrollEnabled={true}
                  keyExtractor={(p) => p.id}
                  renderItem={({ item }) => {
                    const isLocked = ENABLED_PROTEINS.length > 0 && !ENABLED_PROTEINS.includes(item.id);
                    return (
                      <ProteinCard item={item} onPress={() => navigateToRecipes(item)} disabled={isLocked} />
                    );
                  }}
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
    paddingTop: 90,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  headingLine1: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
  },
  headingLine2: {
    color: ORANGE,
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
    paddingHorizontal: 4,
    gap: 10,
    alignItems: 'center',
    flexGrow: 1,
  },
  filterBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    flexShrink: 0,
    flex: 1,
    alignItems: 'center',
  },
  filterActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  filterText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scanFridgeCard: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(232,93,38,0.30)',
    ...Platform.select({
      ios: { shadowColor: '#E85D26', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  scanFridgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14,
  },
  scanFridgeEmoji: { fontSize: 32 },
  scanFridgeTextBlock: { flex: 1 },
  scanFridgeTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  scanFridgeSub: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  scanFridgeArrow: { fontSize: 24, fontWeight: '700', color: ORANGE },
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
    backgroundColor: '#1A0A00',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 8,
    overflow: 'hidden',
    borderBottomWidth: 4,
    borderRightWidth: 2,
    borderBottomColor: '#2D1A0E',
    borderRightColor: '#2D1A0E',
  },
  cardFullImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  cardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  proteinNameOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 8,
    right: 8,
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
    }),
  },
  emojiCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF3E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
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
  },
  // Disabled / Coming Soon styles
  cardDisabled: {
    opacity: 0.45,
  },
  emojiCircleDisabled: {
    backgroundColor: '#E0E0E0',
    shadowOpacity: 0,
    elevation: 0,
  },
  proteinNameDisabled: {
    color: '#888',
  },
  comingSoonBadge: {
    marginTop: 4,
  },
  comingSoonText: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
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
