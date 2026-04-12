import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PURPLE } from "@/constants/colors";
import { useAuth } from "@/context/auth-context";
import { useDatabaseLiveValue } from "@/hooks/use-database";

const PURPLE_LIGHT = "#ECEAFF";
const BG = "#F2F2F7";
const CARD_BG = "#FFFFFF";
const TEXT_DARK = "#1C1C1E";
const TEXT_MUTED = "#8E8E93";

const REQUIREMENTS = [
  "Side angle shot",
  "Good lighting",
  "5-15 seconds duration",
  "Full body visible",
];

const FILE_INFO = [
  "Max 500MB per video",
  "MP4, MOV, or AVI format",
  "Videos reviewed within 24 hours",
];

function BasketballUpload() {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        {/* Dashed upload zone */}
        <View style={styles.dropZone}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="videocam" size={34} color={PURPLE} />
          </View>
          <Text style={styles.chooseTitle}>Choose video</Text>
          <Text style={styles.chooseSub}>
            Share your skills and earn points
          </Text>
          <TouchableOpacity
            style={styles.selectBtn}
            activeOpacity={0.85}
            onPress={() => router.push("/shot-breakdown")}
          >
            <MaterialIcons name="upload" size={20} color="#fff" />
            <Text style={styles.selectBtnText}>Select File</Text>
          </TouchableOpacity>
        </View>

        {/* Video Requirements */}
        <View style={styles.reqCard}>
          <Text style={styles.reqTitle}>Video Requirements</Text>
          {REQUIREMENTS.map((item) => (
            <View key={item} style={styles.reqRow}>
              <Text style={styles.reqBullet}>•</Text>
              <Text style={styles.reqText}>{item}</Text>
            </View>
          ))}
        </View>

        {/* File info */}
        <View style={styles.infoSection}>
          {FILE_INFO.map((item) => (
            <View key={item} style={styles.infoRow}>
              <Text style={styles.infoBullet}>•</Text>
              <Text style={styles.infoText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function sanitizeUid(sub: string) {
  return sub.replace(/[.#$[\]|]/g, "_");
}

export default function UploadScreen() {
  const { user } = useAuth();
  const userId = user?.sub ? sanitizeUid(user.sub) : "anonymous";
  const { value: activeSport } = useDatabaseLiveValue<string>(
    `users/${userId}/sports/active`,
  );

  const sport = activeSport ?? "Basketball";

  return (
    <SafeAreaView style={styles.safeArea}>
      {sport === "Basketball" ? (
        <BasketballUpload />
      ) : (
        <View style={styles.blank} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  blank: {
    flex: 1,
    backgroundColor: BG,
  },

  // Outer card
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    overflow: "hidden",
  },

  // Dashed drop zone
  dropZone: {
    margin: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#CBCBE8",
    borderStyle: "dashed",
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 10,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: PURPLE_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  chooseTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: TEXT_DARK,
    letterSpacing: -0.3,
  },
  chooseSub: {
    fontSize: 15,
    color: TEXT_MUTED,
    textAlign: "center",
  },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: PURPLE,
    paddingVertical: 15,
    paddingHorizontal: 36,
    borderRadius: 50,
    marginTop: 8,
  },
  selectBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  // Requirements card
  reqCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  reqTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT_DARK,
    marginBottom: 2,
  },
  reqRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  reqBullet: {
    fontSize: 15,
    color: PURPLE,
    lineHeight: 22,
  },
  reqText: {
    fontSize: 15,
    color: PURPLE,
    flex: 1,
    lineHeight: 22,
  },

  // File info
  infoSection: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    gap: 10,
  },
  infoRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  infoBullet: {
    fontSize: 15,
    color: TEXT_MUTED,
    lineHeight: 22,
  },
  infoText: {
    fontSize: 15,
    color: TEXT_MUTED,
    flex: 1,
    lineHeight: 22,
  },
});
