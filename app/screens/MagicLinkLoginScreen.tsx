import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getAuthState,
  sendMagicLink,
  signOut,
  subscribeToAuthState,
  type AuthState,
} from '../../services/authService';

const BG = '#0F0F0F';
const SURFACE = '#1A1A1A';
const BORDER = 'rgba(248,241,232,0.12)';
const TEXT = '#F8F1E8';
const MUTED = 'rgba(248,241,232,0.62)';
const ORANGE = '#E85D26';
const PLAYFAIR = Platform.select({
  ios: 'PlayfairDisplay_700Bold',
  android: 'serif',
  default: 'serif',
});

export default function MagicLinkLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [authState, setAuthState] = useState<AuthState>({ session: null, user: null });
  const [loadingState, setLoadingState] = useState(true);
  const [sending, setSending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    getAuthState()
      .then(setAuthState)
      .catch(() => {})
      .finally(() => setLoadingState(false));

    const { data } = subscribeToAuthState(setAuthState);
    return () => data.subscription.unsubscribe();
  }, []);

  const handleSendLink = async () => {
    setSending(true);
    try {
      await sendMagicLink(email);
      Alert.alert('Check your email', 'Open the sign-in link on this device to finish signing in.');
    } catch (error) {
      Alert.alert('Sign In Failed', error instanceof Error ? error.message : 'Could not send sign-in link.');
    } finally {
      setSending(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      Alert.alert('Signed Out', 'You have been signed out.');
    } catch (error) {
      Alert.alert('Sign Out Failed', error instanceof Error ? error.message : 'Could not sign out.');
    } finally {
      setSigningOut(false);
    }
  };

  const signedInEmail = authState.user?.email ?? null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={TEXT} />
          </Pressable>
          <Text style={styles.headerTitle}>Account</Text>
          <View style={styles.iconButton} />
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.brand}>SpiceStrong</Text>
          <Text style={styles.title}>Sign in with email</Text>
        </View>

        <View style={styles.panel}>
          {loadingState ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={ORANGE} />
              <Text style={styles.loadingText}>Checking account...</Text>
            </View>
          ) : signedInEmail ? (
            <>
              <View style={styles.signedInBadge}>
                <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
                <View style={styles.signedInTextBlock}>
                  <Text style={styles.statusLabel}>Signed in</Text>
                  <Text style={styles.emailText}>{signedInEmail}</Text>
                </View>
              </View>

              <Pressable
                style={[styles.secondaryButton, signingOut && styles.disabledButton]}
                onPress={handleSignOut}
                disabled={signingOut}
              >
                {signingOut ? (
                  <ActivityIndicator color={TEXT} />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={20} color={TEXT} />
                    <Text style={styles.secondaryButtonText}>Sign Out</Text>
                  </>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.panelTitle}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="rgba(248,241,232,0.32)"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                style={styles.input}
              />

              <Pressable
                style={[styles.primaryButton, sending && styles.disabledButton]}
                onPress={handleSendLink}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="mail-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>Send Magic Link</Text>
                  </>
                )}
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '800',
  },
  titleBlock: {
    marginBottom: 22,
  },
  brand: {
    color: ORANGE,
    fontFamily: PLAYFAIR,
    fontSize: 34,
    fontWeight: '900',
    marginBottom: 8,
  },
  title: {
    color: TEXT,
    fontSize: 24,
    fontWeight: '900',
  },
  panel: {
    backgroundColor: SURFACE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 14,
  },
  loadingRow: {
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: MUTED,
    fontSize: 14,
    fontWeight: '700',
  },
  panelTitle: {
    color: TEXT,
    fontSize: 14,
    fontWeight: '800',
  },
  input: {
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#101010',
    color: TEXT,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '700',
  },
  primaryButton: {
    height: 52,
    borderRadius: 8,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.72,
  },
  signedInBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.28)',
    backgroundColor: 'rgba(34,197,94,0.10)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  signedInTextBlock: {
    flex: 1,
  },
  statusLabel: {
    color: '#22C55E',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 3,
  },
  emailText: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    height: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButtonText: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '900',
  },
});
