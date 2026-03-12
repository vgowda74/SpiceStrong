import React from 'react'
import {
  GestureResponderEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

export type RecipeDifficulty = 'Easy' | 'Medium' | 'Hard'

type Props = {
  name: string
  description?: string
  time: string
  protein: string
  difficulty: RecipeDifficulty
  rating?: string
  emoji?: string
  isFavorite?: boolean
  onPress: () => void
  onFavoriteToggle?: (e: GestureResponderEvent) => void
  accentColors?: readonly [string, string]
  actionRow?: React.ReactNode
}

export default function RecipeCard({
  name,
  description,
  time,
  protein,
  difficulty,
  rating,
  emoji = '🍽️',
  isFavorite = false,
  onPress,
  onFavoriteToggle,
  accentColors = ['#E87A2E', '#A63E16'],
  actionRow,
}: Props) {
  return (
    <Pressable onPress={onPress} style={styles.wrapper}>
      <View style={styles.card}>

        {/* HERO AREA */}
        <LinearGradient
          colors={accentColors as any}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.hero}
        >
          {/* Favorite */}
          <Pressable
            onPress={onFavoriteToggle}
            style={styles.favorite}
            hitSlop={10}
          >
            <Text style={styles.favoriteText}>
              {isFavorite ? '★' : '☆'}
            </Text>
          </Pressable>

          {/* Difficulty */}
          <View style={styles.difficulty}>
            <Text style={styles.difficultyText}>{difficulty}</Text>
          </View>

          <Text style={styles.emoji}>{emoji}</Text>
        </LinearGradient>

        {/* INFO */}
        <View style={styles.info}>
          {rating && (
            <View style={styles.rating}>
              <Text style={styles.ratingText}>★ {rating}</Text>
            </View>
          )}

          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>

          {description ? (
            <Text style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <Text style={styles.meta}>{time}</Text>
            <Text style={styles.meta}>{protein}</Text>
          </View>

          {actionRow}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({

  wrapper: {
    marginHorizontal: 18,
    marginVertical: 10,
  },

  card: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 5,
    borderRightWidth: 2,
    borderLeftWidth: 0.5,
    borderBottomColor: '#C8C8C8',
    borderRightColor: '#DCDCDC',
    borderLeftColor: '#F0F0F0',

    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.28,
        shadowRadius: 20,
        shadowOffset: { width: 4, height: 10 },
      },
      android: {
        elevation: 14,
      },
    }),
  },

  hero: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emoji: {
    fontSize: 44,
  },

  favorite: {
    position: 'absolute',
    top: 10,
    left: 10,
  },

  favoriteText: {
    fontSize: 20,
    color: '#fff',
  },

  difficulty: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },

  difficultyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  info: {
    padding: 14,
    backgroundColor: '#FEFEFE',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.8)',
  },

  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  description: {
    fontSize: 13,
    color: '#777',
    marginTop: 4,
  },

  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },

  meta: {
    fontSize: 13,
    color: '#444',
  },

  rating: {
    position: 'absolute',
    right: 14,
    top: 14,
  },

  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E87A2E',
  },
})
