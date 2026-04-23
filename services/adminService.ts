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
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'spicestrong_device_id';

// Add your device ID(s) here after checking the logs
const ADMIN_DEVICE_IDS: string[] = [
  'ios_1773504689845_bf8ebqh4',
];

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
  cachedIsAdmin = ADMIN_DEVICE_IDS.includes(id);
  if (cachedIsAdmin) console.log('[SpiceStrong] Admin device detected');
  return cachedIsAdmin;
}
