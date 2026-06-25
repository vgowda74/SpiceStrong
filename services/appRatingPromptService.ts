/**
 * appRatingPromptService.ts - SpiceStrong
 *
 * A soft review funnel:
 * 1. Wait for repeated positive user actions.
 * 2. Ask "Are you enjoying SpiceStrong?"
 * 3. If yes, open the native App Store / Play Store review prompt.
 * 4. If not yet, send the user to feedback instead of asking for a public rating.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { Alert } from 'react-native';
import type { AnalyticsEventName, AnalyticsEventOptions } from './analyticsService';

const STATE_KEY = 'spicestrong_app_rating_prompt_state';
const MIN_POSITIVE_EVENTS = 3;
const MIN_DAYS_BETWEEN_PROMPTS = 21;
const MAX_PROMPTS = 3;

type RatingPromptRouter = {
  push: (href: {
    pathname: '/screens/FeedbackScreen';
    params: {
      recipeName: string;
      starRating: string;
    };
  }) => void;
};

type RatingPromptState = {
  positiveEvents: number;
  promptCount: number;
  lastPromptAt?: number;
  nativeReviewRequested?: boolean;
  feedbackOfferedAt?: number;
};

const DEFAULT_STATE: RatingPromptState = {
  positiveEvents: 0,
  promptCount: 0,
};

const POSITIVE_EVENTS = new Set<AnalyticsEventName>([
  'cooking_completed',
  'meal_saved',
  'auto_meal_plan_generated',
  'ai_recipe_generated',
  'body_scan_completed',
]);

async function loadState(): Promise<RatingPromptState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

async function saveState(state: RatingPromptState): Promise<void> {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function daysSince(timestamp?: number): number {
  if (!timestamp) return Number.POSITIVE_INFINITY;
  return (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
}

function shouldPrompt(state: RatingPromptState): boolean {
  if (state.nativeReviewRequested) return false;
  if (state.promptCount >= MAX_PROMPTS) return false;
  if (state.positiveEvents < MIN_POSITIVE_EVENTS) return false;
  if (daysSince(state.lastPromptAt) < MIN_DAYS_BETWEEN_PROMPTS) return false;
  return true;
}

async function requestNativeReview(): Promise<void> {
  try {
    const available = await StoreReview.isAvailableAsync();
    const hasAction = await StoreReview.hasAction();
    if (available && hasAction) {
      await StoreReview.requestReview();
    } else {
      Alert.alert('Thank you!', 'Your support helps us keep improving SpiceStrong.');
    }
  } catch {
    Alert.alert('Thank you!', 'Your support helps us keep improving SpiceStrong.');
  }
}

export async function handleRatingPromptEvent(eventName: AnalyticsEventName): Promise<void> {
  if (!POSITIVE_EVENTS.has(eventName)) return;

  const state = await loadState();
  state.positiveEvents += 1;
  await saveState(state);
}

export async function maybeShowRatingPrompt(
  router: RatingPromptRouter,
  options: { force?: boolean; eventName?: AnalyticsEventName; eventOptions?: AnalyticsEventOptions } = {},
): Promise<void> {
  const state = await loadState();

  if (options.eventName && POSITIVE_EVENTS.has(options.eventName)) {
    state.positiveEvents += 1;
  }

  if (!options.force && !shouldPrompt(state)) {
    await saveState(state);
    return;
  }

  state.promptCount += 1;
  state.lastPromptAt = Date.now();
  await saveState(state);

  Alert.alert(
    'Are you enjoying SpiceStrong?',
    'Your feedback helps us make the app better for high-protein cooking.',
    [
      {
        text: 'Not yet',
        style: 'cancel',
        onPress: async () => {
          const latest = await loadState();
          latest.feedbackOfferedAt = Date.now();
          await saveState(latest);
          router.push({
            pathname: '/screens/FeedbackScreen',
            params: {
              recipeName: 'SpiceStrong App',
              starRating: '4',
            },
          });
        },
      },
      {
        text: 'Yes, I like it',
        onPress: async () => {
          const latest = await loadState();
          latest.nativeReviewRequested = true;
          await saveState(latest);
          await requestNativeReview();
        },
      },
    ],
  );
}

export async function resetRatingPromptState(): Promise<void> {
  await saveState(DEFAULT_STATE);
}
