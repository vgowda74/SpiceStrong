/**
 * adminService.ts — SpiceStrong
 *
 * Identifies the admin device (Venky's phone).
 * Admin gets: delete any recipe, publish option, dev tools in production.
 * Everyone else: standard user experience.
 *
 * To set up: run the app once, check logs for "[SpiceStrong] Device ID: xxx",
 * then paste that ID into ADMIN_DEVICE_IDS below.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const DEVICE_ID_KEY = 'spicestrong_device_id';

const ENV_ADMIN_DEVICE_IDS = process.env.EXPO_PUBLIC_ADMIN_DEVICE_IDS ?? '';
const ENV_ENABLE_ADMIN_TOOLS = process.env.EXPO_PUBLIC_ENABLE_ADMIN_TOOLS ?? '';

// Device IDs in this list are the only admin identity mechanism.
// There is intentionally no login/account-based admin path.
export const ADMIN_DEVICE_IDS: string[] = Array.from(new Set([
  'ios_1773504689845_bf8ebqh4',
  ...ENV_ADMIN_DEVICE_IDS
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
]));

let cachedDeviceId: string | null = null;
let cachedIsAdmin: boolean | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `${Platform.OS}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    cachedDeviceId = id;
    console.log(`[SpiceStrong] Device ID: ${id}`);
    return id;
  } catch {
    return `fallback_${Date.now()}`;
  }
}

export async function isAdmin(): Promise<boolean> {
  if (cachedIsAdmin !== null) return cachedIsAdmin;
  const id = await getDeviceId();
  const isAdminDevice = ADMIN_DEVICE_IDS.includes(id);
  cachedIsAdmin = isAdminDevice;
  if (cachedIsAdmin) {
    console.log('[SpiceStrong] Admin tools enabled for this device');
  } else {
    console.log(`[SpiceStrong] Non-admin device. Add this ID to EXPO_PUBLIC_ADMIN_DEVICE_IDS if this is Venky's phone: ${id}`);
  }
  return cachedIsAdmin;
}

export function isAdminDeviceId(deviceId: string | null | undefined): boolean {
  return !!deviceId && ADMIN_DEVICE_IDS.includes(deviceId);
}

export function isAdminToolsBuild(): boolean {
  return __DEV__
    || Constants.appOwnership === 'expo'
    || ENV_ENABLE_ADMIN_TOOLS.toLowerCase() === 'true';
}
