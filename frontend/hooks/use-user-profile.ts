import { useDatabaseLiveValue } from '@/hooks/use-database';
import { AppUserProfile, getUserProfilePath } from '@/services/user-profile';

export function useUserProfile(userSub: string | null | undefined) {
  const path = userSub ? getUserProfilePath(userSub) : null;
  const { value, isLoading, error } = useDatabaseLiveValue<AppUserProfile>(path);

  return {
    profile: value,
    isLoading,
    error,
    hasUsername: Boolean(value?.username),
  };
}
