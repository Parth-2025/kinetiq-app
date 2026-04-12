import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AUTH_BG,
  AUTH_CARD,
  AUTH_MUTED,
  AUTH_SUBTLE,
  AUTH_TEXT,
  PURPLE,
  WHITE_15,
} from '@/constants/colors';
import { useAuth } from '@/context/auth-context';
import { useUserProfile } from '@/hooks/use-user-profile';
import {
  claimUsername,
  getUsernameValidationMessage,
  normalizeUsernameInput,
} from '@/services/user-profile';

export default function UsernameOnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, isLoading } = useUserProfile(user?.sub);
  const [username, setUsername] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedUsername = useMemo(() => {
    const base = normalizeUsernameInput(user?.name ?? user?.email ?? 'player');
    return base || 'player';
  }, [user?.email, user?.name]);

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!isLoading && profile?.username) {
    return <Redirect href="/(tabs)" />;
  }

  async function handleSave() {
    const nextUsername = normalizeUsernameInput(username || suggestedUsername);
    const validationMessage = getUsernameValidationMessage(nextUsername);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await claimUsername({
        userSub: user.sub,
        username: nextUsername,
        displayName: user.name,
        email: user.email,
      });
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not save your username.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardShell}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Finish sign up</Text>
          <Text style={styles.title}>Pick the username people will see in messages.</Text>
          <Text style={styles.subtitle}>
            Cosmetics can match across players, so chat identity is anchored to your unique username.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Username</Text>
          <View style={styles.inputRow}>
            <Text style={styles.prefix}>@</Text>
            <TextInput
              value={username}
              onChangeText={(value) => {
                setUsername(normalizeUsernameInput(value));
                if (error) {
                  setError(null);
                }
              }}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={suggestedUsername}
              placeholderTextColor={AUTH_MUTED}
              style={styles.input}
              editable={!isSaving}
              returnKeyType="done"
              onSubmitEditing={handleSave}
              maxLength={20}
            />
          </View>
          <Text style={styles.helper}>
            3-20 characters. Use lowercase letters, numbers, periods, or underscores.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={({ pressed }) => [
              styles.saveButton,
              pressed && !isSaving && styles.saveButtonPressed,
              isSaving && styles.saveButtonDisabled,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={AUTH_TEXT} />
            ) : (
              <Text style={styles.saveButtonText}>Save Username</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AUTH_BG,
  },
  keyboardShell: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 28,
  },
  hero: {
    gap: 12,
  },
  eyebrow: {
    color: AUTH_SUBTLE,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: AUTH_TEXT,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  subtitle: {
    color: AUTH_SUBTLE,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    marginTop: 28,
    borderRadius: 24,
    backgroundColor: AUTH_CARD,
    padding: 20,
  },
  label: {
    color: AUTH_TEXT,
    fontSize: 15,
    fontWeight: '700',
  },
  inputRow: {
    marginTop: 12,
    height: 58,
    borderRadius: 18,
    backgroundColor: WHITE_15,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  prefix: {
    color: AUTH_SUBTLE,
    fontSize: 18,
    fontWeight: '700',
  },
  input: {
    flex: 1,
    color: AUTH_TEXT,
    fontSize: 18,
    fontWeight: '600',
  },
  helper: {
    marginTop: 12,
    color: AUTH_MUTED,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    marginTop: 10,
    color: '#FF9CA5',
    fontSize: 13,
    fontWeight: '600',
  },
  saveButton: {
    marginTop: 20,
    height: 54,
    borderRadius: 16,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  saveButtonDisabled: {
    opacity: 0.75,
  },
  saveButtonText: {
    color: AUTH_TEXT,
    fontSize: 16,
    fontWeight: '800',
  },
});
