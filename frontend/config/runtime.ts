const runtimeConfig = {
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
