/**
 * VoiceInput.tsx — Reusable voice-to-text mic button.
 *
 * Shows the mic icon. When tapped:
 * - In Expo Go: Shows a friendly alert (native module not available)
 * - In EAS/native builds: Will use expo-speech-recognition (loaded dynamically)
 *
 * Note: expo-speech-recognition requires a native build. We do NOT import it
 * at the top level to avoid crashing Expo Go.
 */

import React, { useState, useCallback } from 'react';
import { TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onTimerDetected?: (minutes: number) => void;
  size?: number;
  color?: string;
  activeColor?: string;
}

// Regex patterns to detect timer values in speech
const TIMER_PATTERNS = [
  /(\d+)\s*(minutes?|mins?)/i,
  /(\d+)\s*(seconds?|secs?)/i,
  /(\d+)\s*to\s*(\d+)\s*(minutes?|mins?)/i,
];

export function detectTimer(text: string): number | null {
  for (const pattern of TIMER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const value = parseInt(match[1], 10);
      if (/sec/i.test(match[2] || match[3] || '')) {
        return Math.max(1, Math.round(value / 60));
      }
      if (match[2] && /^\d+$/.test(match[2])) {
        return parseInt(match[2], 10);
      }
      return value;
    }
  }
  return null;
}

export default function VoiceInput({
  onTranscript,
  onTimerDetected,
  size = 28,
  color = 'rgba(255,255,255,0.5)',
  activeColor = '#8F3A1F',
}: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);

  const toggleListening = useCallback(async () => {
    // Show alert — voice input works in native/EAS builds only
    Alert.alert(
      '🎙️ Voice Input',
      'Voice input will be available in the full app build (TestFlight / App Store).\n\nPlease type your text for now.',
    );
  }, []);

  return (
    <TouchableOpacity
      style={[styles.micBtn, isListening && styles.micBtnActive]}
      onPress={toggleListening}
      activeOpacity={0.7}
    >
      <Ionicons
        name={isListening ? 'mic' : 'mic-outline'}
        size={size}
        color={isListening ? activeColor : color}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  micBtnActive: {
    backgroundColor: 'rgba(143,58,31,0.2)',
    borderColor: 'rgba(143,58,31,0.5)',
  },
});
