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

const ORANGE = '#E85D04';
const BG     = '#181818';
const ROW_BG = '#242424';
const SEP    = '#2E2E2E';
const GREEN  = '#3DD9C0';
const YELLOW = '#E8B840';

const PHASES = [
  { id: 1, name: 'READY',          score: 85 },
  { id: 2, name: 'LOAD',           score: 92 },
  { id: 3, name: 'SETPOINT',       score: 78 },
  { id: 4, name: 'RELEASE',        score: 88 },
  { id: 5, name: 'FOLLOW THROUGH', score: 95 },
];

const OVERALL = Math.round(PHASES.reduce((s, p) => s + p.score, 0) / PHASES.length);

function grade(score: number): string {
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  return 'C-';
}

function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const color = score >= 90 ? GREEN : YELLOW;
  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}>
      <Text style={[styles.ringText, { fontSize: size * 0.3 }]}>{score}</Text>
    </View>
  );
}

export default function ShotBreakdownScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.backText}>Upload</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SHOT BREAKDOWN</Text>
          <Text style={styles.headerSub}>Film Session</Text>
        </View>

        {/* Video placeholder */}
        <View style={styles.videoBox}>
          <View style={styles.playIcon}>
            <View style={styles.playTriangle} />
          </View>
          <Text style={styles.uploadLabel}>UPLOAD VIDEO</Text>
        </View>

        {/* Phase rows */}
        <View style={styles.phaseList}>
          {PHASES.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.phaseRow}
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/phase-detail', params: { id: p.id } })}
            >
              <View style={styles.phaseLeft}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{p.id}</Text>
                </View>
                <Text style={styles.phaseName}>{p.name}</Text>
              </View>
              <View style={styles.phaseRight}>
                <ScoreRing score={p.score} />
                <Text style={styles.chevron}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Overall score */}
        <View style={styles.overallCard}>
          <Text style={styles.overallLabel}>OVERALL SCORE</Text>
          <View style={styles.overallRow}>
            <Text style={styles.overallScore}>{OVERALL}</Text>
            <Text style={styles.overallGrade}>{grade(OVERALL)}</Text>
          </View>
        </View>

        {/* Finish */}
        <TouchableOpacity style={styles.finishBtn} activeOpacity={0.85} onPress={() => router.push('/player-stats')}>
          <Text style={styles.finishText}>FINISH</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  scroll:   { flex: 1 },
  content:  { paddingBottom: 40 },

  header: {
    backgroundColor: ORANGE,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  backText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '500', marginTop: 2 },

  videoBox: {
    marginHorizontal: 16,
    marginTop: 18,
    height: 190,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#444',
    borderStyle: 'dashed',
    backgroundColor: '#0E0E0E',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  playIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderLeftWidth: 18,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'rgba(255,255,255,0.5)',
    marginLeft: 4,
  },
  uploadLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5 },

  phaseList: { marginTop: 20, gap: 2 },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ROW_BG,
    paddingVertical: 14,
    paddingRight: 14,
    paddingLeft: 0,
    borderLeftWidth: 3,
    borderLeftColor: ORANGE,
    borderBottomWidth: 1,
    borderBottomColor: SEP,
  },
  phaseLeft:  { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 14 },
  phaseRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  phaseName: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
  chevron:   { color: 'rgba(255,255,255,0.35)', fontSize: 22, fontWeight: '300' },

  ring: { borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  ringText: { color: '#fff', fontWeight: '700' },

  overallCard: {
    marginTop: 2,
    backgroundColor: ORANGE,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  overallLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8 },
  overallRow:   { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  overallScore: { color: '#fff', fontSize: 80, fontWeight: '900', lineHeight: 82, letterSpacing: -2 },
  overallGrade: { color: 'rgba(255,255,255,0.75)', fontSize: 64, fontWeight: '800', lineHeight: 70, letterSpacing: -1 },

  finishBtn: {
    marginTop: 2,
    backgroundColor: ORANGE,
    paddingVertical: 18,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  finishText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
});
