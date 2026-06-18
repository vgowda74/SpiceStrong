import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  ImageBackground,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { trackEvent } from '../../services/analyticsService';
import { HomeButton } from '../../components/HomeButton';

const FEEDBACK_KEY = 'spicestrong_feedback';
const ORANGE = '#8F3A1F';
const PHONE_NUMBER = '4252468867';

type SMSAnswers = {
  q1: string;
  q2: string;
  confusingStep?: string;
  q3: string;
  q4: string;
  q5: string;
  comments?: string;
};

function compileSMSBody(answers: SMSAnswers, recipeName: string, rating: number): string {
  return `
🌶️ SPICESTRONG FEEDBACK
─────────────────────
📍 Recipe: ${recipeName}
⭐ Rating: ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} (${rating}/5)
📅 Date: ${new Date().toLocaleDateString()}

─────────────────────
Q1: Did the recipe turn out well?
A: ${answers.q1}

Q2: Was any step confusing?
A: ${answers.q2}
${answers.q2 === 'Yes' ? `Confusing step: ${answers.confusingStep ?? ''}` : ''}

Q3: Was the timing accurate?
A: ${answers.q3}

Q4: Would you cook this again?
A: ${answers.q4}

Q5: Did SpiceStrong make cooking easier?
A: ${answers.q5}

─────────────────────
💬 Comments:
${answers.comments || 'No additional comments'}
─────────────────────
Sent from SpiceStrong App 🌶️
  `.trim();
}

