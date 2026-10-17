import { useEffect, useState } from "react";
import { useLocalSearchParams, router, type Href } from "expo-router";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/context/auth-context";
import { dateLabel, numberLabel, useStudio, useStudioAction } from "./data";
import type { Athlete, Team } from "./types";
import {
  ActionError,
  Choices,
  Columns,
  Empty,
  go,
  Input,
  Notice,
  Panel,
  QueryState,
  Row,
  StudioScreen,
} from "./ui";
import { SessionRows } from "./dashboard";

export function AthletesPage() {
  const q = useStudio<Athlete[]>("/athletes");
  const [search, setSearch] = useState("");
  return (
    <StudioScreen
      eyebrow="Roster"
      title="Know every athlete."
      subtitle="Keep profiles, measurements, and shared training history together."
      action={<Button label="Add athlete" onPress={() => go("/athlete/new")} />}
    >
      <Input label="Find an athlete" value={search} onChangeText={setSearch} />
      <QueryState query={q} />
      {q.value && (
        <Panel title="Your athletes">
          {q.value
            .filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
            .map((a) => (
              <Row
                key={a.id}
                title={a.name}
                detail={`${a.sport} · ${a.dominant_side} side`}
                meta={a.account_id ? "Connected account" : "Coach managed"}
                onPress={() => go(`/athlete/${a.id}`)}
              />
            ))}
          {!q.value.length && (
            <Empty
              title="Build your roster"
              detail="Add a coach-managed profile, or create a team and invite athletes who already have an account."
              action={
                <Button
                  label="Create a team"
                  appearance="outline"
                  onPress={() => go("/team/new")}
                />
              }
            />
          )}
        </Panel>
      )}
    </StudioScreen>
  );
}

