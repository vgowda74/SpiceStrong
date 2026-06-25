/**
 * inAppEventNotificationService.ts - SpiceStrong
 *
 * Turns meaningful in-app events into gentle local notifications.
 * This is intentionally rate-limited so users are nudged after wins, not spammed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { AnalyticsEventName, AnalyticsEventOptions } from './analyticsService';

const STATE_KEY = 'spicestrong_in_app_event_notifications';
const CHANNEL_ID = 'spicestrong-progress';
const MIN_HOURS_BETWEEN_NOTIFICATIONS = 20;
const MAX_SCHEDULED_IDS = 8;

const isExpoGo = Constants.appOwnership === 'expo';

type NotificationState = {
  permissionAskedAt?: number;
  meaningfulEventCount: number;
  lastScheduledAt?: number;
  scheduledIds: string[];
};

type NotificationPlan = {
  title: string;
  body: string;
  delayHours: number;
};

const DEFAULT_STATE: NotificationState = {
  meaningfulEventCount: 0,
  scheduledIds: [],
};

const EVENT_PLANS: Partial<Record<AnalyticsEventName, NotificationPlan[]>> = {
  cooking_completed: [
    {
      title: 'Nice work in the kitchen',
      body: 'Keep the streak going with another high-protein meal today.',
      delayHours: 22,
    },
    {
      title: 'Ready for your next protein win?',
      body: 'Open SpiceStrong and pick the next recipe that fits your goals.',
      delayHours: 26,
    },
  ],
  meal_saved: [
    {
      title: 'Meal logged',
      body: 'Check your macro difference and close the day strong.',
      delayHours: 8,
    },
    {
      title: 'Your tracker is waiting',
      body: 'Log the next meal while today is still fresh.',
      delayHours: 18,
    },
  ],
  auto_meal_plan_generated: [
    {
      title: 'Your meal plan is ready',
      body: "Review today's meals and make the plan easy to follow.",
      delayHours: 20,
    },
  ],
  ai_recipe_generated: [
    {
      title: 'New recipe idea saved',
      body: "Turn it into a meal plan or cook it when you're ready.",
      delayHours: 24,
    },
  ],
  grocery_opened: [
    {
      title: 'Shopping list check',
      body: 'Grab what you need and stock your pantry for easier meals.',
      delayHours: 24,
    },
  ],
  pantry_opened: [
    {
      title: 'Use what you already have',
      body: 'Open your pantry and build a protein-focused meal from your ingredients.',
      delayHours: 30,
    },
  ],
};

async function loadState(): Promise<NotificationState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

async function saveState(state: NotificationState): Promise<void> {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function pickPlan(eventName: AnalyticsEventName): NotificationPlan | null {
  const plans = EVENT_PLANS[eventName];
  if (!plans?.length) return null;
  return plans[Math.floor(Math.random() * plans.length)];
}

function randomizeDelay(plan: NotificationPlan): number {
  const jitter = Math.floor(Math.random() * 5) - 2;
  return Math.max(2, plan.delayHours + jitter);
}

async function ensureNotificationPermission(state: NotificationState): Promise<boolean> {
  if (isExpoGo) return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  if (current.status === 'denied') return false;

  // Ask only after the user has completed at least two meaningful actions.
  if (state.meaningfulEventCount < 2) return false;

  const now = Date.now();
  const daysSinceAsk = state.permissionAskedAt
    ? (now - state.permissionAskedAt) / (1000 * 60 * 60 * 24)
    : Number.POSITIVE_INFINITY;

  if (daysSinceAsk < 30) return false;

  const requested = await Notifications.requestPermissionsAsync();
  state.permissionAskedAt = now;
  await saveState(state);
  return requested.status === 'granted';
}

async function pruneOldScheduledIds(state: NotificationState): Promise<void> {
  if (state.scheduledIds.length <= MAX_SCHEDULED_IDS) return;
  const overflow = state.scheduledIds.slice(0, state.scheduledIds.length - MAX_SCHEDULED_IDS);
  await Promise.all(
    overflow.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)),
  );
  state.scheduledIds = state.scheduledIds.slice(-MAX_SCHEDULED_IDS);
}

export async function initializeInAppEventNotifications(): Promise<void> {
  if (isExpoGo) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'SpiceStrong reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E8A87C',
    });
  }
}

export async function handleInAppEventNotification(
  eventName: AnalyticsEventName,
  options: AnalyticsEventOptions = {},
): Promise<void> {
  const plan = pickPlan(eventName);
  if (!plan || isExpoGo) return;

  const state = await loadState();
  state.meaningfulEventCount += 1;

  const now = Date.now();
  const hoursSinceLast = state.lastScheduledAt
    ? (now - state.lastScheduledAt) / (1000 * 60 * 60)
    : Number.POSITIVE_INFINITY;

  if (hoursSinceLast < MIN_HOURS_BETWEEN_NOTIFICATIONS) {
    await saveState(state);
    return;
  }

  const hasPermission = await ensureNotificationPermission(state);
  if (!hasPermission) {
    await saveState(state);
    return;
  }

  const delayHours = randomizeDelay(plan);
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: plan.title,
      body: plan.body,
      data: {
        source: 'in_app_event',
        eventName,
        screen: options.screen ?? null,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: delayHours * 60 * 60,
      repeats: false,
      channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
    },
  });

  state.lastScheduledAt = now;
  state.scheduledIds.push(notificationId);
  await pruneOldScheduledIds(state);
  await saveState(state);
}

export async function clearInAppEventNotifications(): Promise<void> {
  const state = await loadState();
  await Promise.all(
    state.scheduledIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)),
  );
  await saveState({ ...DEFAULT_STATE, permissionAskedAt: state.permissionAskedAt });
}
