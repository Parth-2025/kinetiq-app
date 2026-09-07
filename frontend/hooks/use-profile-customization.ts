import {
  normalizeProfileCustomization,
  type ProfileCustomizationState,
} from '@/components/profile-cosmetics';

/**
 * B2: profile cosmetics persistence returns in sub-project B2. Until then this
 * hook is a safe no-op that hands back the default customization and swallows
 * any save attempt.
 */
export function useProfileCustomization(_userSub: string | null | undefined) {
  return {
    customization: normalizeProfileCustomization(null),
    isLoading: false,
    isSaving: false,
    error: null as Error | null,
    saveCustomization: async (_next?: ProfileCustomizationState) => {},
  };
}
