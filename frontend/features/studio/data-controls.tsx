import { useRef, useState } from "react";
import { Platform, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { authorizationHeaders } from "@/config/api";
import { requireRuntimeConfig } from "@/config/runtime";
import { useTheme } from "@/theme";
import { ActionError, Panel } from "./ui";

/** Mount inside account settings to expose the authenticated account export. */
export function DataControls() {
  const theme = useTheme();
  const exportLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function exportData() {
    if (exportLock.current) return;
    exportLock.current = true;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const base = requireRuntimeConfig(
        "kinetiqApiUrl",
        "Configure the KinetiQ backend URL.",
      );
      const response = await fetch(`${base}/studio/data-export`, {
        headers: authorizationHeaders(),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? "Your data export could not be prepared.");
      }
      const data = await response.json();
      const json = JSON.stringify(data, null, 2);
      const filename = "kinetiq-data-export.json";
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        if (!(await Sharing.isAvailableAsync())) {
          throw new Error("File sharing is unavailable on this device. Export your data from the web app.");
        }
        const file = new File(Paths.cache, `kinetiq-data-export-${Date.now()}.json`);
        try {
          file.create();
          file.write(json);
          await Sharing.shareAsync(file.uri, {
            mimeType: "application/json",
            UTI: "public.json",
            dialogTitle: "Save your KinetiQ data export",
          });
        } finally {
          if (file.exists) file.delete();
        }
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your data export failed.");
    } finally {
      exportLock.current = false;
      setBusy(false);
    }
  }

  return (
    <Panel title="Your data">
      <Text color="textSecondary">
        Download your account profile, personal training results, measurements,
        and data from teams you own. Private teammate sessions are excluded.
      </Text>
      <View style={{ gap: 8, padding: 12, backgroundColor: theme.color.layerAlt, borderRadius: 0 }}>
        <Button
          label={busy ? "Preparing export…" : "Export my data"}
          loading={busy}
          disabled={busy}
          onPress={exportData}
        />
        {done && <Text>Export ready.</Text>}
        <ActionError message={error} />
      </View>
    </Panel>
  );
}
