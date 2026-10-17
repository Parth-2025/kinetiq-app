import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";

import {
  apiFetch,
  registerTokenAccessor,
  registerUnauthorizedHandler,
} from "@/config/api";
import { auth0Config } from "@/config/auth0";
import { clearApiCache } from "@/hooks/use-api";

WebBrowser.maybeCompleteAuthSession();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Auth0User {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
  [key: string]: unknown;
}

export type AccountRole = "athlete" | "coach";

interface AuthContextValue {
  user: Auth0User | null;
  role: AccountRole | null;
  isRoleLoading: boolean;
  selectRole: (role: AccountRole) => Promise<void>;
  isLoading: boolean;
  authError: string | null;
  login: () => Promise<void>;
  signUp: () => Promise<void>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
  /** Called by the /auth/callback page on web to complete the code exchange. */
  completeWebLogin: (code: string, state?: string | null) => Promise<void>;
  setAuthErrorMessage: (error: string, description?: string | null) => void;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const STORAGE_USER_KEY = "auth0_user";
const STORAGE_TOKEN_KEY = "auth0_token";
const STORAGE_PENDING_ROLE_KEY = "kinetiq_pending_role";
export const STORAGE_VERIFIER_KEY = "pkce_verifier";
export const STORAGE_STATE_KEY = "auth0_state";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRedirectUri(): string {
  if (Platform.OS === "web") {
    const { protocol, hostname, port } = window.location;
    return `${protocol}//${hostname}${port ? `:${port}` : ""}/auth/callback`;
  }
  return AuthSession.makeRedirectUri({
    scheme: "rimready",
    path: "auth/callback",
    //native: 'rimready://auth/callback'
  });
}

function getNativeLogoutUri(): string {
  return AuthSession.makeRedirectUri({
    scheme: "rimready",
    path: "",
    native: "rimready://",
  });
}

function getWebOrigin(): string | null {
  if (Platform.OS !== "web") {
    return null;
  }

  const { protocol, hostname, port } = window.location;
  return `${protocol}//${hostname}${port ? `:${port}` : ""}`;
}

function logAuth0Urls(context: string) {
  if (!__DEV__) {
    return;
  }

  const redirectUri = getRedirectUri();
  const webOrigin = getWebOrigin();
  const nativeLogoutUri = getNativeLogoutUri();
  const logoutReturnUri = Platform.OS === "web" ? redirectUri : nativeLogoutUri;

  console.log(`[Auth0 Debug] ${context}`);
  console.log(`[Auth0 Debug] Domain: ${auth0Config.domain}`);
  console.log(`[Auth0 Debug] Client ID: ${auth0Config.clientId}`);
  console.log(`[Auth0 Debug] Callback URL: ${redirectUri}`);
  console.log(`[Auth0 Debug] Logout URL: ${logoutReturnUri}`);

  if (webOrigin) {
    console.log(`[Auth0 Debug] Web Origin: ${webOrigin}`);
  }
}

/** Generate a cryptographically random PKCE code verifier (web only). */
async function generateVerifier(): Promise<string> {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/** Derive the S256 code challenge from a verifier (web only). */
async function generateChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/** Validate a stored access token by hitting Auth0's /userinfo endpoint. */
async function validateToken(token: string): Promise<Auth0User | null> {
  try {
    const res = await fetch(`https://${auth0Config.domain}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return res.json();
    return null;
  } catch {
    return null;
  }
}

function clearWebSession() {
  localStorage.removeItem(STORAGE_USER_KEY);
  localStorage.removeItem(STORAGE_TOKEN_KEY);
}

function clearWebPkceSession() {
  if (Platform.OS !== "web") {
    return;
  }

  sessionStorage.removeItem(STORAGE_VERIFIER_KEY);
  sessionStorage.removeItem(STORAGE_STATE_KEY);
}

function formatAuth0Error(error: string, description?: string | null): string {
  const normalizedError = error.toLowerCase();
  const normalizedDescription = (description ?? "").toLowerCase();

  if (
    normalizedError.includes("captcha") ||
    normalizedDescription.includes("captcha") ||
    normalizedDescription.includes("bot") ||
    normalizedDescription.includes("verification")
  ) {
    return "Auth0 requested a bot check before continuing. Please try again and complete the CAPTCHA challenge.";
  }

  if (description) {
    return description;
  }

  if (normalizedError === "access_denied") {
    return "Auth0 denied the login request. Please try again.";
  }

  return "We couldn't complete sign in with Auth0. Please try again.";
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Auth0User | null>(null);
  const [role, setRole] = useState<AccountRole | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  // Stay in loading state until we've validated the session.
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);
  tokenRef.current = accessToken;
  useEffect(() => {
    registerTokenAccessor(() => tokenRef.current);
    registerUnauthorizedHandler(() => {
      setUser(null);
      setRole(null);
      setAccessToken(null);
      tokenRef.current = null;
      if (Platform.OS === "web") clearWebSession();
      else void SecureStore.deleteItemAsync(STORAGE_TOKEN_KEY).catch(() => {});
      clearApiCache();
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user || !accessToken) {
      setIsRoleLoading(false);
      return;
    }
    setIsRoleLoading(true);
    (async () => {
      const account = await apiFetch<{
        role: AccountRole;
        onboarding_complete: boolean;
      }>("/studio/account");
      const pending = await AsyncStorage.getItem(STORAGE_PENDING_ROLE_KEY);
      let nextRole = account.role;
      if (
        !account.onboarding_complete &&
        (pending === "athlete" || pending === "coach")
      ) {
        const updated = await apiFetch<{ role: AccountRole }>(
          "/studio/account",
          { method: "PATCH", body: { role: pending } },
        );
        nextRole = updated.role;
      }
      if (cancelled) return;
      setRole(nextRole);
      await AsyncStorage.removeItem(STORAGE_PENDING_ROLE_KEY);
    })()
      .catch((error) => {
        if (!cancelled) {
          setRole(null);
          setAuthError(
            error instanceof Error
              ? error.message
              : "Your workspace could not load.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsRoleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.sub, accessToken]);

  const selectRole = useCallback(
    async (nextRole: AccountRole) => {
      if (user) {
        try {
          await apiFetch("/studio/account", {
            method: "PATCH",
            body: { role: nextRole },
          });
          clearApiCache();
          setRole(nextRole);
          setAuthError(null);
        } catch (error) {
          setAuthError(
            error instanceof Error
              ? error.message
              : "Your workspace could not be saved.",
          );
          throw error;
        }
      } else {
        await AsyncStorage.setItem(STORAGE_PENDING_ROLE_KEY, nextRole);
        setRole(nextRole);
      }
    },
    [user],
  );

  useEffect(() => {
    logAuth0Urls("App boot");
  }, []);

  // Restore native tokens from platform secure storage; web retains the existing flow.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token =
          Platform.OS === "web"
            ? localStorage.getItem(STORAGE_TOKEN_KEY)
            : await SecureStore.getItemAsync(STORAGE_TOKEN_KEY);
        if (!token) return;
        const validatedUser = await validateToken(token);
        if (cancelled) return;
        if (validatedUser) {
          tokenRef.current = token;
          setAccessToken(token);
          setUser(validatedUser);
          if (Platform.OS === "web")
            localStorage.setItem(
              STORAGE_USER_KEY,
              JSON.stringify(validatedUser),
            );
        } else {
          if (Platform.OS === "web") clearWebSession();
          else await SecureStore.deleteItemAsync(STORAGE_TOKEN_KEY);
        }
      } catch {
        if (!cancelled)
          setAuthError(
            "Your saved session could not be restored. Please sign in again.",
          );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const storeUser = useCallback((userData: Auth0User, accessToken?: string) => {
    setUser(userData);
    if (accessToken) {
      tokenRef.current = accessToken;
      setAccessToken(accessToken);
      if (Platform.OS !== "web")
        void SecureStore.setItemAsync(STORAGE_TOKEN_KEY, accessToken).catch(
          () =>
            setAuthError(
              "Signed in, but this device could not securely save your session.",
            ),
        );
    }
    if (Platform.OS === "web") {
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(userData));
      if (accessToken) localStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
    }
  }, []);

  const fetchUserInfo = useCallback(
    async (accessToken: string) => {
      const res = await fetch(`https://${auth0Config.domain}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) storeUser(await res.json(), accessToken);
    },
    [storeUser],
  );

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const setAuthErrorMessage = useCallback(
    (error: string, description?: string | null) => {
      setAuthError(formatAuth0Error(error, description));
    },
    [],
  );

  const authorize = useCallback(
    async (screenHint: "login" | "signup" = "login") => {
      logAuth0Urls(`Authorize: ${screenHint}`);
      setAuthError(null);

      // ── Web: full-page redirect (no popup / new tab) ──────────────────────
      if (Platform.OS === "web") {
        const verifier = await generateVerifier();
        const challenge = await generateChallenge(verifier);
        const state = await generateVerifier();
        sessionStorage.setItem(STORAGE_VERIFIER_KEY, verifier);
        sessionStorage.setItem(STORAGE_STATE_KEY, state);

        const params = new URLSearchParams({
          response_type: "code",
          client_id: auth0Config.clientId,
          redirect_uri: getRedirectUri(),
          scope: "openid profile email",
          code_challenge: challenge,
          code_challenge_method: "S256",
          screen_hint: screenHint,
          prompt: "login",
          state,
        });
        window.location.href = `https://${auth0Config.domain}/authorize?${params}`;
        return;
      }

      // ── Native: system browser via expo-auth-session ──────────────────────
      setIsLoading(true);
      try {
        const redirectUri = getRedirectUri();
        const discovery = await AuthSession.fetchDiscoveryAsync(
          `https://${auth0Config.domain}`,
        );
        const request = new AuthSession.AuthRequest({
          clientId: auth0Config.clientId,
          redirectUri,
          scopes: ["openid", "profile", "email"],
          extraParams: { screen_hint: screenHint, prompt: "login" },
        });
        const result = await request.promptAsync(discovery);
        if (result.type === "success" && result.params.code) {
          const tokenRes = await AuthSession.exchangeCodeAsync(
            {
              clientId: auth0Config.clientId,
              redirectUri,
              code: result.params.code,
              extraParams: { code_verifier: request.codeVerifier ?? "" },
            },
            discovery,
          );
          await fetchUserInfo(tokenRes.accessToken);
        } else if (result.type === "error") {
          setAuthErrorMessage(
            result.params.error ?? "access_denied",
            result.params.error_description,
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [fetchUserInfo, setAuthErrorMessage],
  );

  const login = useCallback(() => authorize("login"), [authorize]);
  const signUp = useCallback(() => authorize("signup"), [authorize]);

  const completeWebLogin = useCallback(
    async (code: string, state?: string | null) => {
      const verifier = sessionStorage.getItem(STORAGE_VERIFIER_KEY);
      const expectedState = sessionStorage.getItem(STORAGE_STATE_KEY);
      if (!verifier) {
        throw new Error("missing_verifier");
      }
      if (expectedState && state !== expectedState) {
        clearWebPkceSession();
        throw new Error("invalid_state");
      }

      const redirectUri = getRedirectUri();
      const tokenResponse = await fetch(
        `https://${auth0Config.domain}/oauth/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "authorization_code",
            client_id: auth0Config.clientId,
            code,
            redirect_uri: redirectUri,
            code_verifier: verifier,
          }),
        },
      );
      const tokens = await tokenResponse.json();

      if (!tokenResponse.ok || !tokens.access_token) {
        clearWebPkceSession();
        throw new Error(tokens.error_description ?? "token_exchange_failed");
      }

      clearWebPkceSession();
      await fetchUserInfo(tokens.access_token);
    },
    [fetchUserInfo],
  );

  const logout = useCallback(async () => {
    // ── Web: clear token + full-page redirect logout ──────────────────────
    if (Platform.OS === "web") {
      clearWebSession();
      tokenRef.current = null;
      setUser(null);
      setAccessToken(null);
      clearApiCache();
      const logoutUrl =
        `https://${auth0Config.domain}/v2/logout` +
        `?client_id=${encodeURIComponent(auth0Config.clientId)}` +
        `&returnTo=${encodeURIComponent(getRedirectUri())}`;
      window.location.href = logoutUrl;
      setRole(null);
      return;
    }

    // ── Native ────────────────────────────────────────────────────────────
    setIsLoading(true);
    try {
      await SecureStore.deleteItemAsync(STORAGE_TOKEN_KEY);
      tokenRef.current = null;
      setUser(null);
      setRole(null);
      setAccessToken(null);
      clearApiCache();
      const returnTo = getNativeLogoutUri();
      const logoutUrl =
        `https://${auth0Config.domain}/v2/logout` +
        `?client_id=${encodeURIComponent(auth0Config.clientId)}` +
        `&returnTo=${encodeURIComponent(returnTo)}`;
      await WebBrowser.openAuthSessionAsync(logoutUrl, returnTo);
      setUser(null);
      setRole(null);
      setAccessToken(null);
      clearApiCache();
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isRoleLoading,
        selectRole,
        isLoading,
        authError,
        login,
        signUp,
        logout,
        clearAuthError,
        completeWebLogin,
        setAuthErrorMessage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
