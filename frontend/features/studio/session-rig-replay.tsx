import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/context/auth-context";
import { dateLabel, useStudio, useStudioAction } from "./data";
import { MotionReplay } from "./motion-replay";
import type { DisplayRig } from "./skinned-rig";
import type { MotionFrame } from "./types";
import { ActionError, Choices, Notice, QueryState } from "./ui";

type SavedRig = DisplayRig & {
  schema_version: string;
  coordinate_convention: string;
  frames: (DisplayRig["frames"][number] & { time_s: number; quality: string })[];
};
type Revision = { id: string; created_at: string; artifact_sha256: string; rig: SavedRig };
type Props = { sessionId: string; canManage: boolean; frames: MotionFrame[] };

/** Remount on account/session changes so a late build response cannot select another account's rig. */
export function SessionRigReplay(props: Props) {
  const { user } = useAuth();
  return <RevisionReplay key={`${user?.sub}:${props.sessionId}`} {...props} />;
}

function RevisionReplay({ sessionId, canManage, frames }: Props) {
  const path = `/sessions/${sessionId}/rig-revisions`;
  const list = useStudio<{ revisions: Omit<Revision, "rig">[] }>(path);
  const [selected, setSelected] = useState("raw");
  const detail = useStudio<Revision>(selected === "raw" ? null : `${path}/${selected}`);
  const action = useStudioAction();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // Saved revisions have their own timeline. Never attach today's raw metrics to an older rig.
  const rig = !detail.error && detail.value?.id === selected ? detail.value.rig : undefined;
  const supported = rig?.schema_version === "display_rig.v1" && rig.coordinate_convention === "kinetiq_rh_yup_v1";
  const replayFrames = useMemo<MotionFrame[]>(() => rig && supported ? rig.frames.map((f) => ({
    time_ms: f.time_s * 1000, quality: f.quality, points: [], elbow_flexion: null, knee_flexion: null,
  })) : [], [rig, supported]);

  return <View style={{ gap: 16 }}>
    <Text variant="caption1" color="textSecondary">Save a neutral mannequin revision to reopen the same estimated proportions later.</Text>
    <QueryState query={list} />
    <Choices value={selected} onChange={setSelected} options={[
      { value: "raw", label: "Landmark preview" },
      ...(list.value?.revisions ?? []).map((r) => ({ value: r.id, label: `${dateLabel(r.created_at)} · ${r.id.slice(0, 8)}` })),
    ]} />
    {canManage && <Button label={action.busy ? "Saving mannequin…" : "Save mannequin revision"}
      appearance="outline" disabled={action.busy} onPress={async () => {
        const result = await action.run<Revision>(path, "POST");
        if (mounted.current && result) setSelected(result.id);
      }} />}
    <ActionError message={action.error} />
    {selected === "raw" ? <MotionReplay frames={frames} /> : <>
      <QueryState query={detail} />
      {rig && !supported && <Notice>This mannequin version is not supported by this app.</Notice>}
      {rig && supported && <MotionReplay key={selected} frames={replayFrames} rig={rig} />}
    </>}
  </View>;
}
