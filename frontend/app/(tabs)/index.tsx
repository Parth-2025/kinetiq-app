import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AvatarArtwork,
  BannerArtwork,
  getAvatarById,
  getBannerById,
} from '@/components/profile-cosmetics';
import {
  ACCENT_SURFACE,
  APP_SHADOW,
  APP_TRACK,
  DANGER,
  HOME_BG,
  HOME_CARD,
  HOME_LABEL,
  HOME_TEXT,
  PURPLE,
} from '@/constants/colors';
import { useAuth } from '@/context/auth-context';
import { useApiQuery } from '@/hooks/use-api';
import { useProfileCustomization } from '@/hooks/use-profile-customization';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useUserStats } from '@/hooks/use-user-stats';

const SPORT_EMOJI: Record<string, string> = {
  Basketball: '🏀',
  Soccer:     '⚽',
  Tennis:     '🎾',
  Baseball:   '⚾',
  Football:   '🏈',
  Volleyball: '🏐',
  Swimming:   '🏊',
};

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const { customization } = useProfileCustomization(user?.sub);
  const { profile } = useUserProfile(user?.sub);
  const { stats } = useUserStats(user?.sub);
  const { value: sportsState } = useApiQuery<{ active: string | null }>('sports', '/me/sports');
  const activeSport = sportsState?.active ?? null;

  const displayVideos = stats?.videosUploaded ?? 0;
  const displayLevel = stats?.level ?? 0;
  const displayProgress = stats?.progressPct ?? 0;
  const displayExp = stats?.exp ?? 0;
  const displayCurrentLevelExp = stats?.currentLevelExp ?? 0;
  const displayNextLevelExp = stats?.nextLevelExp ?? 50;
  const displaySport    = activeSport
    ? activeSport.charAt(0).toUpperCase() + activeSport.slice(1)
    : 'Basketball';
  const displayEmoji    = SPORT_EMOJI[displaySport] ?? '🏀';
  const equippedAvatar  = getAvatarById(customization.equippedAvatarId);
  const equippedBanner  = getBannerById(customization.equippedBannerId);

  const username = profile?.username ? `@${profile.username}` : '@you';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile ── */}
        <View style={styles.profileSection}>
          <Text style={styles.username}>{username}</Text>
          <View style={styles.profileCard}>
            <BannerArtwork banner={equippedBanner} height={132} />
            <View style={styles.avatarWrapper}>
              <AvatarArtwork avatar={equippedAvatar} size={92} />
            </View>
            <View style={styles.profileMeta}>
              <View>
                <Text style={styles.profileName}>
                  {profile?.displayName ?? user?.name ?? 'Rim Ready Player'}
                </Text>
                <Text style={styles.profileCustomization}>
                  {equippedAvatar.name} avatar • {equippedBanner.name} banner
                </Text>
              </View>
              <TouchableOpacity
                style={styles.shopPill}
                activeOpacity={0.7}
                onPress={() => router.push('/shop')}
              >
                <Text style={styles.shopPillText}>Open Shop</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Stats Row ── */}
        <View style={styles.statsRow}>
          <View style={[styles.card, styles.statCard]}>
            <Text style={styles.cardLabel}>Videos</Text>
            <Text style={styles.statValue}>{displayVideos}</Text>
          </View>
          <View style={[styles.card, styles.statCard]}>
            <Text style={styles.cardLabel}>Level</Text>
            <Text style={styles.statValue}>{displayLevel}</Text>
          </View>
        </View>

        {/* ── Progress Card ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Progress to Level {displayLevel + 1}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${displayProgress}%` }]} />
          </View>
          <Text style={styles.progressPct}>
            {displayExp - displayCurrentLevelExp}/{displayNextLevelExp - displayCurrentLevelExp} XP • {displayProgress}%
          </Text>
        </View>

        {/* ── Active Sport Card ── */}
        <TouchableOpacity style={[styles.card, styles.sportCard]} activeOpacity={0.7} onPress={() => router.push('/sports')}>
          <View style={styles.sportLeft}>
            <Text style={styles.cardLabel}>Active Sport</Text>
            <View style={styles.sportRow}>
              <Text style={styles.sportEmoji}>{displayEmoji}</Text>
              <Text style={styles.sportName}>{displaySport}</Text>
            </View>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        {/* ── Log Out ── */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={logout}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: HOME_BG,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 14,
  },

  // Profile
  profileSection: {
    paddingVertical: 16,
    gap: 16,
  },
  username: {
    fontSize: 17,
    fontWeight: '600',
    color: HOME_TEXT,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  profileCard: {
    borderRadius: 28,
    backgroundColor: HOME_CARD,
    padding: 12,
    shadowColor: PURPLE,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  avatarWrapper: {
    position: 'absolute',
    left: 24,
    top: 78,
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HOME_CARD,
    padding: 4,
  },
  profileMeta: {
    marginTop: 46,
    paddingHorizontal: 8,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  profileName: {
    fontSize: 21,
    fontWeight: '800',
    color: HOME_TEXT,
    letterSpacing: -0.4,
  },
  profileCustomization: {
    marginTop: 4,
    fontSize: 14,
    color: HOME_LABEL,
    fontWeight: '600',
  },
  shopPill: {
    backgroundColor: ACCENT_SURFACE,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  shopPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: PURPLE,
  },

  // Cards
  card: {
    backgroundColor: HOME_CARD,
    borderRadius: 18,
    padding: 18,
    shadowColor: APP_SHADOW,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardLabel: {
    fontSize: 13,
    color: HOME_LABEL,
    fontWeight: '500',
    marginBottom: 6,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  statCard: {
    flex: 1,
  },
  statValue: {
    fontSize: 34,
    fontWeight: '700',
    color: HOME_TEXT,
    letterSpacing: -0.5,
  },

  // Progress
  progressTrack: {
    height: 10,
    backgroundColor: APP_TRACK,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: PURPLE,
    borderRadius: 6,
  },
  progressPct: {
    fontSize: 13,
    color: HOME_LABEL,
    fontWeight: '500',
    textAlign: 'right',
  },

  // Active Sport
  sportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sportLeft: {
    gap: 4,
  },
  sportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sportEmoji: {
    fontSize: 22,
  },
  sportName: {
    fontSize: 20,
    fontWeight: '700',
    color: HOME_TEXT,
    letterSpacing: -0.3,
  },
  chevron: {
    fontSize: 26,
    color: HOME_LABEL,
    fontWeight: '300',
  },

  // Logout
  logoutBtn: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: DANGER,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  logoutText: {
    color: DANGER,
    fontSize: 15,
    fontWeight: '600',
  },
});
