import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { apiFetch } from "@/config/api";
import { analyzeVideo } from "@/services/kinetiq-api";
import {
  APP_BG,
  APP_SHADOW,
  APP_SURFACE,
  APP_TEXT,
  APP_TEXT_MUTED,
  PURPLE,
  PURPLE_TINT_STRONG,
  SUCCESS,
  SUCCESS_BORDER,
  SUCCESS_SURFACE,
  WHITE,
} from "@/constants/colors";
import { invalidate, useApiQuery } from "@/hooks/use-api";

const REQUIREMENTS = ["Side angle", "Good lighting", "5–15 sec", "Full body"];

function showError(message: string) {
  if (Platform.OS === "web") {
    window.alert(message);
    return;
  }

  Alert.alert("Upload failed", message);
}

type VideoSource = "camera" | "library";

type SourceAction = {
  key: VideoSource;
  icon: ComponentProps<typeof MaterialIcons>["name"];
  label: string;
};

const SOURCE_ACTIONS: SourceAction[] = [
  { key: "camera", icon: "videocam", label: "Record Video" },
  { key: "library", icon: "upload", label: "Choose File" },
];

function BasketballUpload({ activeSport }: { activeSport: string | null }) {
  const [latestSessionId, setLatestSessionId] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const submitAsset = async (
    asset: ImagePicker.ImagePickerAsset,
    source: VideoSource,
  ) => {
    if (!asset || asset.type !== "video") {
      showError("Please choose a video file to analyze.");
      return;
    }

    const fallbackLabel =
      source === "camera" ? "Recorded shot video" : "Selected shot video";

    setSelectedFileName(asset.fileName ?? fallbackLabel);
    setIsSubmitting(true);

    try {
      setStatusMessage("Uploading your shot to KinetiQ...");
      const analysis = await analyzeVideo(asset, activeSport ?? "basketball");

      setStatusMessage("Saving your results...");
      const created = await apiFetch<{ id: string }>("/me/sessions", {
        method: "POST",
        body: {
          sport: activeSport ?? "basketball",
          source: {
            uri: asset.uri,
            fileName: asset.fileName ?? null,
            mimeType: asset.mimeType ?? null,
            fileSize: asset.fileSize ?? null,
            durationMs: asset.duration ?? null,
            width: asset.width ?? null,
            height: asset.height ?? null,
          },
          analysis,
        },
      });
      invalidate("stats");
      invalidate("sessions");
      setLatestSessionId(created.id);

      router.push({
        pathname: "/shot-breakdown",
        params: { sessionId: created.id },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while analyzing your shot.";
      setStatusMessage(null);
      showError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpload = async (source: VideoSource) => {
    setStatusMessage(null);

    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        showError("Camera access is required to record a shot video.");
        return;
      }

      const cameraResult = await ImagePicker.launchCameraAsync({
        mediaTypes: ["videos"],
        quality: 1,
        allowsEditing: false,
        videoMaxDuration: 15,
      });

      if (cameraResult.canceled) {
        return;
      }

      await submitAsset(cameraResult.assets[0], source);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      showError("Media library access is required to pick a shot video.");
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 1,
      allowsEditing: false,
      selectionLimit: 1,
    });

    if (pickerResult.canceled) {
      return;
    }

    await submitAsset(pickerResult.assets[0], source);
  };

  const sportName = activeSport ?? "basketball";
  const sportLabel = sportName.charAt(0).toUpperCase() + sportName.slice(1);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <View style={styles.sportPill}>
          <MaterialIcons name="sports-basketball" size={14} color={PURPLE} />
          <Text style={styles.sportPillText}>Analyzing as {sportLabel}</Text>
        </View>

        <View style={styles.iconCircle}>
          {isSubmitting ? (
            <ActivityIndicator color={PURPLE} size="large" />
          ) : (
            <MaterialIcons name="videocam" size={34} color={PURPLE} />
          )}
        </View>

        <Text style={styles.chooseTitle}>Add your shot</Text>

        {isSubmitting ? (
          <Text style={styles.statusMessage}>{statusMessage ?? "Analyzing…"}</Text>
        ) : (
          <>
            <Text style={styles.chooseSub}>
              Record a new clip or pick one from your library.
            </Text>
            <View style={styles.actionRow}>
              {SOURCE_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  style={styles.selectBtn}
                  activeOpacity={0.85}
                  onPress={() => handleUpload(action.key)}
                >
                  <MaterialIcons name={action.icon} size={20} color={WHITE} />
                  <Text style={styles.selectBtnText}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedFileName ? (
              <Text style={styles.fileName}>{selectedFileName}</Text>
            ) : null}
          </>
        )}

        <View style={styles.chipRow}>
          {REQUIREMENTS.map((item) => (
            <View key={item} style={styles.chip}>
              <Text style={styles.chipText}>{item}</Text>
            </View>
          ))}
        </View>

        {latestSessionId ? (
          <TouchableOpacity
            style={styles.latestSessionButton}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: "/shot-breakdown",
                params: { sessionId: latestSessionId },
              })
            }
          >
            <MaterialIcons name="history" size={18} color={SUCCESS} />
            <Text style={styles.latestSessionText}>Open latest saved analysis</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

export default function UploadScreen() {
  const { value: sportsState } = useApiQuery<{ active: string | null }>(
    "sports",
    "/me/sports",
  );
  const activeSport = sportsState?.active ?? null;
  const sport = (activeSport ?? "basketball").toLowerCase();

  return (
    <SafeAreaView style={styles.safeArea}>
      {sport === "basketball" ? (
        <BasketballUpload activeSport={activeSport} />
      ) : (
        <View style={styles.blank} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: APP_BG,
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
    backgroundColor: APP_BG,
  },
  card: {
    backgroundColor: APP_SURFACE,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 12,
    shadowColor: APP_SHADOW,
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sportPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: PURPLE_TINT_STRONG,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  sportPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: PURPLE,
    letterSpacing: -0.1,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: PURPLE_TINT_STRONG,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  chooseTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: APP_TEXT,
    letterSpacing: -0.3,
  },
  chooseSub: {
    fontSize: 15,
    color: APP_TEXT_MUTED,
    textAlign: "center",
    lineHeight: 22,
  },
  actionRow: {
    width: "100%",
    gap: 10,
    marginTop: 4,
  },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: PURPLE,
    paddingVertical: 15,
    paddingHorizontal: 36,
    borderRadius: 50,
    width: "100%",
  },
  selectBtnText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "700",
  },
  fileName: {
    marginTop: 6,
    fontSize: 13,
    color: APP_TEXT,
    fontWeight: "600",
  },
  statusMessage: {
    fontSize: 14,
    color: PURPLE,
    textAlign: "center",
    lineHeight: 20,
    paddingVertical: 8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  chip: {
    backgroundColor: PURPLE_TINT_STRONG,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: PURPLE,
  },
  latestSessionButton: {
    width: "100%",
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: SUCCESS_SURFACE,
    borderWidth: 1,
    borderColor: SUCCESS_BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  latestSessionText: {
    color: SUCCESS,
    fontSize: 15,
    fontWeight: "700",
  },
});
