import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { TextInput } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { apiFetch, authorizationHeaders } from "@/config/api";
import { requireRuntimeConfig } from "@/config/runtime";
import type { Athlete, Device } from "./types";
import { useStudio, useStudioAction } from "./data";
import { ActionError, Choices, Panel, QueryState, Row, StudioScreen } from "./ui";

export function DeviceCalibrationPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const devices = useStudio<Device[]>("/devices");
  const athletes = useStudio<Athlete[]>("/athletes");
  const action = useStudioAction();
  const device = devices.value?.find((item) => item.id === id);
  const [athleteId, setAthleteId] = useState("");
  const [pairId, setPairId] = useState("");
  const [upperMount, setUpperMount] = useState("");
  const [forearmMount, setForearmMount] = useState("");
  const [neutral, setNeutral] = useState("");
  const [calibrationId, setCalibrationId] = useState("");
  const [samples, setSamples] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const athlete = athletes.value?.find((item) => item.id === athleteId);
  const pairedDevices = useMemo(
    () =>
      (devices.value ?? []).filter(
        (item) =>
          item.kind === "imu" && item.id !== id && item.athlete_id === athleteId,
      ),
    [devices.value, id, athleteId],
  );

  async function configure() {
    setMessage(null);
    const result = await action.run(`/sensors/devices/${id}/protocol`, "PUT", {
      athlete_id: athleteId,
      capabilities: ["orientation_quaternion", "timestamp"],
      timebase: "host_monotonic",
      metadata: { protocol: "offline_import_v1" },
    });
    if (result) setMessage("Device association recorded. Connection remains unconnected.");
  }

  async function calibrate() {
    setMessage(null);
    let values: number[][];
    try {
      values = [upperMount, forearmMount, neutral].map((value) => {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed) || parsed.length !== 4 || parsed.some((v) => !Number.isFinite(v))) {
          throw new Error("Each value must be a four-number quaternion.");
        }
        return parsed;
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check quaternion values.");
      return;
    }
    const result = await action.run<{ id: string }>("/sensors/calibrations", "POST", {
      athlete_id: athleteId,
      upper_device_id: id,
      forearm_device_id: pairId,
      upper_sensor_to_segment_q: values[0],
      forearm_sensor_to_segment_q: values[1],
      neutral_relative_q: values[2],
      timestamp_provenance: { source: "coach_entered", clock: "host_monotonic" },
      notes: "Coach supplied calibration values; protocol has not been hardware validated.",
    });
    if (result) {
      setCalibrationId(result.id);
      setMessage("Calibration record saved. This operator-entered calibration is not hardware validated.");
    }
  }

  async function importSamples() {
    setMessage(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(samples);
      if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 1000) {
        throw new Error("Paste a JSON array containing 1 to 1,000 paired samples.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check the JSON sample data.");
      return;
    }
    try {
      const base = requireRuntimeConfig("kinetiqApiUrl", "Missing KinetiQ API URL.");
      const created = await apiFetch<{ id: string }>("/studio/sensors/captures", {
        method: "POST",
        body: { athlete_id: athleteId, upper_device_id: id, forearm_device_id: pairId, calibration_id: calibrationId },
      });
      const form = new FormData();
      form.append("file", new Blob([JSON.stringify(parsed)], { type: "application/json" }), "samples.json");
      const response = await fetch(`${base}/studio/sensors/captures/${created.id}/import`, {
        method: "POST",
        headers: authorizationHeaders(),
        body: form,
      });
      if (!response.ok) throw new Error(`Sensor import failed (${response.status}).`);
      const imported = (await response.json()) as { sample_count: number };
      setMessage(`Imported ${imported.sample_count} samples from this file input. No live connection was made.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sensor import failed.");
    }
  }

  return (
    <StudioScreen title={device?.name ?? "Device protocol"} eyebrow="Coach hardware kit" back>
      <QueryState query={devices} />
      <QueryState query={athletes} />
      {device && (
        <>
          <Panel title="Inventory status">
            <Row title={`${device.kind.replaceAll("_", " ")} · ${device.serial}`} meta="Not connected" />
            <Text color="textSecondary">
              This prototype accepts bounded CSV or JSON file imports. It does not connect to BLE,
              stream live readings, or make manufacturer accuracy claims. UWB positions are not
              converted into limb angles.
            </Text>
          </Panel>
          <Panel title="Associate the coach-owned IMU">
            <Choices value={athleteId} onChange={(value) => { setAthleteId(value); setPairId(""); setCalibrationId(""); }} options={(athletes.value ?? []).map((a) => ({ value: a.id, label: a.name }))} />
            <Button label="Save athlete association" disabled={!athleteId || device.kind !== "imu"} loading={action.busy} onPress={configure} />
          </Panel>
          {athlete && (
            <Panel title="Operator prototype · paired calibration">
              <Text color="textSecondary">Developer/operator prototype only. Enter measured calibration quaternions as JSON arrays in [w, x, y, z] order. Values must come from an actual calibration procedure; this screen does not estimate them. Save this calibration before importing samples.</Text>
              <Choices value={pairId} onChange={(value) => { setPairId(value); setCalibrationId(""); }} options={pairedDevices.map((item) => ({ value: item.id, label: item.name }))} />
              <TextInput accessibilityLabel="Upper sensor to segment quaternion" value={upperMount} onChangeText={setUpperMount} placeholder="[w, x, y, z]" style={{ minHeight: 44, borderBottomWidth: 1, padding: 8 }} />
              <TextInput accessibilityLabel="Forearm sensor to segment quaternion" value={forearmMount} onChangeText={setForearmMount} placeholder="[w, x, y, z]" style={{ minHeight: 44, borderBottomWidth: 1, padding: 8 }} />
              <TextInput accessibilityLabel="Neutral relative quaternion" value={neutral} onChangeText={setNeutral} placeholder="[w, x, y, z]" style={{ minHeight: 44, borderBottomWidth: 1, padding: 8 }} />
              <Button label="Save calibration record" disabled={!athleteId || !pairId || !upperMount.trim() || !forearmMount.trim() || !neutral.trim()} loading={action.busy} onPress={calibrate} />
            </Panel>
          )}
          {athlete && (
            <Panel title="Import paired samples">
              <Text color="textSecondary">Paste a JSON array with paired timestamps and quaternions. Imports are limited to 1 MB and 1,000 samples; invalid or unsynchronized readings remain unusable.</Text>
              <TextInput
                accessibilityLabel="JSON sensor samples"
                value={samples}
                onChangeText={setSamples}
                multiline
                textAlignVertical="top"
                placeholder={'[{"upper_ts_s":0,"forearm_ts_s":0,"upper_q":[1,0,0,0],"forearm_q":[1,0,0,0]}]'}
                style={{ minHeight: 140, borderWidth: 1, borderColor: "#c7cbd1", padding: 10, fontFamily: "monospace" }}
              />
              <Button label="Import paired JSON" disabled={!athleteId || !pairId || !calibrationId || !samples.trim()} loading={action.busy} onPress={importSamples} />
            </Panel>
          )}
          {message && <Text color="textSecondary">{message}</Text>}
          <ActionError message={action.error} />
        </>
      )}
      {!device && devices.value && <Text color="textSecondary">This device is not in your coach-owned inventory.</Text>}
    </StudioScreen>
  );
}
