import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Speech from 'expo-speech';

const ELEVENLABS_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_KEY;
const VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel — natural female voice
const API_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

// Simple hash for cache keys
function hashText(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

// In-memory cache: text hash → local file URI
const audioCache = new Map<string, string>();

let currentSound: Audio.Sound | null = null;

async function playFromElevenLabs(text: string): Promise<void> {
  const key = hashText(text);
  let fileUri = audioCache.get(key);

  if (!fileUri || !(await FileSystem.getInfoAsync(fileUri)).exists) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_KEY!,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    fileUri = `${FileSystem.cacheDirectory}tts_${key}.mp3`;
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    audioCache.set(key, fileUri);
  }

  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });

  const { sound } = await Audio.Sound.createAsync(
    { uri: fileUri! },
    { shouldPlay: true, volume: 1.0 }
  );
  currentSound = sound;

  sound.setOnPlaybackStatusUpdate((status) => {
    if (status.isLoaded && status.didJustFinish) {
      sound.unloadAsync();
      if (currentSound === sound) currentSound = null;
    }
  });
}

function fallbackSpeak(text: string): void {
  Speech.speak(text, { language: 'en', rate: 0.9 });
}

export async function speakTTS(text: string): Promise<void> {
  await stopTTS();

  if (!ELEVENLABS_KEY) {
    fallbackSpeak(text);
    return;
  }

  try {
    await playFromElevenLabs(text);
  } catch (error) {
    console.log('ElevenLabs TTS failed, falling back to device TTS:', error);
    fallbackSpeak(text);
  }
}

export async function stopTTS(): Promise<void> {
  Speech.stop();
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
    } catch {}
    currentSound = null;
  }
}
