import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DANGER,
  HOME_BG,
  HOME_CARD,
  HOME_LABEL,
  HOME_TEXT,
  PURPLE,
} from '@/constants/colors';
import { useAuth } from '@/context/auth-context';
import { useDatabaseLiveValue, useDatabaseValue } from '@/hooks/use-database';

const SPORT_EMOJI: Record<string, string> = {
  Basketball: '🏀',
  Soccer:     '⚽',
  Tennis:     '🎾',
  Baseball:   '⚾',
  Football:   '🏈',
  Volleyball: '🏐',
  Swimming:   '🏊',
};

function sanitizeUid(sub: string) {
  return sub.replace(/[.#$[\]|]/g, '_');
}

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const userId = user?.sub ? sanitizeUid(user.sub) : 'anonymous';

  const { value: videos }   = useDatabaseValue('stats/number_of_videos');
  const { value: level }    = useDatabaseValue('stats/level');
  const { value: progress } = useDatabaseValue('stats/progress');
  const { value: activeSport } = useDatabaseLiveValue<string>(`users/${userId}/sports/active`);

  const displayVideos   = videos ?? 0;
  const displayLevel    = level ?? 1;
  const displayProgress = progress ?? 0;
  const displaySport    = activeSport ?? 'Basketball';
  const displayEmoji    = SPORT_EMOJI[displaySport] ?? '🏀';

  const username = user?.name
    ? `@${user.name.replace(/\s+/g, '').toLowerCase()}`
    : '@you';

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
          <View style={styles.avatarWrapper}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>
                  {(user?.name ?? 'U')[0].toUpperCase()}
                </Text>
              </View>
            )}
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
          <Text style={styles.progressPct}>{displayProgress}%</Text>
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
    alignItems: 'center',
    paddingVertical: 16,
    gap: 16,
  },
  username: {
    fontSize: 17,
    fontWeight: '600',
    color: HOME_TEXT,
    letterSpacing: -0.3,
  },
  avatarWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 3,
    backgroundColor: HOME_CARD,
    shadowColor: PURPLE,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarFallback: {
    backgroundColor: '#DDD6FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: '700',
    color: PURPLE,
  },

  // Cards
  card: {
    backgroundColor: HOME_CARD,
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
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
    backgroundColor: '#E5E5EA',
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
