import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';

export default function LoginScreen() {
  const { user, isLoading, login, signUp } = useAuth();
  const router = useRouter();

  // Redirect once authenticated
  useEffect(() => {
    if (user) router.replace('/(tabs)');
  }, [user, router]);

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Brand ── */}
      <View style={styles.brandSection}>
        <View style={styles.logoContainer}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.appName}>Rim Ready</Text>
        <Text style={styles.tagline}>
          Your go-to destination for wheel & rim services
        </Text>
      </View>

      {/* ── Actions ── */}
      <View style={styles.actionsSection}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#0a7ea4" style={styles.loader} />
        ) : (
          <>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
              onPress={login}
              accessibilityRole="button"
              accessibilityLabel="Log in to your account"
            >
              <Text style={styles.btnPrimaryText}>Log In</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnSecondary, pressed && styles.btnPressed]}
              onPress={signUp}
              accessibilityRole="button"
              accessibilityLabel="Create a new account"
            >
              <Text style={styles.btnSecondaryText}>Create Account</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* ── Footer ── */}
      <Text style={styles.footer}>
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    justifyContent: 'space-between',
    paddingBottom: 32,
  },

  // Brand
  brandSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: '#E6F4FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#0a7ea4',
        shadowOpacity: 0.15,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 4 },
    }),
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 16,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#11181C',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: '#687076',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 260,
  },

  // Actions
  actionsSection: {
    gap: 12,
    marginBottom: 24,
  },
  loader: {
    marginVertical: 24,
  },
  btn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  btnPrimary: {
    backgroundColor: '#0a7ea4',
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  btnSecondary: {
    backgroundColor: '#F2F8FB',
    borderWidth: 1.5,
    borderColor: '#0a7ea4',
  },
  btnSecondaryText: {
    color: '#0a7ea4',
    fontSize: 16,
    fontWeight: '600',
  },

  // Footer
  footer: {
    fontSize: 12,
    color: '#9BA1A6',
    textAlign: 'center',
    lineHeight: 18,
  },
});
