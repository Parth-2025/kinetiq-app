import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { auth0Config } from '@/config/auth0';

WebBrowser.maybeCompleteAuthSession();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Auth0User {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
  [key: string]: unknown;
}

interface AuthContextValue {
  user: Auth0User | null;
  isLoading: boolean;
  login: () => Promise<void>;
  signUp: () => Promise<void>;
  logout: () => Promise<void>;
  /** Called by the /auth/callback page on web to complete the code exchange. */
  completeWebLogin: (code: string) => Promise<void>;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const STORAGE_USER_KEY = 'auth0_user';
export const STORAGE_VERIFIER_KEY = 'pkce_verifier';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRedirectUri(): string {
  if (Platform.OS === 'web') {
    const { protocol, hostname, port } = window.location;
    return `${protocol}//${hostname}${port ? `:${port}` : ''}/auth/callback`;
  }
  return AuthSession.makeRedirectUri({
    scheme: 'rimready',
    path: 'auth/callback',
    native: 'rimready://auth/callback',
  });
}

/** Generate a cryptographically random PKCE code verifier (web only). */
async function generateVerifier(): Promise<string> {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Derive the S256 code challenge from a verifier (web only). */
async function generateChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Auth0User | null>(null);
  // On web, stay in loading state until we've checked localStorage.
  const [isLoading, setIsLoading] = useState(Platform.OS === 'web');

  // Restore persisted session on web.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try {
      const stored = localStorage.getItem(STORAGE_USER_KEY);
      if (stored) setUser(JSON.parse(stored));
    } catch {}
    setIsLoading(false);
  }, []);

  const storeUser = useCallback((userData: Auth0User) => {
    setUser(userData);
    if (Platform.OS === 'web') {
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(userData));
    }
  }, []);

  const fetchUserInfo = useCallback(
    async (accessToken: string) => {
      const res = await fetch(`https://${auth0Config.domain}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) storeUser(await res.json());
    },
    [storeUser]
  );

  const authorize = useCallback(
    async (screenHint: 'login' | 'signup' = 'login') => {
      // ── Web: full-page redirect (no popup / new tab) ──────────────────────
      if (Platform.OS === 'web') {
        const verifier = await generateVerifier();
        const challenge = await generateChallenge(verifier);
        sessionStorage.setItem(STORAGE_VERIFIER_KEY, verifier);

        const params = new URLSearchParams({
          response_type: 'code',
          client_id: auth0Config.clientId,
          redirect_uri: getRedirectUri(),
          scope: 'openid profile email',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          screen_hint: screenHint,
        });
        window.location.href = `https://${auth0Config.domain}/authorize?${params}`;
        return;
      }

      // ── Native: system browser via expo-auth-session ──────────────────────
      setIsLoading(true);
      try {
        const redirectUri = getRedirectUri();
        const discovery = await AuthSession.fetchDiscoveryAsync(
          `https://${auth0Config.domain}`
        );
        const request = new AuthSession.AuthRequest({
          clientId: auth0Config.clientId,
          redirectUri,
          scopes: ['openid', 'profile', 'email'],
          extraParams: { screen_hint: screenHint, prompt: 'login' },
        });
        const result = await request.promptAsync(discovery);
        if (result.type === 'success' && result.params.code) {
          const tokenRes = await AuthSession.exchangeCodeAsync(
            {
              clientId: auth0Config.clientId,
              redirectUri,
              code: result.params.code,
              extraParams: { code_verifier: request.codeVerifier ?? '' },
            },
            discovery
          );
          await fetchUserInfo(tokenRes.accessToken);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [fetchUserInfo]
  );

  const login = useCallback(() => authorize('login'), [authorize]);
  const signUp = useCallback(() => authorize('signup'), [authorize]);

  const completeWebLogin = useCallback(
    async (code: string) => {
      const verifier = sessionStorage.getItem(STORAGE_VERIFIER_KEY);
      if (!verifier) return;

      const redirectUri = getRedirectUri();
      const tokens = await fetch(`https://${auth0Config.domain}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: auth0Config.clientId,
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        }),
      }).then((r) => r.json());

      sessionStorage.removeItem(STORAGE_VERIFIER_KEY);
      await fetchUserInfo(tokens.access_token);
    },
    [fetchUserInfo]
  );

  const logout = useCallback(async () => {
    // ── Web: full-page redirect logout ────────────────────────────────────
    if (Platform.OS === 'web') {
      localStorage.removeItem(STORAGE_USER_KEY);
      // Don't call setUser(null) here — the page is about to navigate away,
      // so updating React state would just cause a redundant login screen flash.
      const logoutUrl =
        `https://${auth0Config.domain}/v2/logout` +
        `?client_id=${encodeURIComponent(auth0Config.clientId)}` +
        `&returnTo=${encodeURIComponent(getRedirectUri())}`;
      window.location.href = logoutUrl;
      return;
    }

    // ── Native ────────────────────────────────────────────────────────────
    setIsLoading(true);
    try {
      const returnTo = AuthSession.makeRedirectUri({
        scheme: 'rimready',
        path: '',
        native: 'rimready://',
      });
      const logoutUrl =
        `https://${auth0Config.domain}/v2/logout` +
        `?client_id=${encodeURIComponent(auth0Config.clientId)}` +
        `&returnTo=${encodeURIComponent(returnTo)}`;
      await WebBrowser.openAuthSessionAsync(logoutUrl, returnTo);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signUp, logout, completeWebLogin }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
