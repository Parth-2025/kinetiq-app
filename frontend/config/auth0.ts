import { requireRuntimeConfig } from "@/config/runtime";

export const auth0Config = {
  domain: requireRuntimeConfig(
    "auth0Domain",
    "Missing EXPO_PUBLIC_AUTH0_DOMAIN. Add your Auth0 tenant domain to the frontend environment.",
  ),
  clientId: requireRuntimeConfig(
    "auth0ClientId",
    "Missing EXPO_PUBLIC_AUTH0_CLIENT_ID. Add your Auth0 application client ID to the frontend environment.",
  ),
};
