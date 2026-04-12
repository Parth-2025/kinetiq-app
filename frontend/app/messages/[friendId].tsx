import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
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
import { appendMessageToInbox, getIdentityColor, getInitials } from '@/utils/social';

function formatBubbleTime(value: string) {
  const date = new Date(value);
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function MessageThreadScreen() {
  const params = useLocalSearchParams<{ friendId?: string | string[] }>();
  const friendId = Array.isArray(params.friendId) ? params.friendId[0] : params.friendId;
  const { user } = useAuth();
  const { profile } = useUserProfile(user?.sub);
  const { inbox, saveInbox, isSaving } = useSocialInbox(user?.sub, profile?.username);
  const [draftMessage, setDraftMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const friend = useMemo(
    () => inbox.friends.find((entry) => entry.id === friendId),
    [friendId, inbox.friends],
  );

  const thread = useMemo(
    () => inbox.threads.find((entry) => entry.participantId === friendId) ?? null,
    [friendId, inbox.threads],
  );

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!friendId || !friend) {
    return <Redirect href="/(tabs)/messages" />;
  }

  async function handleSend() {
    const text = draftMessage.trim();

    if (!text) {
      return;
    }

    setError(null);

    try {
      const { nextInbox } = appendMessageToInbox({
        inbox,
        friendId: friend.id,
        text,
      });
      await saveInbox(nextInbox);
      setDraftMessage('');
    } catch {
      setError('We could not send that message right now.');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.keyboardShell}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back-ios-new" size={20} color={PURPLE} />
          </Pressable>

          <View style={styles.headerIdentity}>
            <View
              style={[
                styles.avatarCircle,
                { backgroundColor: getIdentityColor(friend.username) },
              ]}
            >
              <Text style={styles.avatarText}>{getInitials(friend.username)}</Text>
              {friend.isOnline ? <View style={styles.onlineDot} /> : null}
            </View>
            <View>
              <Text style={styles.headerName}>@{friend.username}</Text>
              <Text style={styles.headerStatus}>
                {friend.isOnline ? 'Active now' : `${friend.sport} · Level ${friend.level}`}
              </Text>
            </View>
          </View>

          <Pressable style={styles.iconButton}>
            <MaterialIcons name="more-vert" size={22} color={APP_TEXT_MUTED} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.messagesScroll}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {(thread?.messages ?? []).length ? (
            (thread?.messages ?? []).map((message) => {
              const isSelf = message.sender === 'self';

              return (
                <View key={message.id} style={styles.messageGroup}>
                  <View style={styles.timestampPill}>
                    <Text style={styles.timestampText}>{formatBubbleTime(message.sentAt)}</Text>
                  </View>

                  <View
                    style={[
                      styles.messageRow,
                      isSelf && styles.messageRowSelf,
                    ]}
                  >
                    <View
                      style={[
                        styles.messageBubble,
                        isSelf ? styles.messageBubbleSelf : styles.messageBubbleFriend,
                      ]}
                    >
                      <Text
                        style={[
                          styles.messageText,
                          isSelf && styles.messageTextSelf,
                        ]}
                      >
                        {message.text}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.receiptText, isSelf && styles.receiptTextSelf]}>
                    {isSelf ? 'Delivered' : ''}
                  </Text>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Start your conversation with @{friend.username}</Text>
              <Text style={styles.emptyBody}>
                Send the first message and it will appear here instead of in a popup.
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.composerBar}>
          <TextInput
            value={draftMessage}
            onChangeText={setDraftMessage}
            placeholder="Message..."
            placeholderTextColor={APP_TEXT_MUTED}
            style={styles.composerInput}
            multiline
          />
          <Pressable
            style={[
              styles.sendButton,
              (!draftMessage.trim() || isSaving) && styles.sendButtonDisabled,
            ]}
            disabled={!draftMessage.trim() || isSaving}
            onPress={handleSend}
          >
            <MaterialIcons name="near-me" size={20} color={WHITE} />
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: APP_BG,
  },
  keyboardShell: {
    flex: 1,
  },
  header: {
    height: 72,
    backgroundColor: APP_SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: APP_BORDER,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: '800',
  },
  onlineDot: {
    position: 'absolute',
    right: -1,
    top: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: SUCCESS,
    borderWidth: 2,
    borderColor: APP_SURFACE,
  },
  headerName: {
    color: APP_TEXT,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerStatus: {
    color: APP_TEXT_MUTED,
    fontSize: 14,
    fontWeight: '600',
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 6,
  },
  messageGroup: {
    gap: 8,
  },
  timestampPill: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F1F1F6',
  },
  timestampText: {
    color: '#8B8B94',
    fontSize: 13,
    fontWeight: '700',
  },
  messageRow: {
    alignItems: 'flex-start',
  },
  messageRowSelf: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  messageBubbleFriend: {
    backgroundColor: APP_SURFACE,
    borderWidth: 1,
    borderColor: '#ECECF2',
    borderTopLeftRadius: 8,
  },
  messageBubbleSelf: {
    backgroundColor: PURPLE,
    borderTopRightRadius: 8,
  },
  messageText: {
    color: APP_TEXT,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  messageTextSelf: {
    color: WHITE,
  },
  receiptText: {
    minHeight: 18,
    color: 'transparent',
    fontSize: 13,
    fontWeight: '600',
  },
  receiptTextSelf: {
    alignSelf: 'flex-end',
    color: APP_TEXT_MUTED,
  },
  composerBar: {
    minHeight: 74,
    borderTopWidth: 1,
    borderTopColor: APP_BORDER,
    backgroundColor: APP_SURFACE,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  composerInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 110,
    borderRadius: 24,
    backgroundColor: '#F4F4F8',
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: APP_TEXT,
    fontSize: 16,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  emptyState: {
    marginTop: 80,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: APP_TEXT,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyBody: {
    color: APP_TEXT_MUTED,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorText: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    color: '#D14343',
    fontSize: 13,
    fontWeight: '600',
  },
});
