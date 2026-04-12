import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
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

type PhaseData = {
  name: string;
  score: number;
  working: string[];
  fix: string[];
};

const PHASE_DATA: Record<number, PhaseData> = {
  1: {
    name: 'READY',
    score: 85,
    working: ['Stance width solid', 'Knees bent good', 'Ball placement on point'],
    fix: ['Feet need to be wider', 'Drop hips lower for more power', 'Eyes up on rim earlier'],
  },
  2: {
    name: 'LOAD',
    score: 92,
    working: ['Good hip loading', 'Elbow aligned under ball', 'Smooth weight transfer'],
    fix: ['Dip is slightly rushed', 'Off-hand thumb pressure too early'],
  },
  3: {
    name: 'SETPOINT',
    score: 78,
    working: ['Ball reaches set point consistently', 'Elbow angle solid'],
    fix: ['Set point too far from face', 'Wrist not fully cocked at set', 'Guide hand leaves ball late'],
  },
  4: {
    name: 'RELEASE',
    score: 88,
    working: ['Clean finger-tip release', 'Good backspin generated', 'Wrist snap is strong'],
    fix: ['Release point slightly low', 'Off-hand flares on release'],
  },
  5: {
    name: 'FOLLOW THROUGH',
    score: 95,
    working: ['Full wrist extension', 'Arm stays up after release', 'Consistent finishing shape'],
    fix: ['Pull arm down slightly too soon'],
  },
};

function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const color = score >= 90 ? GREEN : YELLOW;
  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}>
      <Text style={[styles.ringText, { fontSize: size * 0.31 }]}>{score}</Text>
    </View>
  );
}

function FeedbackRow({ text }: { text: string }) {
  return (
    <View style={styles.feedRow}>
      <Text style={styles.feedText}>{text}</Text>
    </View>
  );
}

export default function PhaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const phaseId = Number(id ?? 1);
  const phase = PHASE_DATA[phaseId] ?? PHASE_DATA[1];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>{phase.name}</Text>
            <ScoreRing score={phase.score} />
          </View>
        </View>

        {/* Reference form image placeholder */}
        <View style={styles.refBox}>
          <View style={styles.refPlaceholder}>
            <MaterialIcons name="sports-basketball" size={48} color="rgba(255,255,255,0.15)" />
          </View>
          <View style={styles.refLabel}>
            <Text style={styles.refLabelText}>REFERENCE FORM</Text>
          </View>
        </View>

        {/* What's Working */}
        <View style={styles.section}>
          <View style={[styles.sectionHeader, { borderLeftColor: GREEN }]}>
            <Text style={[styles.sectionTitle, { color: GREEN }]}>WHAT'S WORKING</Text>
          </View>
          {phase.working.map((item, i) => (
            <FeedbackRow key={i} text={item} />
          ))}
        </View>

        {/* What to Fix */}
        <View style={styles.section}>
          <View style={[styles.sectionHeader, { borderLeftColor: ORANGE }]}>
            <Text style={[styles.sectionTitle, { color: ORANGE }]}>WHAT TO FIX</Text>
          </View>
          {phase.fix.map((item, i) => (
            <FeedbackRow key={i} text={item} />
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  scroll:   { flex: 1 },
  content:  { paddingBottom: 48 },

  // Header
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
  backText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: 1 },

  // Score ring
  ring: { borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  ringText: { color: '#fff', fontWeight: '700' },

  // Reference image
  refBox: {
    marginHorizontal: 0,
    height: 220,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  refPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  refLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  refLabelText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  // Feedback sections
  section: {
    marginTop: 2,
  },
  sectionHeader: {
    borderLeftWidth: 4,
    paddingLeft: 14,
    paddingVertical: 14,
    backgroundColor: ROW_BG,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  feedRow: {
    backgroundColor: ROW_BG,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: SEP,
  },
  feedText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '400',
  },
});
