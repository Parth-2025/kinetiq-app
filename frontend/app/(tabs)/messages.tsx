import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  APP_BG,
  APP_BORDER,
  APP_SHADOW,
  APP_SURFACE,
  APP_SURFACE_SUBTLE,
  APP_TEXT,
  APP_TEXT_MUTED,
  PURPLE,
  PURPLE_TINT,
  SUCCESS,
  WHITE,
} from '@/constants/colors';
import { useAuth } from '@/context/auth-context';
import { useSocialInbox } from '@/hooks/use-social-inbox';
import { useUserProfile } from '@/hooks/use-user-profile';
import { type SocialFriend, type SocialInboxState } from '@/types/social';
import {
  formatRelativeTime,
  getIdentityColor,
  getInitials,
  getThreadPreview,
  upsertFriend,
} from '@/utils/social';

export default function MessagesScreen() {
  const { user } = useAuth();
  const { profile } = useUserProfile(user?.sub);
  const { inbox, isLoading, isSaving, saveInbox } = useSocialInbox(
    user?.sub,
    profile?.username,
  );
  const [searchText, setSearchText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const friendsById = useMemo(
    () => new Map(inbox.friends.map((friend) => [friend.id, friend])),
    [inbox.friends],
  );

  const visibleThreads = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return [...inbox.threads]
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      )
      .filter((thread) => {
        const friend = friendsById.get(thread.participantId);
        if (!friend) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        const haystack = `${friend.username} ${friend.status} ${getThreadPreview(thread)}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      });
  }, [friendsById, inbox.threads, searchText]);

  const visibleSuggestions = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return inbox.suggestions.filter((suggestion) => {
      if (!normalizedSearch) {
        return true;
      }

      const haystack = `${suggestion.username} ${suggestion.status} ${suggestion.sport}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [inbox.suggestions, searchText]);

  async function commitInbox(nextInbox: SocialInboxState, message: string) {
    setFeedback(null);

    try {
      await saveInbox(nextInbox);
      setFeedback(message);
    } catch {
      setFeedback('We could not save your messages right now.');
    }
  }

  async function handleAddFriend(friend: SocialFriend) {
    const withFriend = upsertFriend(inbox, friend);
    const hasThread = withFriend.threads.some((thread) => thread.participantId === friend.id);

    const nextInbox: SocialInboxState = hasThread
      ? withFriend
      : {
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

    await commitInbox(nextInbox, `@${friend.username} added to your friends.`);
  }

  function openThread(friendId?: string) {
    const targetFriendId = friendId ?? inbox.friends[0]?.id;

    if (!targetFriendId) {
      setFeedback('Add a friend first to start a conversation.');
      return;
    }

    router.push({
      pathname: '/messages/[friendId]',
      params: { friendId: targetFriendId },
    });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Messages</Text>
            <Text style={styles.subtitle}>
              Username-first inbox design so identity stays unique even when cosmetics overlap.
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.actionIcon} onPress={() => openThread()}>
              <MaterialIcons name="edit" size={20} color={APP_TEXT} />
            </Pressable>
            <Pressable
              style={styles.actionIcon}
              onPress={() => setFeedback('Add friends from the Suggested for you section below.')}
            >
              <MaterialIcons name="person-add-alt-1" size={20} color={APP_TEXT} />
            </Pressable>
          </View>
        </View>

        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={22} color={APP_TEXT_MUTED} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search messages or users"
            placeholderTextColor={APP_TEXT_MUTED}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.quickRow}>
          <Pressable style={styles.primaryCta} onPress={() => openThread()}>
            <MaterialIcons name="chat-bubble-outline" size={18} color={WHITE} />
            <Text style={styles.primaryCtaText}>New message</Text>
          </Pressable>
          <View style={styles.identityCard}>
            <View
              style={[
                styles.identitySwatch,
                { backgroundColor: getIdentityColor(profile?.username ?? 'you') },
              ]}
            >
              <Text style={styles.identitySwatchText}>
                {getInitials(profile?.username ?? 'you')}
              </Text>
            </View>
            <View style={styles.identityMeta}>
              <Text style={styles.identityLabel}>Your chat identity</Text>
              <Text style={styles.identityValue}>@{profile?.username ?? 'you'}</Text>
            </View>
          </View>
        </View>

        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Inbox</Text>
          <View style={styles.listCard}>
            {visibleThreads.map((thread) => {
              const friend = friendsById.get(thread.participantId);
              if (!friend) {
                return null;
              }

              const accentColor = getIdentityColor(friend.username);
              const preview = getThreadPreview(thread);

              return (
                <Pressable
                  key={thread.id}
                  style={styles.row}
                  onPress={() => openThread(friend.id)}
                >
                  <View style={styles.rowLeft}>
                    <View
                      style={[
                        styles.avatarCircle,
                        { backgroundColor: accentColor },
                      ]}
                    >
                      <Text style={styles.avatarCircleText}>
                        {getInitials(friend.username)}
                      </Text>
                      {friend.isOnline ? <View style={styles.onlineDot} /> : null}
                    </View>
                    <View style={styles.rowCopy}>
                      <View style={styles.rowNameLine}>
                        <Text style={styles.rowName}>@{friend.username}</Text>
                        <Text style={styles.rowMeta}>
                          {friend.sport} · Level {friend.level}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.rowPreview,
                          thread.unreadCount > 0 && styles.rowPreviewUnread,
                        ]}
                        numberOfLines={1}
                      >
                        {preview}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.rowRight}>
                    <Text
                      style={[
                        styles.timeText,
                        thread.unreadCount > 0 && styles.timeTextUnread,
                      ]}
                    >
                      {formatRelativeTime(thread.updatedAt)}
                    </Text>
                    {thread.unreadCount > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{thread.unreadCount}</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}

            {!visibleThreads.length ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No conversations match that search.</Text>
                <Text style={styles.emptyBody}>
                  Try another username or start a new thread from the button above.
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Suggested for you</Text>
          <View style={styles.listCard}>
            {visibleSuggestions.map((friend) => {
              const accentColor = getIdentityColor(friend.username);

              return (
                <View key={friend.id} style={styles.suggestionRow}>
                  <View style={styles.rowLeft}>
                    <View
                      style={[
                        styles.avatarCircleSmall,
                        { backgroundColor: accentColor },
                      ]}
                    >
                      <Text style={styles.avatarCircleTextSmall}>
                        {getInitials(friend.username)}
                      </Text>
                      {friend.isOnline ? <View style={styles.onlineDotSmall} /> : null}
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowName}>@{friend.username}</Text>
                      <Text style={styles.rowMeta}>
                        {friend.sport} · Level {friend.level}
                      </Text>
                      <Text style={styles.suggestionStatus} numberOfLines={1}>
                        {friend.status}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    style={styles.addButton}
                    disabled={isSaving}
                    onPress={async () => {
                      await handleAddFriend(friend);
                      router.push({
                        pathname: '/messages/[friendId]',
                        params: { friendId: friend.id },
                      });
                    }}
                  >
                    <Text style={styles.addButtonText}>Add</Text>
                  </Pressable>
                </View>
              );
            })}

            {!visibleSuggestions.length ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No suggestions left to add.</Text>
                <Text style={styles.emptyBody}>
                  Your inbox is ready for more threads whenever new players show up.
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {isLoading ? <Text style={styles.loadingText}>Loading conversations...</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: APP_BG,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 36,
    gap: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  title: {
    color: APP_TEXT,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: 6,
    maxWidth: 270,
    color: APP_TEXT_MUTED,
    fontSize: 14,
    lineHeight: 20,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: APP_SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: APP_SHADOW,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  searchBar: {
    height: 58,
    borderRadius: 29,
    backgroundColor: APP_SURFACE,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: APP_SHADOW,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    color: APP_TEXT,
    fontSize: 17,
  },
  quickRow: {
    gap: 12,
  },
  primaryCta: {
    height: 56,
    borderRadius: 20,
    backgroundColor: PURPLE,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryCtaText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '800',
  },
  identityCard: {
    borderRadius: 22,
    backgroundColor: APP_SURFACE,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  identitySwatch: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identitySwatchText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '800',
  },
  identityMeta: {
    gap: 2,
  },
  identityLabel: {
    color: APP_TEXT_MUTED,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  identityValue: {
    color: APP_TEXT,
    fontSize: 18,
    fontWeight: '800',
  },
  feedback: {
    color: PURPLE,
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: APP_TEXT,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  listCard: {
    borderRadius: 28,
    backgroundColor: APP_SURFACE,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: APP_BORDER,
  },
  row: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: APP_BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  suggestionRow: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: APP_BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  rowCopy: {
    flex: 1,
    gap: 4,
  },
  rowNameLine: {
    gap: 2,
  },
  rowName: {
    color: APP_TEXT,
    fontSize: 18,
    fontWeight: '700',
  },
  rowMeta: {
    color: APP_TEXT_MUTED,
    fontSize: 13,
    fontWeight: '600',
  },
  rowPreview: {
    color: APP_TEXT_MUTED,
    fontSize: 15,
    lineHeight: 20,
  },
  rowPreviewUnread: {
    color: APP_TEXT,
    fontWeight: '700',
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 10,
  },
  timeText: {
    color: APP_TEXT_MUTED,
    fontSize: 12,
    fontWeight: '700',
  },
  timeTextUnread: {
    color: PURPLE,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PURPLE_TINT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: PURPLE,
    fontSize: 12,
    fontWeight: '800',
  },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarCircleSmall: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarCircleText: {
    color: WHITE,
    fontSize: 20,
    fontWeight: '800',
  },
  avatarCircleTextSmall: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '800',
  },
  onlineDot: {
    position: 'absolute',
    right: 1,
    bottom: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: SUCCESS,
    borderWidth: 3,
    borderColor: WHITE,
  },
  onlineDotSmall: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: SUCCESS,
    borderWidth: 2,
    borderColor: WHITE,
  },
  addButton: {
    minWidth: 76,
    height: 42,
    borderRadius: 21,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  addButtonText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: '800',
  },
  suggestionStatus: {
    color: APP_TEXT_MUTED,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyState: {
    paddingHorizontal: 18,
    paddingVertical: 22,
    gap: 6,
    backgroundColor: APP_SURFACE_SUBTLE,
  },
  emptyTitle: {
    color: APP_TEXT,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyBody: {
    color: APP_TEXT_MUTED,
    fontSize: 14,
    lineHeight: 20,
  },
  loadingText: {
    color: APP_TEXT_MUTED,
    fontSize: 13,
    textAlign: 'center',
  },
});