export default function FeedbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ recipeId?: string; recipeName?: string; starRating?: string }>();
  const recipeId = typeof params.recipeId === 'string' ? params.recipeId : '';
  const recipeName = typeof params.recipeName === 'string' ? params.recipeName : 'Recipe';
  const starRating = typeof params.starRating === 'string' ? params.starRating : '';

  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState('');
  const [q2Which, setQ2Which] = useState('');
  const [q3, setQ3] = useState('');
  const [q4, setQ4] = useState('');
  const [q5, setQ5] = useState('');
  const [comments, setComments] = useState('');

  const handleSubmit = async () => {
    if (!q1) {
      Alert.alert(
        'Answer required',
        'Please answer at least the first question before sending feedback.'
      );
      return;
    }
    const rating = starRating ? parseInt(starRating, 10) || 5 : 5;
    const smsAnswers: SMSAnswers = {
      q1,
      q2: q2 === 'yes' ? 'Yes' : q2 === 'no' ? 'No' : q2,
      confusingStep: q2Which || undefined,
      q3,
      q4,
      q5,
      comments: comments || undefined,
    };
    const feedbackRecord = {
      id: Date.now().toString(),
      recipeName,
      rating,
      date: new Date().toISOString(),
      answers: {
        q1: { question: 'Did the recipe turn out well?', answer: q1 },
        q2: {
          question: 'Was any step confusing?',
          answer: q2,
          detail: q2Which || null,
        },
        q3: { question: 'Was the timing accurate?', answer: q3 },
        q4: { question: 'Would you cook this again?', answer: q4 },
        q5: { question: 'Did SpiceStrong make cooking easier?', answer: q5 },
        comments: comments || null,
      },
    };
    try {
      const existing = await AsyncStorage.getItem(FEEDBACK_KEY);
      const list: unknown[] = existing ? JSON.parse(existing) : [];
      list.push(feedbackRecord);
      await AsyncStorage.setItem(FEEDBACK_KEY, JSON.stringify(list));
    } catch (_) {}
    trackEvent('feedback_submitted', {
      screen: 'FeedbackScreen',
      metadata: { rating, recipeName },
    });
    const smsBody = compileSMSBody(smsAnswers, recipeName, rating);
    const encodedBody = encodeURIComponent(smsBody);
    const smsUrl =
      Platform.OS === 'ios'
        ? `sms:${PHONE_NUMBER}&body=${encodedBody}`
        : `sms:${PHONE_NUMBER}?body=${encodedBody}`;
    Linking.openURL(smsUrl).catch(() => {});
    Alert.alert(
      'SMS Ready to Send! 📱',
      "Your feedback has been prepared. Just tap Send in your Messages app.",
      [
        {
          text: 'Got it!',
          onPress: () => router.replace('/screens/ProteinSelectionScreen'),
        },
      ]
    );
  };

  const cardStyle = [styles.card, { backgroundColor: 'rgba(255,255,255,0.1)' }];
  const pill = (label: string, value: string, selected: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={value}
      style={[styles.pill, selected && styles.pillSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ImageBackground source={require('../../assets/images/splash-bg.jpg')} style={styles.bg} resizeMode="cover">
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#100604' }]} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Recipe Feedback</Text>
        <HomeButton />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.recipePill}>
          <Text style={styles.recipePillText} numberOfLines={1}>{recipeName}</Text>
        </View>

        <View style={cardStyle}>
          <Text style={styles.question}>Did the recipe turn out well?</Text>
          <View style={styles.pillsRow}>
            {pill('✅ Perfect', 'perfect', q1 === 'perfect', () => setQ1('perfect'))}
            {pill('⚠️ Needs adjustment', 'adjustment', q1 === 'adjustment', () => setQ1('adjustment'))}
            {pill('❌ Didn\'t work', 'no', q1 === 'no', () => setQ1('no'))}
          </View>
        </View>

        <View style={cardStyle}>
          <Text style={styles.question}>Was any step confusing?</Text>
          <View style={styles.pillsRow}>
            {pill('Yes', 'yes', q2 === 'yes', () => setQ2('yes'))}
            {pill('No', 'no', q2 === 'no', () => setQ2('no'))}
          </View>
          {q2 === 'yes' && (
            <TextInput
              style={styles.input}
              placeholder="Which step was confusing?"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={q2Which}
              onChangeText={setQ2Which}
              multiline
            />
          )}
        </View>

        <View style={cardStyle}>
          <Text style={styles.question}>Was the timing accurate?</Text>
          <View style={styles.pillsRow}>
            {pill('✅ Yes', 'yes', q3 === 'yes', () => setQ3('yes'))}
            {pill('⏩ Too short', 'short', q3 === 'short', () => setQ3('short'))}
            {pill('⏰ Too long', 'long', q3 === 'long', () => setQ3('long'))}
          </View>
        </View>

        <View style={cardStyle}>
          <Text style={styles.question}>Would you cook this again?</Text>
          <View style={styles.pillsRow}>
            {pill('👍 Yes', 'yes', q4 === 'yes', () => setQ4('yes'))}
            {pill('🤔 Maybe', 'maybe', q4 === 'maybe', () => setQ4('maybe'))}
            {pill('👎 No', 'no', q4 === 'no', () => setQ4('no'))}
          </View>
        </View>

        <View style={cardStyle}>
          <Text style={styles.question}>Did SpiceStrong make cooking easier?</Text>
          <View style={styles.pillsGrid}>
            {pill('🚀 Much easier', 'much', q5 === 'much', () => setQ5('much'))}
            {pill('👍 Slightly easier', 'slightly', q5 === 'slightly', () => setQ5('slightly'))}
            {pill('😐 No difference', 'none', q5 === 'none', () => setQ5('none'))}
            {pill('😕 More difficult', 'harder', q5 === 'harder', () => setQ5('harder'))}
          </View>
        </View>

        <Text style={styles.optionalLabel}>Anything else to share?</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="Optional comments..."
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={comments}
          onChangeText={setComments}
          multiline
        />

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.8}>
          <Text style={styles.submitBtnText}>📱 Send Feedback via SMS</Text>
        </TouchableOpacity>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#100604' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: 'rgba(13,11,9,0.54)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  backText: { color: '#FFFFFF', fontSize: 28, lineHeight: 30, fontWeight: '900' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 48 },
  recipePill: {
    alignSelf: 'flex-start',
    backgroundColor: ORANGE,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  recipePillText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  question: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', marginBottom: 12 },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  pillSelected: { backgroundColor: ORANGE },
  pillText: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  pillTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    fontSize: 15,
  },
  inputMultiline: { minHeight: 100, textAlignVertical: 'top' },
  optionalLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 16, marginBottom: 8 },
  submitBtn: {
    backgroundColor: ORANGE,
    borderRadius: 16,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