export function AthletePage() {
  const { id, team } = useLocalSearchParams<{ id: string; team?: string }>();
  const creating = id === "new";
  const { role } = useAuth();
  const q = useStudio<Athlete>(creating ? null : `/athletes/${id}`);
  const me = useStudio<Athlete>(role === "athlete" ? "/athletes/me" : null);
  const action = useStudioAction();
  const [name, setName] = useState("");
  const [side, setSide] = useState("unknown");
  const [height, setHeight] = useState("");
  const [wingspan, setWingspan] = useState("");
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [claimCode, setClaimCode] = useState<string | null>(null);
  const [claimCodeRevoked, setClaimCodeRevoked] = useState(false);
  useEffect(() => {
    if (q.value) {
      setName(q.value.name);
      setSide(q.value.dominant_side);
      setHeight(q.value.measurements?.values.height_cm?.toString() ?? "");
      setWingspan(q.value.measurements?.values.wingspan_cm?.toString() ?? "");
    }
  }, [q.value?.id]);
  const editable =
    creating ||
    !q.value?.account_id ||
    q.value.id === me.value?.id ||
    id === "me";
  async function save() {
    setSaved(false);
    setLocalError(null);
    const h = height.trim() ? Number(height) : null,
      w = wingspan.trim() ? Number(wingspan) : null;
    if (
      (h !== null && (!Number.isFinite(h) || h < 50 || h > 260)) ||
      (w !== null && (!Number.isFinite(w) || w < 50 || w > 300))
    ) {
      setLocalError(
        "Use centimeters: height 50–260, wingspan 50–300, or leave the field empty.",
      );
      return;
    }
    const a = await action.run<Athlete>(
      creating ? "/athletes" : `/athletes/${q.value?.id}`,
      creating ? "POST" : "PATCH",
      {
        name,
        sport: "basketball",
        dominant_side: side,
        ...(creating && team ? { team_id: team } : {}),
      },
    );
    if (!a) return;
    const m = await action.run(`/athletes/${a.id}/measurements`, "POST", {
      height_cm: h,
      wingspan_cm: w,
      provenance: role === "coach" ? "coach_measured" : "self_reported",
    });
    if (m) {
      setSaved(true);
      if (creating) router.replace(`/athlete/${a.id}` as Href);
    }
  }
  return (
    <StudioScreen
      eyebrow="Athlete profile"
      title={
        creating ? "Make room for a new athlete." : (q.value?.name ?? "Athlete")
      }
      back
      action={
        !creating && q.value ? (
          <View style={{ gap: 8 }}>
            {!q.value.account_id && role === "coach" && (
              <View style={{ gap: 8 }}>
                <Button label="Create claim code" appearance="outline" onPress={async () => {
                  const result = await action.run<{ code: string }>(`/athletes/${q.value!.id}/claim-code`, "POST");
                  if (result) { setClaimCode(result.code); setClaimCodeRevoked(false); }
                }} />
                {claimCode && <Button label="Revoke code" appearance="subtle" onPress={async () => {
                  const result = await action.run<{ revoked: number }>(`/athletes/${q.value!.id}/claim-code`, "DELETE");
                  if (result) { setClaimCode(null); setClaimCodeRevoked(true); }
                }} />}
              </View>
            )}
            <Button label="Record session" onPress={() => go(`/capture?athlete=${q.value!.id}`)} />
          </View>
        ) : undefined
      }
    >
      <QueryState query={q} />
      {(creating || q.value) && (
        <Columns
          main={
            <>
              <Panel title="Profile">
                {claimCode && <Notice>Share this one-time code: {claimCode}. It expires in 20 minutes. The athlete will review profile details, team access, and training history before accepting.</Notice>}
                {claimCodeRevoked && <Notice>The claim code was revoked.</Notice>}
                {editable ? (
                  <>
                    <Input
                      label="Athlete name"
                      value={name}
                      onChangeText={setName}
                    />
                    <Text variant="body1Strong">Shooting side</Text>
                    <Choices
                      value={side}
                      onChange={setSide}
                      options={[
                        { value: "left", label: "Left" },
                        { value: "right", label: "Right" },
                        { value: "both", label: "Both" },
                        { value: "unknown", label: "Not set" },
                      ]}
                    />
                    <Text color="textSecondary">
                      For the first free throw model, choose the shooting arm
                      used in the recording.
                    </Text>
                    <Input
                      label="Height in centimeters (optional)"
                      value={height}
                      onChangeText={setHeight}
                      keyboardType="decimal-pad"
                    />
                    <Input
                      label="Wingspan in centimeters (optional)"
                      value={wingspan}
                      onChangeText={setWingspan}
                      keyboardType="decimal-pad"
                    />
                    <ActionError message={localError ?? action.error} />
                    {saved && <Notice>Profile and measurements saved.</Notice>}
                    <Button
                      label="Save athlete"
                      loading={action.busy}
                      disabled={!name.trim()}
                      onPress={save}
                    />
                  </>
                ) : (
                  <>
                    <Text>This athlete manages their own profile.</Text>
                    <Row
                      title="Shooting side"
                      detail={q.value?.dominant_side}
                    />
                    <Row
                      title="Height"
                      detail={numberLabel(
                        q.value?.measurements?.values.height_cm,
                        " cm",
                      )}
                    />
                    <Row
                      title="Wingspan"
                      detail={numberLabel(
                        q.value?.measurements?.values.wingspan_cm,
                        " cm",
                      )}
                    />
                  </>
                )}
              </Panel>
              {q.value?.sessions && (
                <Panel title="Accessible sessions">
                  <SessionRows sessions={q.value.sessions} />
                </Panel>
              )}
            </>
          }
          aside={
            <>
              <Panel title="Measurements with context">
                <Text color="textSecondary">
                  Measure wingspan fingertip to fingertip with both arms
                  extended. Leave unknown measurements empty.
                </Text>
                <Text color="textSecondary">
                  Measurements are saved as dated snapshots. They provide
                  context; they do not calibrate camera depth or make pose
                  estimates exact.
                </Text>
              </Panel>
              {q.value?.measurement_history && (
                <Panel title="Measurement history">
                  {q.value.measurement_history.map((m) => (
                    <Row
                      key={m.id}
                      title={dateLabel(m.created_at)}
                      detail={`Height ${numberLabel(m.values.height_cm, " cm")} · Wingspan ${numberLabel(m.values.wingspan_cm, " cm")}`}
                      meta={m.values.provenance}
                    />
                  ))}
                </Panel>
              )}
            </>
          }
        />
      )}
    </StudioScreen>
  );
}

