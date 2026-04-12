import { type SocialFriend, type SocialInboxState } from '@/types/social';

export const IDENTITY_COLORS = [
  '#6C47FF',
  '#0EA5E9',
  '#F97316',
  '#10B981',
  '#E11D48',
  '#D97706',
  '#2563EB',
  '#059669',
];

export function getIdentityColor(value: string) {
  const total = value.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return IDENTITY_COLORS[total % IDENTITY_COLORS.length];
}

export function getInitials(username: string) {
  const pieces = username.split(/[._]/).filter(Boolean);

  if (pieces.length >= 2) {
    return `${pieces[0][0]}${pieces[1][0]}`.toUpperCase();
  }

  return username.slice(0, 2).toUpperCase();
}

export function getThreadPreview(thread: SocialInboxState['threads'][number]) {
  const latestMessage = thread.messages[thread.messages.length - 1];
  return latestMessage?.text ?? 'Start a conversation';
}

export function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diffMs / (60 * 1000)));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function upsertFriend(inbox: SocialInboxState, friend: SocialFriend) {
  if (inbox.friends.some((entry) => entry.id === friend.id)) {
    return inbox;
  }

  return {
    ...inbox,
    friends: [friend, ...inbox.friends],
    suggestions: inbox.suggestions.filter((entry) => entry.id !== friend.id),
  };
}

export function addFriendToInbox(inbox: SocialInboxState, friend: SocialFriend) {
  const withFriend = upsertFriend(inbox, friend);
  const hasThread = withFriend.threads.some((thread) => thread.participantId === friend.id);

  if (hasThread) {
    return withFriend;
  }

  return {
    ...withFriend,
    threads: [
      {
        id: `thread-${friend.id}`,
        participantId: friend.id,
        updatedAt: new Date().toISOString(),
        unreadCount: 0,
        messages: [],
      },
      ...withFriend.threads,
    ],
  };
}

export function appendMessageToInbox({
  inbox,
  friendId,
  text,
}: {
  inbox: SocialInboxState;
  friendId: string;
  text: string;
}) {
  const sentAt = new Date().toISOString();
  const message = {
    id: `msg-${Date.now()}`,
    sender: 'self' as const,
    text,
    sentAt,
  };

  const nextThreads = [...inbox.threads];
  const existingIndex = nextThreads.findIndex(
    (thread) => thread.participantId === friendId,
  );

  if (existingIndex >= 0) {
    nextThreads[existingIndex] = {
      ...nextThreads[existingIndex],
      updatedAt: sentAt,
      unreadCount: 0,
      messages: [...nextThreads[existingIndex].messages, message],
    };
  } else {
    nextThreads.unshift({
      id: `thread-${friendId}`,
      participantId: friendId,
      updatedAt: sentAt,
      unreadCount: 0,
      messages: [message],
    });
  }

  return {
    nextInbox: {
      ...inbox,
      threads: nextThreads,
    },
    message,
  };
}
