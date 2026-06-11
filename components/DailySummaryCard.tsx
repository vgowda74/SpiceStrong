/**
 * DailySummaryCard.tsx — Daily Nutrition Summary Card
 * Premium glassmorphism card showing macro breakdown
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface MacroSummary {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface MacroTarget {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface DailySummaryCardProps {
  consumed: MacroSummary;
  targets: MacroTarget;
  onEdit?: () => void;
}

const DailySummaryCard: React.FC<DailySummaryCardProps> = ({
  consumed,
  targets,
  onEdit,
}) => {
  const metrics = [
    {
      name: 'Calories',
      icon: '🔥',
      consumed: consumed.calories,
      target: targets.calories,
      unit: '',
    },
    {
      name: 'Protein',
      icon: '💪',
      consumed: consumed.proteinG,
      target: targets.proteinG,
      unit: 'g',
    },
    {
      name: 'Carbs',
      icon: '🌾',
      consumed: consumed.carbsG,
      target: targets.carbsG,
      unit: 'g',
    },
    {
      name: 'Fat',
      icon: '🥑',
      consumed: consumed.fatG,
      target: targets.fatG,
      unit: 'g',
    },
  ];

  // Calculate overall completion
  const overallPercent = Math.round(
    ((consumed.calories / targets.calories) * 100)
  );

  const caloriesDiff = targets.calories - consumed.calories;
  const isOver = caloriesDiff < 0;
  const statusText = isOver
    ? `${Math.abs(caloriesDiff)} over target`
    : `${caloriesDiff} remaining`;
  const statusColor = isOver ? '#EF4444' : '#10B981';

  return (
    <LinearGradient
      colors={['rgba(232, 168, 124, 0.08)', 'rgba(143, 58, 31, 0.08)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>📊 Daily Summary</Text>
            <Text style={styles.subtitle}>
              {overallPercent}% of daily goal
            </Text>
          </View>
          {onEdit && (
            <Pressable style={styles.editBtn} onPress={onEdit}>
              <Ionicons name="settings-outline" size={18} color="#E8A87C" />
            </Pressable>
          )}
        </View>

        {/* Macro Grid */}
        <View style={styles.grid}>
          {metrics.map((metric) => {
            const percent = Math.round((metric.consumed / metric.target) * 100);
            const isMet = metric.consumed >= metric.target;
            const statusColor = isMet ? '#10B981' : 'rgba(248, 241, 232, 0.5)';

            return (
              <View key={metric.name} style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <Text style={styles.metricIcon}>{metric.icon}</Text>
                  <Text style={styles.metricName}>{metric.name}</Text>
                </View>

                {/* Progress bar */}
                <View style={styles.barContainer}>
                  <View style={styles.barTrack} />
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.min(percent, 100)}%`,
                        backgroundColor: isMet ? '#10B981' : '#F59E0B',
                      },
                    ]}
                  />
                </View>

                {/* Values */}
                <View style={styles.metricValues}>
                  <Text style={styles.consumed}>
                    {metric.consumed}
                    <Text style={styles.unit}>{metric.unit}</Text>
                  </Text>
                  <Text style={[styles.target, { color: statusColor }]}>
                    {percent}%
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Status Footer */}
        <View style={styles.footer}>
          <View style={styles.statusBadge}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: statusColor },
              ]}
            />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusText}
            </Text>
          </View>
          {!isOver && caloriesDiff > 200 && (
            <Text style={styles.suggestion}>💡 Time for a snack?</Text>
          )}
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(232, 168, 124, 0.15)',
  },
  card: {
    padding: 16,
    backgroundColor: 'rgba(26, 24, 21, 0.6)',
    backdropFilter: 'blur(20px)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F8F1E8',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(248, 241, 232, 0.55)',
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(232, 168, 124, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232, 168, 124, 0.25)',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: 'rgba(248, 241, 232, 0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(248, 241, 232, 0.1)',
    padding: 12,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  metricIcon: {
    fontSize: 20,
  },
  metricName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8F1E8',
  },
  barContainer: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(248, 241, 232, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(248, 241, 232, 0.12)',
    position: 'relative',
  },
  barTrack: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  metricValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  consumed: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8F1E8',
  },
  unit: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(248, 241, 232, 0.55)',
    marginLeft: 2,
  },
  target: {
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(248, 241, 232, 0.08)',
    paddingTop: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  suggestion: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(248, 241, 232, 0.55)',
    marginTop: 6,
  },
});

export default DailySummaryCard;