export function TeamsPage() {
  const { role } = useAuth();
  const q = useStudio<Team[]>("/teams");
  const coach = role === "coach";
  return (
    <StudioScreen
      eyebrow={coach ? "Team management" : "Your teams"}
      title={
        coach
          ? "Bring your team together."
          : "Train independently. Grow together."
      }
      subtitle={
        coach
          ? "Create teams, invite athletes, and organize their training."
          : "Joining a team is optional. You decide which personal sessions your coach can review."
      }
      action={
        <Button
          label={coach ? "Create team" : "Join a team"}
          onPress={() => go(coach ? "/team/new" : "/team/join")}
        />
      }
    >
      <QueryState query={q} />
      {q.value && (
        <Panel title="Teams">
          {q.value.length ? (
            q.value.map((t) => (
              <Row
                key={t.id}
                title={t.name}
                detail={t.description || t.sport}
                onPress={() => go(`/team/${t.id}`)}
              />
            ))
          ) : (
            <Empty
              title={
                coach
                  ? "Your first team starts here"
                  : "Your training belongs to you"
              }
              detail={
                coach
                  ? "Create a team, then share an invitation code with your athletes."
                  : "You can use all available individual training features without joining a team."
              }
            />
          )}
        </Panel>
      )}
    </StudioScreen>
  );
}

type Invitation = { id: string; code: string; expires_at: string };
type InvitePreview = {
  name: string;
  coach_name: string;
  sharing: string;
  team_id: string;
};
export function JoinTeamPage() {
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const action = useStudioAction();
  return (
    <StudioScreen title="Join your team." eyebrow="Invitation" back>
      <Panel title="Enter your invitation code">
        <Input
          label="Invitation code"
          value={code}
          onChangeText={(v) => {
            setCode(v);
            setPreview(null);
          }}
        />
        <ActionError message={action.error} />
        {!preview ? (
          <Button
            label="Find team"
            disabled={code.trim().length < 8}
            loading={action.busy}
            onPress={async () =>
              setPreview(
                await action.run<InvitePreview>(
                  "/invitations/preview",
                  "POST",
                  { code: code.trim() },
                ),
              )
            }
          />
        ) : (
          <>
            <Text variant="title2">{preview.name}</Text>
            <Text>Coach: {preview.coach_name}</Text>
            <Notice>{preview.sharing}</Notice>
            <Button
              label="Accept invitation & join"
              loading={action.busy}
              onPress={async () => {
                const team = await action.run<Team>(
                  "/invitations/accept",
                  "POST",
                  { code: code.trim() },
                );
                if (team) router.replace(`/team/${team.id}` as Href);
              }}
            />
          </>
        )}
      </Panel>
    </StudioScreen>
  );
}

