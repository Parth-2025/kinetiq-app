import { useApiQuery } from "@/hooks/use-api";
import type { AppUserProfile } from "@/services/user-profile";

type MeResponse = {
  id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  username: string | null;
  active_sport: string | null;
  active_session_id: string | null;
};

export function useUserProfile(userSub: string | null | undefined) {
  const key = userSub ? "me" : null;
  const { value, isLoading, error } = useApiQuery<MeResponse>(
    key,
    key ? "/me" : null,
  );
  const profile: AppUserProfile | null = value
    ? {
        username: value.username ?? "",
        displayName: value.name ?? value.username ?? "",
        email: value.email,
        createdAt: "",
        updatedAt: "",
      }
    : null;
  return { profile, isLoading, error, hasUsername: Boolean(value?.username) };
}
