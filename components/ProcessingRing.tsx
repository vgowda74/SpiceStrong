/**
 * ProcessingRing — predictive progress circle for AI/scan operations.
 *
 * Uses an exponential approach curve so the ring moves fast at first
 * and slows naturally near 89%, never lying by hitting 100% before done.
 * When `done` becomes true it snaps to 100%.
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface ProcessingRingProps {
  /** Short status line shown below the ring, e.g. "Analyzing food..." */
  label?: string;
  /** Optional sub-label shown smaller below the label */
  sublabel?: string;
  /** Ring diameter in px. Default 96. */
  size?: number;
  /** Ring stroke width in px. Default 8. */
  strokeWidth?: number;
  /** Ring color. Default SpiceStrong amber. */
  color?: string;
  /**
   * Expected total duration of the operation in ms.
   * Tunes the speed of the curve — ring reaches ~63% at this time.
   * Default 8000ms (8 s) suits most Claude Vision calls.
   */
  expectedMs?: number;
  /**
   * Set to true when the operation completes to snap the ring to 100%.
   * If you unmount the component on completion instead, this isn't needed.
   */
  done?: boolean;
}

export function ProcessingRing({
  label,
  sublabel,
  size = 96,
  strokeWidth = 8,
  color = '#E8A87C',
  expectedMs = 8000,
  done = false,
}: ProcessingRingProps) {
  const [pct, setPct] = useState(0);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const r = size / 2 - strokeWidth / 2 - 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  useEffect(() => {
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      // Exponential curve: approaches 90% asymptotically — never lies
      const progress = Math.round((1 - Math.exp(-elapsed / expectedMs)) * 90);
      setPct(Math.min(progress, 89));
    }, 120);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [expectedMs]);

  useEffect(() => {
    if (done) {
      if (timerRef.current) clearInterval(timerRef.current);
      setPct(100);
    }
  }, [done]);

  const dashOffset = circ * (1 - pct / 100);

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          {/* Track */}
          <Circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <Circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circ}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${cx},${cy}`}
          />
        </Svg>
        <Text style={[styles.pct, { color, fontSize: size * 0.21 }]}>{pct}%</Text>
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  pct: { fontWeight: '900' },
  label: {
    color: 'rgba(248,241,232,0.80)',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  sublabel: {
    color: 'rgba(248,241,232,0.45)',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 220,
    lineHeight: 16,
  },
});