export function TeamPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const creating = id === "new";
  const q = useStudio<Team>(creating ? null : `/teams/${id}`);
  const { role } = useAuth();
  const me = useStudio<Athlete>(role === "athlete" ? "/athletes/me" : null);
  const action = useStudioAction();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [leave, setLeave] = useState(false);
  const team = q.value;
  return (
    <StudioScreen
      title={creating ? "A team with a clear purpose." : (team?.name ?? "Team")}
      eyebrow="Team workspace"
      back
    >
      <QueryState query={q} />
      {creating ? (
        <Panel title="Create team">
          <Input
            label="Team name"
            value={name}
            onChangeText={setName}
            placeholder="Varsity basketball"
          />
          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <Button
            label="Create team"
            loading={action.busy}
            disabled={!name.trim()}
            onPress={async () => {
              const t = await action.run<Team>("/teams", "POST", {
                name,
                description,
                sport: "basketball",
              });
              if (t) router.replace(`/team/${t.id}` as Href);
            }}
          />
        </Panel>
      ) : (
        team && (
          <Columns
            main={
              <>
                <Panel
                  title="Roster"
                  action={
                    team.can_manage ? (
                      <Button
                        label="Add athlete"
                        appearance="outline"
                        onPress={() => go(`/athlete/new?team=${team.id}`)}
                      />
                    ) : undefined
                  }
                >
                  {team.members?.length ? (
                    team.members.map((a) => (
                      <View key={a.id}>
                        <Row
                          title={a.name}
                          onPress={
                            team.can_manage
                              ? () => go(`/athlete/${a.id}`)
                              : undefined
                          }
                        />
                        {team.can_manage && (
                          <Button
                            label={`Remove ${a.name} from team`}
                            appearance="subtle"
                            disabled={action.busy}
                            onPress={() =>
                              action.run(
                                `/teams/${id}/members/${a.id}`,
                                "DELETE",
                              )
                            }
                          />
                        )}
                      </View>
                    ))
                  ) : (
                    <Empty
                      title="An open roster"
                      detail="Invite athletes with accounts or add a coach-managed athlete profile."
                    />
                  )}
                </Panel>
                <Panel title="Training assignments">
                  {team.assignments?.map((a) => (
                    <Row
                      key={a.id}
                      title={a.title}
                      meta={a.published ? "Published" : "Draft"}
                      onPress={() => go(`/assignment/${a.id}`)}
                    />
                  ))}
                  {team.can_manage && (
                    <Button
                      label="Create assignment"
                      appearance="outline"
                      onPress={() => go(`/assignment/new?team=${id}`)}
                    />
                  )}
                </Panel>
              </>
            }
            aside={
              <>
                <Panel title="About this team">
                  <Text>
                    {team.description ||
                      "Basketball training and shared progress."}
                  </Text>
                  <Text color="textSecondary">
                    Personal sessions are shared individually. Joining does not
                    give a coach automatic access to your session library.
                  </Text>
                </Panel>
                {team.can_manage ? (
                  <Panel title="Invite an athlete">
                    <Text color="textSecondary">
                      Share a code with an athlete. They preview the team and
                      choose whether to join.
                    </Text>
                    <Button
                      label="Generate invitation code"
                      disabled={action.busy}
                      onPress={async () =>
                        setInvite(
                          await action.run<Invitation>(
                            `/teams/${id}/invitations`,
                            "POST",
                          ),
                        )
                      }
                    />
                    {invite && (
                      <>
                        <Input
                          label="Invitation code (copy to share)"
                          value={invite.code}
                          onChangeText={() => {}}
                        />
                        <Text variant="caption1" color="textSecondary">
                          Expires {dateLabel(invite.expires_at)}
                        </Text>
                        <Button
                          label="Revoke this invitation"
                          appearance="outline"
                          onPress={async () => {
                            if (
                              await action.run(
                                `/teams/${id}/invitations/${invite.id}`,
                                "DELETE",
                              )
                            )
                              setInvite(null);
                          }}
                        />
                      </>
                    )}
                  </Panel>
                ) : (
                  <Panel title="Membership">
                    <Button
                      label="Leave team"
                      appearance="outline"
                      onPress={() => setLeave(true)}
                    />
                    {leave && (
                      <>
                        <Notice>
                          Leaving revokes this coach’s access to your shared
                          sessions. Your personal sessions stay in your library.
                        </Notice>
                        <Button
                          label="Confirm leave"
                          disabled={action.busy || !me.value}
                          onPress={async () => {
                            if (
                              me.value &&
                              (await action.run(
                                `/teams/${id}/members/${me.value.id}`,
                                "DELETE",
                              ))
                            )
                              router.replace("/team" as Href);
                          }}
                        />
                        <Button
                          label="Stay on team"
                          appearance="subtle"
                          onPress={() => setLeave(false)}
                        />
                      </>
                    )}
                  </Panel>
                )}
              </>
            }
          />
        )
      )}
      <ActionError message={action.error} />
    </StudioScreen>
  );
}
