import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppDisplayThemeId = 'warmTan' | 'softBeige' | 'lightSand' | 'forestGreen';

export interface AppDisplayTheme {
  id: AppDisplayThemeId;
  name: string;
  description: string;
  background: string;
  headerBg: string;
  panelBg: string;
  panelBorder: string;
  controlBg: string;
  controlBorder: string;
  primaryText: string;
  secondaryText: string;
  mutedText: string;
  accent: string;
  shadow: string;
  textureOverlay: string;
}

export const DISPLAY_THEME_STORAGE_KEY = 'spicestrong_display_theme';

export const DISPLAY_THEMES: AppDisplayTheme[] = [
  {
    id: 'warmTan',
    name: 'Spice Clean',
    description: 'Bright fitness dashboard with SpiceStrong orange.',
    background: '#F6F4EF',
    headerBg: 'rgba(255,255,255,0.72)',
    panelBg: '#FFFFFF',
    panelBorder: 'rgba(17,24,39,0.08)',
    controlBg: 'rgba(17,24,39,0.05)',
    controlBorder: 'rgba(17,24,39,0.09)',
    primaryText: '#101014',
    secondaryText: 'rgba(16,16,20,0.70)',
    mutedText: 'rgba(16,16,20,0.48)',
    accent: '#F06A1A',
    shadow: '#B9AA99',
    textureOverlay: 'rgba(255,255,255,0.32)',
  },
  {
    id: 'softBeige',
    name: 'Mint Guide',
    description: 'Nutrition-guide mint inspired by meal plan cards.',
    background: '#F2F6F1',
    headerBg: 'rgba(255,255,255,0.76)',
    panelBg: '#FFFFFF',
    panelBorder: 'rgba(20,83,45,0.09)',
    controlBg: 'rgba(36,128,92,0.08)',
    controlBorder: 'rgba(36,128,92,0.14)',
    primaryText: '#101814',
    secondaryText: 'rgba(16,24,20,0.68)',
    mutedText: 'rgba(16,24,20,0.46)',
    accent: '#18A76C',
    shadow: '#A7B9AD',
    textureOverlay: 'rgba(255,255,255,0.36)',
  },
  {
    id: 'lightSand',
    name: 'MyFitness Blue',
    description: 'Clean macro tracker feel with crisp blue accents.',
    background: '#F3F5FA',
    headerBg: 'rgba(255,255,255,0.78)',
    panelBg: '#FFFFFF',
    panelBorder: 'rgba(37,99,235,0.09)',
    controlBg: 'rgba(37,99,235,0.07)',
    controlBorder: 'rgba(37,99,235,0.14)',
    primaryText: '#0C111D',
    secondaryText: 'rgba(12,17,29,0.68)',
    mutedText: 'rgba(12,17,29,0.46)',
    accent: '#2563EB',
    shadow: '#A8B1C5',
    textureOverlay: 'rgba(255,255,255,0.34)',
  },
  {
    id: 'forestGreen',
    name: 'Energy Purple',
    description: 'Workout-app energy with purple action accents.',
    background: '#F4F2FA',
    headerBg: 'rgba(255,255,255,0.76)',
    panelBg: '#FFFFFF',
    panelBorder: 'rgba(124,58,237,0.10)',
    controlBg: 'rgba(124,58,237,0.08)',
    controlBorder: 'rgba(124,58,237,0.16)',
    primaryText: '#111018',
    secondaryText: 'rgba(17,16,24,0.68)',
    mutedText: 'rgba(17,16,24,0.46)',
    accent: '#8B5CF6',
    shadow: '#B0A8C8',
    textureOverlay: 'rgba(255,255,255,0.34)',
  },
];

const THEME_BY_ID = DISPLAY_THEMES.reduce((acc, theme) => {
  acc[theme.id] = theme;
  return acc;
}, {} as Record<AppDisplayThemeId, AppDisplayTheme>);

const listeners = new Set<(themeId: AppDisplayThemeId) => void>();

export function getDisplayTheme(themeId: AppDisplayThemeId | null | undefined): AppDisplayTheme {
  return THEME_BY_ID[themeId ?? 'warmTan'] ?? THEME_BY_ID.warmTan;
}

export async function getAppDisplayThemeId(): Promise<AppDisplayThemeId> {
  try {
    const saved = await AsyncStorage.getItem(DISPLAY_THEME_STORAGE_KEY);
    if (saved && saved in THEME_BY_ID) return saved as AppDisplayThemeId;
  } catch {}
  return 'warmTan';
}

export async function setAppDisplayThemeId(themeId: AppDisplayThemeId): Promise<void> {
  await AsyncStorage.setItem(DISPLAY_THEME_STORAGE_KEY, themeId);
  listeners.forEach((listener) => listener(themeId));
}

export function subscribeToDisplayTheme(listener: (themeId: AppDisplayThemeId) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppDisplayTheme(): AppDisplayTheme {
  const [themeId, setThemeId] = useState<AppDisplayThemeId>('warmTan');

  useEffect(() => {
    let mounted = true;
    getAppDisplayThemeId().then((savedThemeId) => {
      if (mounted) setThemeId(savedThemeId);
    }).catch(() => {});
    const unsubscribe = subscribeToDisplayTheme(setThemeId);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return getDisplayTheme(themeId);
}
