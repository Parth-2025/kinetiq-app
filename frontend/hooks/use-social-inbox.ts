import { type SocialInboxState } from '@/types/social';

const EMPTY_INBOX: SocialInboxState = {
  friends: [],
  suggestions: [],
  threads: [],
};

/**
 * B2: friends and social messaging return in sub-project B2. Until then this
 * hook is a safe no-op that returns a stable, empty inbox and swallows writes.
 */
export function useSocialInbox(
  _userSub: string | null | undefined,
  _currentUsername: string | undefined,
) {
  return {
    inbox: EMPTY_INBOX,
    isLoading: false,
    isSaving: false,
    error: null as Error | null,
    saveInbox: async (_next?: SocialInboxState) => {},
  };
}
