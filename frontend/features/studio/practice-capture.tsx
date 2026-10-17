import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Platform, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { authorizationHeaders } from "@/config/api";
import { requireRuntimeConfig } from "@/config/runtime";
import { invalidate } from "@/hooks/use-api";
import { useStudio, useStudioAction } from "./data";
import { ActionError, Badge, Input, Notice, Panel, QueryState, Row } from "./ui";

type Source = { id: string; label: string; camera_position: string; orientation_degrees: number; duration_seconds: number | null; bytes: number | null; original_filename: string | null; uploaded: boolean; status: string; calibration: { status?: string }; synchronization: { status?: string }; provenance: string };
type SourceList = { sources: Source[]; review_status: string; review_note: string };

export function PracticeCapture({ practiceId }: { practiceId: string }) {
  const q = useStudio<SourceList>(`/practices/${practiceId}/camera-sources`);
  const action = useStudioAction();
  const [label, setLabel] = useState("");
  const [position, setPosition] = useState("unspecified");
  const [orientation, setOrientation] = useState("0");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function upload(source: Source) {
    try {
      setError(null);
      if (Platform.OS === "ios") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error("Allow video library access to choose a camera recording.");
      }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsEditing: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const seconds = asset.duration ? asset.duration / 1000 : Number(duration);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("Enter the clip duration in seconds before uploading.");
      const body = new FormData();
      body.append("video", asset.file ?? ({ uri: asset.uri, name: asset.fileName ?? "recording.mp4", type: asset.mimeType ?? "video/mp4" } as unknown as Blob));
      const base = requireRuntimeConfig("kinetiqApiUrl", "Configure the KinetiQ backend URL.");
      const response = await fetch(`${base}/studio/practices/${practiceId}/camera-sources/${source.id}/video?duration_seconds=${encodeURIComponent(seconds)}`, { method: "POST", headers: authorizationHeaders(), body });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(typeof data?.detail === "string" ? data.detail : "Upload failed.");
      }
      invalidate("studio:");
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
  }
  return <Panel title="Camera sources">
    <Notice>Add up to three private source videos. Camera calibration and sync are coach-entered evidence. No player tracking, jersey recognition, triangulation, or automatic metrics are produced.</Notice>
    <QueryState query={q} />
    {q.value?.sources.map((source) => <View key={source.id} style={{ gap: 10 }}>
      <Row title={source.label} meta={`${source.camera_position} · ${source.orientation_degrees}° · ${source.uploaded ? "Footage uploaded" : "Uncalibrated"}`} detail={`${source.original_filename ?? "No source file"}${source.duration_seconds ? ` · ${source.duration_seconds}s` : ""} · Calibration: ${source.calibration.status ?? "uncalibrated"} · Sync: ${source.synchronization.status ?? "unsynchronized"}`} />
      {!source.uploaded && <Button label="Choose and upload video" onPress={() => upload(source)} disabled={action.busy} />}
      <SourceEvidence practiceId={practiceId} source={source} />
      <Button label="Remove source and file" appearance="subtle" disabled={action.busy} onPress={() => action.run(`/practices/${practiceId}/camera-sources/${source.id}`, "DELETE")} />
    </View>)}
    <Input label="Camera label" value={label} onChangeText={setLabel} placeholder="Baseline" />
    <Input label="Position (for example baseline or sideline)" value={position} onChangeText={setPosition} />
    <Input label="Orientation degrees" value={orientation} onChangeText={setOrientation} keyboardType="numeric" />
    <Button label="Add camera source" disabled={!label.trim() || (q.value?.sources.length ?? 0) >= 3 || action.busy} loading={action.busy} onPress={async () => { const result = await action.run(`/practices/${practiceId}/camera-sources`, "POST", { label, camera_position: position, orientation_degrees: Number(orientation) }); if (result) { setLabel(""); setPosition("unspecified"); setOrientation("0"); } }} />
    <Input label="Clip duration in seconds (used if picker omits it)" value={duration} onChangeText={setDuration} keyboardType="numeric" />
    <Badge label={q.value?.review_status === "evidence_recorded" ? "Evidence recorded · coach review" : "Setup incomplete"} />
    <Text color="textSecondary">{q.value?.review_note}</Text>
    <Text color="textSecondary">Private originals stay stored until you remove each camera source. Use “Remove source and file” to permanently delete its video.</Text>
    {error && <Text color="danger">{error}</Text>}
    <ActionError message={action.error} />
  </Panel>;
}

