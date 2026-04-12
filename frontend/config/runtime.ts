const runtimeConfig = {
  firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
  firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  firebaseDatabaseUrl: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ?? "",
  firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  firebaseStorageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  firebaseMessagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "",
  auth0Domain: process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? "",
  auth0ClientId: process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ?? "",
  kinetiqApiUrl: (process.env.EXPO_PUBLIC_KINETIQ_API_URL ?? "").replace(
    /\/$/,
    "",
  ),
};

export function requireRuntimeConfig(
  key: keyof typeof runtimeConfig,
  missingMessage?: string,
) {
  const value = runtimeConfig[key];

  if (!value) {
    throw new Error(
      missingMessage ??
        `Missing runtime configuration for ${String(key)}. Check your EXPO_PUBLIC_* environment variables.`,
    );
  }

  return value;
}

export { runtimeConfig };
