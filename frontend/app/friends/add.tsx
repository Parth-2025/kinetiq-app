import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, Stack, router } from 'expo-router';
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
  APP_TEXT,
  APP_TEXT_MUTED,
  PURPLE,
  SUCCESS,
  WHITE,
} from '@/constants/colors';
import { useAuth } from '@/context/auth-context';
import { useSocialInbox } from '@/hooks/use-social-inbox';
import { useUserProfile } from '@/hooks/use-user-profile';
import { type SocialFriend, type SocialInboxState } from '@/types/social';
import { getIdentityColor, getInitials, upsertFriend } from '@/utils/social';

export default function AddFriendsScreen() {
  const { user } = useAuth();
  const { profile } = useUserProfile(user?.sub);
  const { inbox, saveInbox, isSaving } = useSocialInbox(user?.sub, profile?.username);
  const [searchText, setSearchText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const visibleSuggestions = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return inbox.suggestions.filter((friend) => {
      if (!normalizedSearch) {
        return true;
      }

      const haystack = `${friend.username} ${friend.status} ${friend.sport}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [inbox.suggestions, searchText]);

  if (!user) {
    return <Redirect href="/login" />;
  }

  async function handleAddFriend(friend: SocialFriend) {
    setFeedback(null);
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

    try {
      await saveInbox(nextInbox);
      setFeedback(`@${friend.username} added to your friends.`);
    } catch {
      setFeedback('We could not add that friend right now.');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back-ios-new" size={20} color={PURPLE} />
        </Pressable>
        <Text style={styles.title}>Add friends</Text>
        <View style={styles.iconSpacer} />
      </View>

      <View style={styles.content}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={22} color={APP_TEXT_MUTED} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search users"
            placeholderTextColor={APP_TEXT_MUTED}
            style={styles.searchInput}
          />
        </View>

        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.resultsContent}
        >
          <Text style={styles.sectionLabel}>Suggested for you</Text>
          <View style={styles.listCard}>
            {visibleSuggestions.map((friend) => {
              const accentColor = getIdentityColor(friend.username);

              return (
                <View key={friend.id} style={styles.row}>
                  <View style={styles.rowLeft}>
                    <View style={[styles.avatarCircle, { backgroundColor: accentColor }]}>
                      <Text style={styles.avatarText}>{getInitials(friend.username)}</Text>
                      {friend.isOnline ? <View style={styles.onlineDot} /> : null}
                    </View>

                    <View style={styles.rowCopy}>
                      <Text style={styles.rowName}>@{friend.username}</Text>
                      <Text style={styles.rowMeta}>
                        {friend.sport} · Level {friend.level}
                      </Text>
                      <Text style={styles.rowStatus} numberOfLines={1}>
                        {friend.status}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    style={styles.addButton}
                    onPress={() => handleAddFriend(friend)}
                    disabled={isSaving}
                  >
                    <Text style={styles.addButtonText}>Add</Text>
                  </Pressable>
                </View>
              );
            })}

            {!visibleSuggestions.length ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No suggested users match that search.</Text>
                <Text style={styles.emptyBody}>
                  Try a different username or come back when more players are available.
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: APP_BG,
  },
  header: {
    height: 68,
    paddingHorizontal: 16,
    backgroundColor: APP_SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: APP_BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSpacer: {
    width: 36,
    height: 36,
  },
  title: {
    color: APP_TEXT,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  searchBar: {
    height: 56,
    borderRadius: 28,
    backgroundColor: APP_SURFACE,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: APP_SHADOW,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    color: APP_TEXT,
    fontSize: 17,
  },
  feedback: {
    marginTop: 12,
    color: PURPLE,
    fontSize: 13,
    fontWeight: '700',
  },
  resultsContent: {
    paddingTop: 18,
    paddingBottom: 28,
    gap: 10,
  },
  sectionLabel: {
    color: APP_TEXT_MUTED,
    fontSize: 14,
    fontWeight: '700',
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
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarText: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '800',
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: SUCCESS,
    borderWidth: 2,
    borderColor: WHITE,
  },
  rowCopy: {
    flex: 1,
    gap: 3,
  },
  rowName: {
    color: APP_TEXT,
    fontSize: 17,
    fontWeight: '700',
  },
  rowMeta: {
    color: APP_TEXT_MUTED,
    fontSize: 14,
    fontWeight: '600',
  },
  rowStatus: {
    color: APP_TEXT_MUTED,
    fontSize: 13,
    lineHeight: 18,
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
  emptyState: {
    paddingHorizontal: 18,
    paddingVertical: 24,
    gap: 6,
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
});
