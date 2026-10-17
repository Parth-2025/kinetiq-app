import { useState } from "react";
import { router } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Input, Notice, Panel, StudioScreen } from "./ui";
import { useStudioAction } from "./data";

type ClaimPreview = {
  athlete: { id: string; name: string; sport: string; dominant_side: string };
  coach: { id: string; name: string };
  teams: { id: string; name: string; coach_id: string }[];
  sharing_notice: string;
  session_count: number;
  claim_blocked: boolean;
  claim_block_reason: string | null;
  expires_at: string;
};

export function ClaimPage() {
  const action = useStudioAction();
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<ClaimPreview | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [complete, setComplete] = useState(false);

  async function loadPreview() {
    setPreview(null);
    setAccepted(false);
    const result = await action.run<ClaimPreview>("/claims/preview", "POST", { code });
    if (result) setPreview(result);
  }

  async function accept() {
    const result = await action.run<{ claimed: boolean }>("/claims/accept", "POST", { code });
    if (result?.claimed) setComplete(true);
  }

  return (
    <StudioScreen eyebrow="Athlete profile" title="Connect your profile." subtitle="Enter the one-time code from your coach, review what will be connected, and choose whether to accept." back>
      <Panel title="Claim code">
        <Input label="One-time code" value={code} onChangeText={value => setCode(value.toUpperCase())} />
        <Button label="Review profile" appearance="outline" loading={action.busy} disabled={code.trim().length < 8} onPress={loadPreview} />
        {action.error && <Notice error>{action.error}</Notice>}
      </Panel>
      {preview && !complete && (
        <Panel title="Review before connecting">
          <Text variant="title3">{preview.athlete.name}</Text>
          <Text color="textSecondary">Coach: {preview.coach.name} · {preview.athlete.sport} · {preview.athlete.dominant_side} side</Text>
          <Text variant="body1Strong">Teams that stay connected</Text>
          {preview.teams.length ? preview.teams.map(team => <Text key={team.id} color="textSecondary">{team.name} · Coach ID {team.coach_id}</Text>) : <Text color="textSecondary">No active team memberships</Text>}
          <Text color="textSecondary">{preview.session_count} training sessions will be part of this profile.</Text>
          <Notice>{preview.sharing_notice}</Notice>
          {preview.claim_blocked ? <Notice error>{preview.claim_block_reason}</Notice> : <Button label={accepted ? "Accept and connect profile" : "I understand; continue"} loading={action.busy} onPress={() => accepted ? accept() : setAccepted(true)} />}
        </Panel>
      )}
      {complete && <Panel title="Profile connected"><Notice>Your profile is connected. Your managed training history and active team memberships are preserved.</Notice><Button label="Go to training" onPress={() => router.replace("/")} /></Panel>}
    </StudioScreen>
  );
}
