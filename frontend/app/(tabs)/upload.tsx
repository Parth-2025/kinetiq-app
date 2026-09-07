import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { Icon } from "@/components/icons/Icon";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { apiFetch } from "@/config/api";
import { invalidate, useApiQuery } from "@/hooks/use-api";
import { analyzeVideo } from "@/services/kinetiq-api";
import { useTheme } from "@/theme";

const REQUIREMENTS = ["Side angle", "Good lighting", "5–15 sec", "Full body"];

type VideoSource = "camera" | "library";

function BasketballUpload({ activeSport }: { activeSport: string | null }) {
  const t = useTheme();
  const [latestSessionId, setLatestSessionId] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submitAsset = async (
    asset: ImagePicker.ImagePickerAsset,
    source: VideoSource,
  ) => {
    if (!asset || asset.type !== "video") {
      setErrorMsg("Please choose a video file to analyze.");
      return;
    }

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
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpload = async (source: VideoSource) => {
    setErrorMsg(null);
    setStatusMessage(null);

    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        setErrorMsg("Camera access is required to record a shot video.");
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
      setErrorMsg("Media library access is required to pick a shot video.");
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
    <Screen scroll>
      <View style={{ gap: t.space.l }}>
        <View style={{ alignSelf: "flex-start" }}>
          <Chip label={`Analyzing as ${sportLabel}`} tone="accent" />
        </View>

        {errorMsg ? (
          <InlineAlert
            tone="danger"
            message={errorMsg}
            onDismiss={() => setErrorMsg(null)}
          />
        ) : null}

        <Card>
          <View style={{ alignItems: "center", gap: t.space.m }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: t.color.accentSubtle,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator color={t.color.accent} size="large" />
              ) : (
                <Icon name="camera" size={30} color="accent" />
              )}
            </View>

            <Text variant="title3">Add your shot</Text>

            {isSubmitting ? (
              <Text variant="body1" color="textSecondary" align="center">
                {statusMessage ?? "Analyzing…"}
              </Text>
            ) : (
              <>
                <Text variant="body1" color="textSecondary" align="center">
                  Record a new clip or pick one from your library.
                </Text>
                <Button
                  label="Record video"
                  icon="camera"
                  fullWidth
                  onPress={() => handleUpload("camera")}
                />
                <Button
                  label="Choose file"
                  icon="image"
                  appearance="outline"
                  fullWidth
                  onPress={() => handleUpload("library")}
                />
              </>
            )}

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: t.space.s,
                justifyContent: "center",
              }}
            >
              {REQUIREMENTS.map((r) => (
                <Chip key={r} label={r} />
              ))}
            </View>

            {latestSessionId ? (
              <Button
                label="Open latest analysis"
                appearance="subtle"
                onPress={() =>
                  router.push({
                    pathname: "/shot-breakdown",
                    params: { sessionId: latestSessionId },
                  })
                }
              />
            ) : null}
          </View>
        </Card>
      </View>
    </Screen>
  );
}

export default function UploadScreen() {
  const { value: sportsState } = useApiQuery<{ active: string | null }>(
    "sports",
    "/me/sports",
  );
  const activeSport = sportsState?.active ?? null;
  const sport = (activeSport ?? "basketball").toLowerCase();

  return sport === "basketball" ? (
    <BasketballUpload activeSport={activeSport} />
  ) : (
    <Screen>
      <View />
    </Screen>
  );
}
