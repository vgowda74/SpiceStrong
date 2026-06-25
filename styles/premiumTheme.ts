/**
 * premiumTheme.ts — Premium Color Palette & Styling Constants
 * Use these throughout your app for consistency
 */

export const COLORS = {
  // Backgrounds
  background: '#0F0E0C',
  surfaceLight: '#1A1815',
  surfaceDark: '#0D0B09',
  
  // Borders & Dividers
  border: 'rgba(248, 241, 232, 0.08)',
  borderHeavy: 'rgba(248, 241, 232, 0.12)',
  
  // Text
  textPrimary: '#F8F1E8',
  textSecondary: 'rgba(248, 241, 232, 0.75)',
  textTertiary: 'rgba(248, 241, 232, 0.55)',
  
  // Accents
  accent: '#E8A87C', // Warm gold
  accentDark: '#8F3A1F', // Rust/brown
  
  // Status Colors
  success: '#10B981', // Emerald green
  warning: '#F59E0B', // Amber yellow
  danger: '#EF4444', // Red
  info: '#3B82F6', // Blue
  
  // Macro Colors
  calories: '#F5A524', // Warm orange
  protein: '#EC4899', // Pink/magenta
  carbs: '#3B82F6', // Blue
  fat: '#10B981', // Teal/green
};

export const SHADOWS = {
  // Elevation 1 (small items)
  sm: {
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  
  // Elevation 2 (cards)
  md: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  
  // Elevation 3 (modals)
  lg: {
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
};

export const RADIUS = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 9999,
};

export const TYPOGRAPHY = {
  // Headers
  h1: {
    fontSize: 32,
    fontWeight: '900' as const,
    lineHeight: 40,
  },
  h2: {
    fontSize: 28,
    fontWeight: '900' as const,
    lineHeight: 36,
  },
  h3: {
    fontSize: 24,
    fontWeight: '900' as const,
    lineHeight: 32,
  },
  h4: {
    fontSize: 20,
    fontWeight: '800' as const,
    lineHeight: 28,
  },
  
  // Body
  body: {
    fontSize: 16,
    fontWeight: '500' as const,
    lineHeight: 24,
  },
  bodyLarge: {
    fontSize: 18,
    fontWeight: '500' as const,
    lineHeight: 26,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 20,
  },
  
  // Labels
  label: {
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 16,
    letterSpacing: 0.5,
  },
  labelSmall: {
    fontSize: 10,
    fontWeight: '700' as const,
    lineHeight: 14,
    letterSpacing: 0.4,
  },
  
  // Captions
  caption: {
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeight: 16,
  },
};

// Macro color gradients
export const MACRO_GRADIENTS = {
  calories: ['#F59E0B', '#F5A524', '#F59E0B'],
  protein: ['#EC4899', '#E11D48', '#EC4899'],
  carbs: ['#3B82F6', '#2563EB', '#3B82F6'],
  fat: ['#10B981', '#059669', '#10B981'],
};

// Glassmorphism effect (iOS style)
export const GLASS = {
  light: {
    backgroundColor: 'rgba(248, 241, 232, 0.05)',
    borderColor: 'rgba(248, 241, 232, 0.1)',
    backdropFilter: 'blur(10px)',
  },
  medium: {
    backgroundColor: 'rgba(248, 241, 232, 0.08)',
    borderColor: 'rgba(248, 241, 232, 0.15)',
    backdropFilter: 'blur(20px)',
  },
  heavy: {
    backgroundColor: 'rgba(248, 241, 232, 0.12)',
    borderColor: 'rgba(248, 241, 232, 0.2)',
    backdropFilter: 'blur(30px)',
  },
};

// Animation presets
export const ANIMATIONS = {
  // Bounce spring config
  bounce: {
    damping: 8,
    mass: 1,
    overshootClamping: false,
    restSpeedThreshold: 2,
    restDisplacementThreshold: 2,
  },
  
  // Smooth spring config
  smooth: {
    damping: 12,
    mass: 1,
    overshootClamping: true,
    restSpeedThreshold: 2,
    restDisplacementThreshold: 2,
  },
  
  // Snappy spring config
  snappy: {
    damping: 15,
    mass: 0.8,
    overshootClamping: true,
    restSpeedThreshold: 2,
    restDisplacementThreshold: 1,
  },
};

/**
 * Usage example:
 * 
 * import { COLORS, SHADOWS, RADIUS, TYPOGRAPHY } from '@/styles/premiumTheme';
 * 
 * const styles = StyleSheet.create({
 *   card: {
 *     backgroundColor: COLORS.surfaceLight,
 *     borderColor: COLORS.border,
 *     borderWidth: 1,
 *     borderRadius: RADIUS.lg,
 *     ...SHADOWS.md,
 *     padding: 16,
 *   },
 *   title: {
 *     ...TYPOGRAPHY.h3,
 *     color: COLORS.textPrimary,
 *   },
 * });
 */
