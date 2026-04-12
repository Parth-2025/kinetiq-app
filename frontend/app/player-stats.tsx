import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';

const ORANGE  = '#E85D04';
const BG      = '#181818';
const ROW_BG  = '#242424';
const SEP     = '#2E2E2E';

const RECENT_SESSIONS = [
  { date: 'Apr 11, 2026', grade: 'B+', score: 87 },
  { date: 'Apr 9, 2026',  grade: 'A-', score: 92 },
  { date: 'Apr 7, 2026',  grade: 'B',  score: 84 },
  { date: 'Apr 5, 2026',  grade: 'B+', score: 89 },
];

const SHOTS_ANALYZED = 47;
const AVG_SCORE      = 87.6;
const BEST_SCORE     = 95;

export default function PlayerStatsScreen() {
  const { user } = useAuth();

  const displayName = user?.name
    ? user.name.toUpperCase()
    : 'PLAYER';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Orange header ── */}
        <View style={styles.header}>
          <View style={styles.avatarCircle}>
            <MaterialIcons name="person" size={36} color="rgba(255,255,255,0.7)" />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.playerName}>{displayName}</Text>
            <Text style={styles.memberSince}>Member since Jan 2026</Text>
          </View>
        </View>

        {/* ── Stat boxes ── */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <MaterialIcons name="adjust" size={22} color={ORANGE} />
            <Text style={styles.statValue}>{SHOTS_ANALYZED}</Text>
            <Text style={styles.statLabel}>{'SHOTS\nANALYZED'}</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxBorder]}>
            <MaterialIcons name="trending-up" size={22} color={ORANGE} />
            <Text style={styles.statValue}>{AVG_SCORE}</Text>
            <Text style={styles.statLabel}>AVG SCORE</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxBorder]}>
            <MaterialIcons name="emoji-events" size={22} color={ORANGE} />
            <Text style={styles.statValue}>{BEST_SCORE}</Text>
            <Text style={styles.statLabel}>BEST SCORE</Text>
          </View>
        </View>

        {/* ── Recent Sessions ── */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>RECENT SESSIONS</Text>
        </View>

        <View style={styles.sessionList}>
          {RECENT_SESSIONS.map((s, i) => (
            <View
              key={i}
              style={[styles.sessionRow, i < RECENT_SESSIONS.length - 1 && styles.sessionRowBorder]}
            >
              <View>
                <Text style={styles.sessionDate}>{s.date}</Text>
                <Text style={styles.sessionGrade}>{s.grade}</Text>
              </View>
              <Text style={styles.sessionScore}>{s.score}</Text>
            </View>
          ))}
        </View>

        {/* ── New Session button ── */}
        <TouchableOpacity
          style={styles.newSessionBtn}
          activeOpacity={0.85}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.newSessionText}>NEW SESSION</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  scroll:   { flex: 1 },
  content:  { paddingBottom: 40 },

  // Header
  header: {
    backgroundColor: ORANGE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 16,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    gap: 4,
  },
  playerName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  memberSince: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '500',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: ROW_BG,
    marginTop: 12,
    marginHorizontal: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  statBox: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 12,
    gap: 6,
  },
  statBoxBorder: {
    borderLeftWidth: 1,
    borderLeftColor: SEP,
  },
  statValue: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  statLabel: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    lineHeight: 15,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  sectionAccent: {
    width: 4,
    height: 18,
    backgroundColor: ORANGE,
    borderRadius: 2,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
  },

  // Sessions
  sessionList: {
    marginHorizontal: 12,
    backgroundColor: ROW_BG,
    borderRadius: 8,
    overflow: 'hidden',
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  sessionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: SEP,
  },
  sessionDate: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 3,
  },
  sessionGrade: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  sessionScore: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  // New Session
  newSessionBtn: {
    marginHorizontal: 12,
    marginTop: 24,
    backgroundColor: ORANGE,
    borderRadius: 8,
    paddingVertical: 18,
    alignItems: 'center',
  },
  newSessionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
