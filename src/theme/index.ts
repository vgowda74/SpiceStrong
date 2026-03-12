export const Colors = {
  primary: '#E85D26',
  primaryLight: '#FF7A45',
  background: '#0F0F0F',
  surface: '#1A1A1A',
  surfaceLight: '#252525',
  text: '#FFFFFF',
  textSecondary: '#999999',
  success: '#4CAF50',
  border: '#333333',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export type ProteinCategory = 'NON-VEG' | 'VEG';

export const PROTEINS = [
  { id: 'chicken', name: 'Chicken', emoji: '🍗', proteinPer100g: 31, category: 'NON-VEG' as ProteinCategory },
  { id: 'lamb', name: 'Lamb', emoji: '🥩', proteinPer100g: 26, category: 'NON-VEG' as ProteinCategory },
  { id: 'goat', name: 'Goat', emoji: '🐐', proteinPer100g: 27, category: 'NON-VEG' as ProteinCategory },
  { id: 'pork', name: 'Pork', emoji: '🥩', proteinPer100g: 27, category: 'NON-VEG' as ProteinCategory },
  { id: 'fish', name: 'Fish', emoji: '🐟', proteinPer100g: 22, category: 'NON-VEG' as ProteinCategory },
  { id: 'prawns', name: 'Prawns', emoji: '🦐', proteinPer100g: 24, category: 'NON-VEG' as ProteinCategory },
  { id: 'paneer', name: 'Paneer', emoji: '🧀', proteinPer100g: 18, category: 'VEG' as ProteinCategory },
  { id: 'tofu', name: 'Tofu', emoji: '🟫', proteinPer100g: 17, category: 'VEG' as ProteinCategory },
  { id: 'soy', name: 'Soy', emoji: '🫘', proteinPer100g: 36, category: 'VEG' as ProteinCategory },
  { id: 'beans', name: 'Beans', emoji: '🫘', proteinPer100g: 22, category: 'VEG' as ProteinCategory },
  { id: 'eggs', name: 'Eggs', emoji: '🥚', proteinPer100g: 13, category: 'VEG' as ProteinCategory },
];
