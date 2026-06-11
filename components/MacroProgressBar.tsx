/**
 * MacroProgressBar.tsx — Premium Macro Progress Component
 * Horizontal progress bar with gradient fill & animated transitions
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';

interface MacroProgressBarProps {
  label: string;
  target: number;
  consumed: number;
  unit: string;
  color: string; // Start color
  colorMid?: string; // Mid color (75%)
  colorFull?: string; // End color (>100%)
  height?: number;
  showPercentage?: boolean;
  showRemaining?: boolean;
}

const MacroProgressBar: React.FC<MacroProgressBarProps> = ({
  label,
  target,
  consumed,
  unit,
  color,
  colorMid = '#F59E0B',
  colorFull = '#EF4444',
  height = 8,
  showPercentage = true,
  showRemaining = true,
}) => {
  const percentage = Math.min((consumed / target) * 100, 100);
  const isOver = consumed > target;
  const remaining = Math.max(target - consumed, 0);

  const animProgress = useSharedValue(0);

  useEffect(() => {
    animProgress.value = withSpring(percentage / 100, {
      damping: 10,
      mass: 1,
      overshootClamping: false,
    });
  }, [percentage, animProgress]);

  const animatedBarStyle = useAnimatedStyle(() => {
    const widthPercent = animProgress.value * 100;
    // Color interpolation: green → yellow → red
    let finalColor = color;
    if (animProgress.value > 0.75) {
      const t = (animProgress.value - 0.75) / 0.25; // 0-1 for 75%-100%
      finalColor = interpolateColor(
        animProgress.value,
        [0.75, 1],
        [colorMid, colorFull]
      );
    } else if (animProgress.value > 0.5) {
      const t = (animProgress.value - 0.5) / 0.25; // 0-1 for 50%-75%
      finalColor = interpolateColor(
        animProgress.value,
        [0.5, 0.75],
        [color, colorMid]
      );
    }

    return {
      width: `${widthPercent}%`,
      backgroundColor: finalColor,
    };
  });

  const displayPercent = Math.round((consumed / target) * 100);

  return (
    <View style={styles.container}>
      {/* Header: Label + Stat */}
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.statRow}>
          <Text style={styles.stat}>
            {consumed} {isOver && '/'} {isOver ? target : ''} {unit}
          </Text>
          {showPercentage && (
            <Text style={[styles.percent, { color: isOver ? colorFull : color }]}>
              {displayPercent}%
            </Text>
          )}
        </View>
      </View>

      {/* Progress Bar Container */}
      <View style={[styles.barContainer, { height }]}>
        {/* Background track */}
        <View style={[styles.barTrack, { height }]} />

        {/* Animated fill */}
        <Animated.View style={[styles.barFill, { height }, animatedBarStyle]} />
      </View>

      {/* Footer: Consumed + Remaining */}
      {showRemaining && (
        <View style={styles.footer}>
          <Text style={styles.consumed}>
            {consumed} {unit} logged
          </Text>
          {!isOver ? (
            <Text style={styles.remaining}>
              {remaining} {unit} left
            </Text>
          ) : (
            <Text style={styles.over}>
              {consumed - target} {unit} over
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8F1E8',
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  stat: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(248, 241, 232, 0.75)',
  },
  percent: {
    fontSize: 13,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'right',
  },
  barContainer: {
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    borderRadius: 8,
    marginBottom: 6,
    position: 'relative',
  },
  barTrack: {
    position: 'absolute',
    width: '100%',
    backgroundColor: 'rgba(248, 241, 232, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(248, 241, 232, 0.12)',
  },
  barFill: {
    borderRadius: 8,
    width: '0%',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  consumed: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(248, 241, 232, 0.55)',
  },
  remaining: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  over: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
});

export default MacroProgressBar;
