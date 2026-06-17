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
    name: 'Warm Tan',
    description: 'Rich toasted tan with stronger contrast.',
    background: '#B99368',
    headerBg: 'rgba(122,82,45,0.26)',
    panelBg: 'rgba(128,91,57,0.22)',
    panelBorder: 'rgba(82,54,31,0.18)',
    controlBg: 'rgba(90,63,39,0.18)',
    controlBorder: 'rgba(72,45,25,0.18)',
    primaryText: '#FFFFFF',
    secondaryText: 'rgba(255,255,255,0.78)',
    mutedText: 'rgba(255,255,255,0.58)',
    accent: '#8F3A1F',
    shadow: '#4A2E1A',
    textureOverlay: 'rgba(255,255,255,0.05)',
  },
  {
    id: 'softBeige',
    name: 'Soft Beige',
    description: 'Creamy beige with dark text and gentle cards.',
    background: '#EADCC7',
    headerBg: 'rgba(255,255,255,0.24)',
    panelBg: 'rgba(201,178,145,0.24)',
    panelBorder: 'rgba(90,72,49,0.12)',
    controlBg: 'rgba(108,91,66,0.10)',
    controlBorder: 'rgba(91,74,52,0.13)',
    primaryText: '#2A251E',
    secondaryText: 'rgba(42,37,30,0.72)',
    mutedText: 'rgba(42,37,30,0.52)',
    accent: '#8F3A1F',
    shadow: '#7F6A4E',
    textureOverlay: 'rgba(255,255,255,0.18)',
  },
  {
    id: 'lightSand',
    name: 'Light Sand',
    description: 'Airy sand tone with the brightest app chrome.',
    background: '#EFE4D1',
    headerBg: 'rgba(255,255,255,0.20)',
    panelBg: 'rgba(218,199,169,0.26)',
    panelBorder: 'rgba(92,72,45,0.11)',
    controlBg: 'rgba(109,88,59,0.09)',
    controlBorder: 'rgba(92,72,45,0.12)',
    primaryText: '#27231D',
    secondaryText: 'rgba(39,35,29,0.70)',
    mutedText: 'rgba(39,35,29,0.50)',
    accent: '#C45A23',
    shadow: '#8D7657',
    textureOverlay: 'rgba(255,255,255,0.24)',
  },
  {
    id: 'forestGreen',
    name: 'Forest Green',
    description: 'Sage green background with earthy contrast.',
    background: '#D7DEC6',
    headerBg: 'rgba(255,255,255,0.18)',
    panelBg: 'rgba(129,151,103,0.18)',
    panelBorder: 'rgba(40,75,49,0.13)',
    controlBg: 'rgba(50,91,58,0.10)',
    controlBorder: 'rgba(35,73,45,0.14)',
    primaryText: '#17291A',
    secondaryText: 'rgba(23,41,26,0.72)',
    mutedText: 'rgba(23,41,26,0.52)',
    accent: '#2F7D44',
    shadow: '#546B4A',
    textureOverlay: 'rgba(255,255,255,0.16)',
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