function SourceEvidence({ practiceId, source }: { practiceId: string; source: Source }) {
  const action = useStudioAction();
  const [width, setWidth] = useState("15");
  const [length, setLength] = useState("28");
  const [landmarks, setLandmarks] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [corners, setCorners] = useState([ ["", ""], ["", ""], ["", ""], ["", ""] ]);
  const [inputError, setInputError] = useState<string | null>(null);
  const [offset, setOffset] = useState("0");
  const [uncertainty, setUncertainty] = useState("0.1");
  const [evidence, setEvidence] = useState("");
  return <View style={{ gap: 10 }}>
    <Input label="Court width (units)" value={width} onChangeText={setWidth} keyboardType="numeric" />
    <Input label="Court length (same units)" value={length} onChangeText={setLength} keyboardType="numeric" />
    <Text color="textSecondary">Use image pixel coordinates for the four court corners, viewed from one consistent end of the court. The near left corner is the court origin (0, 0).</Text>
    {!advanced && corners.map((corner, index) => <View key={index} style={{ gap: 6 }}>
      <Text>{["Near left", "Near right", "Far left", "Far right"][index]} corner</Text>
      <Input label="Image X (pixels)" value={corner[0]} keyboardType="numeric" onChangeText={(value) => setCorners((current) => current.map((pair, i) => i === index ? [value, pair[1]] : pair))} />
      <Input label="Image Y (pixels)" value={corner[1]} keyboardType="numeric" onChangeText={(value) => setCorners((current) => current.map((pair, i) => i === index ? [pair[0], value] : pair))} />
    </View>)}
    <Button appearance="subtle" label={advanced ? "Use four court corners" : "Enter advanced landmark pairs"} onPress={() => setAdvanced(!advanced)} />
    {advanced && <Input label="Landmark pairs [[imageX,imageY,courtX,courtY],…]" value={landmarks} onChangeText={setLandmarks} multiline />}
    <Button label="Save calibration evidence" disabled={action.busy} onPress={async () => {
      try {
        setInputError(null);
        const court = [[0, 0], [Number(width), 0], [0, Number(length)], [Number(width), Number(length)]];
        if (!advanced && corners.some((pair) => pair.some((value) => !value.trim() || !Number.isFinite(Number(value))))) throw new Error("Enter image X and Y for all four corners.");
        const points = advanced ? JSON.parse(landmarks) : corners.map((pair, i) => [Number(pair[0]), Number(pair[1]), ...court[i]]);
        await action.run(`/practices/${practiceId}/camera-sources/${source.id}/calibration`, "PUT", { court_width: Number(width), court_length: Number(length), landmarks: points, reprojection_error: null });
      } catch (error) { setInputError(error instanceof Error ? error.message : "Check the landmark values."); }
    }} />
    {inputError && <Text color="danger">{inputError}</Text>}
    <Input label="Sync offset from practice start (seconds)" value={offset} onChangeText={setOffset} keyboardType="numeric" />
    <Input label="Sync uncertainty (seconds)" value={uncertainty} onChangeText={setUncertainty} keyboardType="numeric" />
    <Input label="Sync evidence" value={evidence} onChangeText={setEvidence} placeholder="Shared clap at 12.4 seconds" />
    <Button label="Save synchronization evidence" disabled={action.busy || !evidence.trim()} onPress={() => action.run(`/practices/${practiceId}/camera-sources/${source.id}/synchronization`, "PUT", { method: "manual", offset_seconds: Number(offset), uncertainty_seconds: Number(uncertainty), evidence })} />
    <ActionError message={action.error} />
  </View>;
}
