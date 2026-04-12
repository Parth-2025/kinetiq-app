import { useEffect, useRef } from 'react';

import {
  INITIAL_PROFILE_CUSTOMIZATION,
  type ProfileCustomizationState,
  normalizeProfileCustomization,
} from '@/components/profile-cosmetics';
import { useDatabaseLiveValue, useDatabaseWrite } from '@/hooks/use-database';
import { formatUserId } from '@/utils/user';

export function useProfileCustomization(userSub: string | null | undefined) {
  const path = userSub ? `users/${formatUserId(userSub)}/profileCustomization` : null;
  const hasInitialized = useRef(false);
  const {
    value,
    isLoading,
    error,
  } = useDatabaseLiveValue<ProfileCustomizationState>(path);
  const {
    write,
    isLoading: isSaving,
    error: writeError,
  } = useDatabaseWrite<ProfileCustomizationState>(path);

  useEffect(() => {
    if (!path) {
      hasInitialized.current = false;
      return;
    }

    if (isLoading || value !== null || hasInitialized.current) {
      return;
    }

    hasInitialized.current = true;
    write(INITIAL_PROFILE_CUSTOMIZATION).catch(() => {
      hasInitialized.current = false;
    });
  }, [isLoading, path, value, write]);

  return {
    customization: normalizeProfileCustomization(value),
    isLoading,
    isSaving,
    error: error ?? writeError,
    saveCustomization: write,
  };
}
