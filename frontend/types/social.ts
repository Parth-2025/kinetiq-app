export interface SocialFriend {
  id: string;
  username: string;
  sport: string;
  level: number;
  isOnline: boolean;
  status: string;
}

export interface SocialMessage {
  id: string;
  sender: 'self' | 'friend';
  text: string;
  sentAt: string;
}

export interface SocialThread {
  id: string;
  participantId: string;
  updatedAt: string;
  unreadCount: number;
  messages: SocialMessage[];
}

export interface SocialInboxState {
  friends: SocialFriend[];
  suggestions: SocialFriend[];
  threads: SocialThread[];
}
