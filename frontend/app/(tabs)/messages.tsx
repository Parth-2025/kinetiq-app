import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AvatarArtwork,
  BannerArtwork,
  formatPointsValue,
  getAvatarById,
  getBannerById,
} from '@/components/profile-cosmetics';
import {
  ACCENT_SURFACE,
  APP_SHADOW,
  APP_SURFACE_SUBTLE,
  HOME_BG,
  HOME_CARD,
  HOME_LABEL,
  HOME_TEXT,
  PURPLE,
  WHITE,
} from '@/constants/colors';
import { useAuth } from '@/context/auth-context';
import { useProfileCustomization } from '@/hooks/use-profile-customization';

export default function MessagesScreen() {
  const { user } = useAuth();
  const { customization } = useProfileCustomization(user?.sub);
  const avatar = getAvatarById(customization.equippedAvatarId);
  const banner = getBannerById(customization.equippedBannerId);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Messages</Text>
        <Text style={styles.title}>Your equipped look is ready to travel with your chats.</Text>

        <View style={styles.heroCard}>
          <BannerArtwork banner={banner} height={120} />
          <View style={styles.heroAvatar}>
            <AvatarArtwork avatar={avatar} size={90} />
          </View>
          <View style={styles.heroMeta}>
            <View>
              <Text style={styles.profileName}>{user?.name ?? 'Rim Ready Player'}</Text>
              <Text style={styles.profileHandle}>
                {avatar.name} avatar • {banner.name} banner
              </Text>
            </View>
            <View style={styles.pointsPill}>
              <MaterialIcons name="stars" size={16} color={PURPLE} />
              <Text style={styles.pointsPillText}>{formatPointsValue(customization.points)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Preview</Text>
          <Text style={styles.sectionSubtitle}>
            This is how your selected cosmetics can frame message threads once chat is wired up.
          </Text>

          <View style={styles.threadCard}>
            <View style={styles.threadHeader}>
              <View style={styles.threadAvatar}>
                <AvatarArtwork avatar={avatar} size={54} />
              </View>
              <View style={styles.threadText}>
                <Text style={styles.threadName}>Coach Replay</Text>
                <Text style={styles.threadSnippet}>Banner styling and avatar ownership are now stored.</Text>
              </View>
              <Text style={styles.threadTime}>2m</Text>
            </View>
            <View style={styles.messageBubblePrimary}>
              <Text style={styles.messageTextPrimary}>
                Clean release on that last jumper. Let&apos;s save this look for your next breakdown.
              </Text>
            </View>
            <View style={styles.messageBubbleSecondary}>
              <Text style={styles.messageTextSecondary}>
                Perfect. Keep the {avatar.name} avatar and {banner.name} banner equipped.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: HOME_BG,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 18,
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: '800',
    color: PURPLE,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: HOME_TEXT,
    letterSpacing: -0.8,
    lineHeight: 35,
  },
  heroCard: {
    backgroundColor: HOME_CARD,
    borderRadius: 28,
    padding: 12,
    shadowColor: APP_SHADOW,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroAvatar: {
    position: 'absolute',
    left: 28,
    top: 70,
    padding: 4,
    borderRadius: 48,
    backgroundColor: WHITE,
  },
  heroMeta: {
    marginTop: 42,
    paddingHorizontal: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  profileName: {
    fontSize: 21,
    fontWeight: '800',
    color: HOME_TEXT,
    letterSpacing: -0.4,
  },
  profileHandle: {
    marginTop: 4,
    fontSize: 14,
    color: HOME_LABEL,
    fontWeight: '600',
  },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: ACCENT_SURFACE,
  },
  pointsPillText: {
    fontSize: 14,
    fontWeight: '800',
    color: PURPLE,
  },
  sectionCard: {
    backgroundColor: HOME_CARD,
    borderRadius: 28,
    padding: 18,
    shadowColor: APP_SHADOW,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: HOME_TEXT,
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: HOME_LABEL,
  },
  threadCard: {
    marginTop: 18,
    borderRadius: 22,
    backgroundColor: APP_SURFACE_SUBTLE,
    padding: 14,
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  threadAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
  },
  threadText: {
    flex: 1,
  },
  threadName: {
    fontSize: 16,
    fontWeight: '800',
    color: HOME_TEXT,
  },
  threadSnippet: {
    marginTop: 2,
    fontSize: 13,
    color: HOME_LABEL,
  },
  threadTime: {
    fontSize: 12,
    fontWeight: '700',
    color: HOME_LABEL,
  },
  messageBubblePrimary: {
    marginTop: 16,
    alignSelf: 'flex-start',
    maxWidth: '88%',
    borderRadius: 20,
    backgroundColor: PURPLE,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  messageTextPrimary: {
    color: WHITE,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  messageBubbleSecondary: {
    marginTop: 10,
    alignSelf: 'flex-end',
    maxWidth: '85%',
    borderRadius: 20,
    backgroundColor: ACCENT_SURFACE,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  messageTextSecondary: {
    color: HOME_TEXT,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
});
