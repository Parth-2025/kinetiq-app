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
import { formatRelativeTime, getIdentityColor, getInitials, getThreadPreview } from '@/utils/social';

export default function NewMessageScreen() {
  const { user } = useAuth();
  const { profile } = useUserProfile(user?.sub);
  const { inbox } = useSocialInbox(user?.sub, profile?.username);
  const [searchText, setSearchText] = useState('');

  const threadsByFriendId = useMemo(
    () => new Map(inbox.threads.map((thread) => [thread.participantId, thread])),
    [inbox.threads],
  );

  const visibleFriends = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return [...inbox.friends]
      .sort((left, right) => left.username.localeCompare(right.username))
      .filter((friend) => {
        if (!normalizedSearch) {
          return true;
        }

        const thread = threadsByFriendId.get(friend.id);
        const haystack = `${friend.username} ${friend.status} ${friend.sport} ${
          thread ? getThreadPreview(thread) : ''
        }`.toLowerCase();
        return haystack.includes(normalizedSearch);
      });
  }, [inbox.friends, searchText, threadsByFriendId]);

  if (!user) {
    return <Redirect href="/login" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back-ios-new" size={20} color={PURPLE} />
        </Pressable>
        <Text style={styles.title}>New message</Text>
        <View style={styles.iconSpacer} />
      </View>

      <View style={styles.content}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={22} color={APP_TEXT_MUTED} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search friends"
            placeholderTextColor={APP_TEXT_MUTED}
            style={styles.searchInput}
          />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.resultsContent}
        >
          <Text style={styles.sectionLabel}>Your friends</Text>
          <View style={styles.listCard}>
            {visibleFriends.map((friend) => {
              const thread = threadsByFriendId.get(friend.id);
              const accentColor = getIdentityColor(friend.username);

              return (
                <Pressable
                  key={friend.id}
                  style={styles.row}
                  onPress={() =>
                    router.push({
                      pathname: '/messages/[friendId]',
                      params: { friendId: friend.id },
                    })
                  }
                >
                  <View style={styles.rowLeft}>
                    <View style={[styles.avatarCircle, { backgroundColor: accentColor }]}>
                      <Text style={styles.avatarText}>{getInitials(friend.username)}</Text>
                      {friend.isOnline ? <View style={styles.onlineDot} /> : null}
                    </View>

                    <View style={styles.rowCopy}>
                      <Text style={styles.rowName}>@{friend.username}</Text>
                      <Text style={styles.rowMeta}>
                        {thread ? getThreadPreview(thread) : 'Start a conversation'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.rowRight}>
                    {thread ? (
                      <Text style={styles.timeText}>{formatRelativeTime(thread.updatedAt)}</Text>
                    ) : (
                      <Text style={styles.actionHint}>New</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}

            {!visibleFriends.length ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No friends match that search.</Text>
                <Text style={styles.emptyBody}>
                  Try another username, or add more friends from the add friends page.
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
    gap: 4,
  },
  rowName: {
    color: APP_TEXT,
    fontSize: 17,
    fontWeight: '700',
  },
  rowMeta: {
    color: APP_TEXT_MUTED,
    fontSize: 14,
    lineHeight: 20,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  timeText: {
    color: APP_TEXT_MUTED,
    fontSize: 12,
    fontWeight: '700',
  },
  actionHint: {
    color: PURPLE,
    fontSize: 13,
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
