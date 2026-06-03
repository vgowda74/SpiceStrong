/**
 * CommunityReviewsModal.tsx — SpiceStrong
 * Bottom sheet modal showing community ratings breakdown and reviews.
 * Dark warm copper-brown theme matching app aesthetic.
 */

import React from 'react';
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { RecipeRatings } from '../services/ratingsService';
import { formatRelativeTime } from '../services/ratingsService';

interface Props {
  visible: boolean;
  onClose: () => void;
  recipeName: string;
  ratings: RecipeRatings;
}

const STAR_LEVELS = [5, 4, 3, 2, 1] as const;

const STAR_COLORS: Record<number, string> = {
  5: '#4CAF50',
  4: '#8BC34A',
  3: '#FFC107',
  2: '#FF9800',
  1: '#F44336',
};

function StarRow({ stars }: { stars: number }) {
  return (
    <Text style={modalStyles.reviewStars}>
      {'★'.repeat(stars)}
      {'☆'.repeat(5 - stars)}
    </Text>
  );
}

export function CommunityReviewsModal({ visible, onClose, recipeName, ratings }: Props) {
  const { averageRating, totalCount, distribution, reviews } = ratings;
  const maxDistribution = Math.max(...Object.values(distribution), 1);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          {/* Handle bar */}
          <View style={modalStyles.handleBar} />

          {/* Header */}
          <View style={modalStyles.header}>
            <Text style={modalStyles.headerTitle}>Community Ratings</Text>
            <Text style={modalStyles.recipeName} numberOfLines={1}>{recipeName}</Text>
          </View>

          {/* Rating summary */}
          <View style={modalStyles.summaryRow}>
            <View style={modalStyles.summaryLeft}>
              <Text style={modalStyles.bigRating}>{averageRating.toFixed(1)}</Text>
              <StarRow stars={Math.round(averageRating)} />
              <Text style={modalStyles.totalCount}>
                {totalCount} {totalCount === 1 ? 'rating' : 'ratings'}
              </Text>
            </View>

            {/* Distribution bars */}
            <View style={modalStyles.distributionCol}>
              {STAR_LEVELS.map((star) => {
                const count = distribution[star] ?? 0;
                const pct = totalCount > 0 ? (count / maxDistribution) * 100 : 0;
                return (
                  <View key={star} style={modalStyles.distRow}>
                    <Text style={modalStyles.distLabel}>{star}★</Text>
                    <View style={modalStyles.distBarBg}>
                      <View
                        style={[
                          modalStyles.distBarFill,
                          { width: `${pct}%`, backgroundColor: STAR_COLORS[star] },
                        ]}
                      />
                    </View>
                    <Text style={modalStyles.distCount}>{count}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Divider */}
          <View style={modalStyles.divider} />

          {/* Reviews header */}
          <Text style={modalStyles.reviewsTitle}>💬 Community Reviews</Text>

          {/* Reviews list */}
          {reviews.length > 0 ? (
            <FlatList
              data={reviews}
              keyExtractor={(item) => item.id}
              style={modalStyles.reviewsList}
              contentContainerStyle={modalStyles.reviewsContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={modalStyles.reviewCard}>
                  <View style={modalStyles.reviewHeader}>
                    <View style={modalStyles.reviewUserRow}>
                      <View style={modalStyles.avatar}>
                        <Text style={modalStyles.avatarText}>
                          {item.username.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={modalStyles.reviewUser}>{item.username}</Text>
                        <Text style={modalStyles.reviewTime}>
                          {formatRelativeTime(item.createdAt)}
                        </Text>
                      </View>
                    </View>
                    <StarRow stars={item.rating} />
                  </View>
                  <Text style={modalStyles.reviewComment}>"{item.comment}"</Text>
                </View>
              )}
            />
          ) : (
            <View style={modalStyles.emptyReviews}>
              <Text style={modalStyles.emptyEmoji}>💬</Text>
              <Text style={modalStyles.emptyText}>Be the first to review this recipe!</Text>
            </View>
          )}

          {/* Close button */}
          <TouchableOpacity style={modalStyles.closeBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={modalStyles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1008',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: -8 },
      },
      android: { elevation: 24 },
    }),
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  recipeName: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 24,
    marginBottom: 20,
  },
  summaryLeft: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  bigRating: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFD700',
    letterSpacing: -1,
  },
  totalCount: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },

  // Distribution
  distributionCol: {
    flex: 1,
    gap: 6,
    justifyContent: 'center',
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  distLabel: {
    width: 26,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    textAlign: 'right',
  },
  distBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  distBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  distCount: {
    width: 30,
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '600',
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 24,
    marginBottom: 16,
  },

  // Reviews
  reviewsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  reviewsList: {
    maxHeight: 300,
  },
  reviewsContent: {
    paddingHorizontal: 24,
    gap: 12,
    paddingBottom: 8,
  },
  reviewCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  reviewUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#8F3A1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  reviewUser: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  reviewTime: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
  },
  reviewStars: {
    fontSize: 14,
    color: '#FFD700',
    letterSpacing: 1,
  },
  reviewComment: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 20,
    fontStyle: 'italic',
  },

  // Empty state
  emptyReviews: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
  },

  // Close button
  closeBtn: {
    marginTop: 16,
    marginHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default CommunityReviewsModal;
