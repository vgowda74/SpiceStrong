import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

const TIMER_WARNING_KEY = 'spicestrong_timer_warning_shown';

export async function showTimerVolumeWarningOnce() {
  const already = await AsyncStorage.getItem(TIMER_WARNING_KEY);
  if (already) return;

  Alert.alert(
    '🔔 One Quick Thing',
    'Turn your volume up so SpiceStrong can alert you when each step is ready — even if you switch apps.',
    [{ text: 'Got it!', onPress: () => AsyncStorage.setItem(TIMER_WARNING_KEY, 'true') }]
  );
}
