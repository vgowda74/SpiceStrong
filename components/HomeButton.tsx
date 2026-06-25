import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export function HomeButton() {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={() => router.push('/screens/ProteinSelectionScreen')}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      activeOpacity={0.75}
    >
      <Text style={styles.icon}>🏠</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  icon: { fontSize: 22 },
});
