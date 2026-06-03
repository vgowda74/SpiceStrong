import { getDeviceId, isAdminDeviceId } from './adminService';
import { supabase } from './supabase';

type AnalyticsEventName = 'app_open';

export async function trackAnalyticsEvent(eventName: AnalyticsEventName): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    if (isAdminDeviceId(deviceId)) return;

    const { error } = await supabase.from('analytics_events').insert({
      device_id: deviceId,
      event_name: eventName,
    });

    if (error && __DEV__) {
      console.warn(`[SpiceStrong] Analytics event failed: ${eventName}`, error.message);
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[SpiceStrong] Analytics unavailable', error);
    }
  }
}

export function trackAppOpen(): Promise<void> {
  return trackAnalyticsEvent('app_open');
}
