import { useEffect, useMemo, useRef } from 'react';

import { useDatabaseLiveValue, useDatabaseWrite } from '@/hooks/use-database';
import { type SocialFriend, type SocialInboxState } from '@/types/social';
import { formatUserId } from '@/utils/user';

const DEFAULT_SUGGESTIONS: SocialFriend[] = [
  {
    id: 'hoops_legend',
    username: 'hoops_legend',
    sport: 'Basketball',
    level: 16,
    isOnline: true,
    status: 'Always down for a late run.',
  },
  {
    id: 'crossover_pro',
    username: 'crossover_pro',
    sport: 'Basketball',
    level: 14,
    isOnline: false,
    status: 'Working on change-of-pace finishes.',
  },
  {
    id: 'slam_dunk_21',
    username: 'slam_dunk_21',
    sport: 'Basketball',
    level: 13,
    isOnline: true,
    status: 'Film room first, highlights second.',
  },
  {
    id: 'fade_away',
    username: 'fade_away',
    sport: 'Basketball',
    level: 17,
    isOnline: true,
    status: 'Mid-range touches all week.',
  },
  {
    id: 'ankle_breaker',
    username: 'ankle_breaker',
    sport: 'Basketball',
    level: 15,
    isOnline: true,
    status: 'Can help with handle workouts.',
  },
  {
    id: 'three_specialist',
    username: 'three_specialist',
    sport: 'Basketball',
    level: 12,
    isOnline: false,
    status: 'Catch-and-shoot reps after school.',
  },
  {
    id: 'rim_protector',
    username: 'rim_protector',
    sport: 'Basketball',
    level: 19,
    isOnline: true,
    status: 'Defense wins the next possession.',
  },
];

function createStarterInbox(currentUsername: string | undefined): SocialInboxState {
  const initialFriends = DEFAULT_SUGGESTIONS.slice(0, 5);
  const now = Date.now();

  return {
    friends: initialFriends,
    suggestions: DEFAULT_SUGGESTIONS.slice(5),
    threads: [
      {
        id: 'thread-hoops_legend',
        participantId: 'hoops_legend',
        updatedAt: new Date(now - 2 * 60 * 1000).toISOString(),
        unreadCount: 1,
        messages: [
          {
            id: 'msg-1',
            sender: 'friend',
            text: 'Yeah for sure, what time?',
            sentAt: new Date(now - 2 * 60 * 1000).toISOString(),
          },
        ],
      },
      {
        id: 'thread-crossover_pro',
        participantId: 'crossover_pro',
        updatedAt: new Date(now - 60 * 60 * 1000).toISOString(),
        unreadCount: 0,
        messages: [
          {
            id: 'msg-2',
            sender: 'friend',
            text: 'Bet, meet at the court?',
            sentAt: new Date(now - 60 * 60 * 1000).toISOString(),
          },
        ],
      },
      {
        id: 'thread-slam_dunk_21',
        participantId: 'slam_dunk_21',
        updatedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        unreadCount: 0,
        messages: [
          {
            id: 'msg-3',
            sender: 'friend',
            text: 'Appreciate it bro',
            sentAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: 'msg-4',
            sender: 'self',
            text: `Anytime${currentUsername ? `, @${currentUsername}` : ''}.`,
            sentAt: new Date(now - 3 * 60 * 60 * 1000 + 1000).toISOString(),
          },
        ],
      },
      {
        id: 'thread-fade_away',
        participantId: 'fade_away',
        updatedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        unreadCount: 0,
        messages: [
          {
            id: 'msg-5',
            sender: 'friend',
            text: 'You too man, that three was clutch.',
            sentAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
      },
      {
        id: 'thread-ankle_breaker',
        participantId: 'ankle_breaker',
        updatedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
        unreadCount: 0,
        messages: [],
      },
    ],
  };
}

function normalizeFriend(value: unknown): SocialFriend | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<SocialFriend>;

  if (typeof candidate.id !== 'string' || typeof candidate.username !== 'string') {
    return null;
  }

  return {
    id: candidate.id,
    username: candidate.username,
    sport: typeof candidate.sport === 'string' ? candidate.sport : 'Basketball',
    level: typeof candidate.level === 'number' ? candidate.level : 1,
    isOnline: typeof candidate.isOnline === 'boolean' ? candidate.isOnline : false,
    status: typeof candidate.status === 'string' ? candidate.status : 'Start a conversation',
  };
}

function normalizeThread(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<SocialInboxState['threads'][number]>;

  if (typeof candidate.id !== 'string' || typeof candidate.participantId !== 'string') {
    return null;
  }

  const messages = Array.isArray(candidate.messages)
    ? candidate.messages.filter(
        (message): message is NonNullable<typeof candidate.messages>[number] =>
          Boolean(message) &&
          typeof message === 'object' &&
          typeof message.id === 'string' &&
          (message.sender === 'self' || message.sender === 'friend') &&
          typeof message.text === 'string' &&
          typeof message.sentAt === 'string',
      )
    : [];

  return {
    id: candidate.id,
    participantId: candidate.participantId,
    updatedAt:
      typeof candidate.updatedAt === 'string'
        ? candidate.updatedAt
        : messages[messages.length - 1]?.sentAt ?? new Date().toISOString(),
    unreadCount: typeof candidate.unreadCount === 'number' ? candidate.unreadCount : 0,
    messages,
  };
}

function normalizeInbox(
  value: SocialInboxState | null,
  currentUsername: string | undefined,
) {
  if (!value) {
    return createStarterInbox(currentUsername);
  }

  return {
    friends: Array.isArray(value.friends)
      ? value.friends.map(normalizeFriend).filter((friend): friend is SocialFriend => Boolean(friend))
      : [],
    suggestions: Array.isArray(value.suggestions)
      ? value.suggestions
          .map(normalizeFriend)
          .filter((friend): friend is SocialFriend => Boolean(friend))
      : [],
    threads: Array.isArray(value.threads)
      ? value.threads
          .map(normalizeThread)
          .filter(
            (thread): thread is SocialInboxState['threads'][number] => Boolean(thread),
          )
      : [],
  } satisfies SocialInboxState;
}

export function useSocialInbox(
  userSub: string | null | undefined,
  currentUsername: string | undefined,
) {
  const path = userSub ? `users/${formatUserId(userSub)}/socialInbox` : null;
  const initialized = useRef(false);
  const { value, isLoading, error } = useDatabaseLiveValue<SocialInboxState>(path);
  const { write, isLoading: isSaving, error: writeError } =
    useDatabaseWrite<SocialInboxState>(path);

  const inbox = useMemo(
    () => normalizeInbox(value, currentUsername),
    [currentUsername, value],
  );

  useEffect(() => {
    if (!path) {
      initialized.current = false;
      return;
    }

    if (isLoading || value !== null || initialized.current) {
      return;
    }

    initialized.current = true;
    write(createStarterInbox(currentUsername)).catch(() => {
      initialized.current = false;
    });
  }, [currentUsername, isLoading, path, value, write]);

  return {
    inbox,
    isLoading,
    isSaving,
    error: error ?? writeError,
    saveInbox: write,
  };
}
