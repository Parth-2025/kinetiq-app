import { useEffect, useState } from "react";
import { useLocalSearchParams, router, type Href } from "expo-router";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/context/auth-context";
import { dateLabel, numberLabel, useStudio, useStudioAction } from "./data";
import type {
  Assignment,
  Athlete,
  Device,
  Practice,
  RosterEntry,
  Skill,
  Team,
} from "./types";
import {
  ActionError,
  Badge,
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
import { PracticeCapture } from "./practice-capture";

export function AssignmentsPage() {
  const q = useStudio<Assignment[]>("/assignments");
  const { role } = useAuth();
  return (
    <StudioScreen
      title="Give the work a direction."
      eyebrow="Assignments"
      action={
        role === "coach" ? (
          <Button
            label="Create assignment"
            onPress={() => go("/assignment/new")}
          />
        ) : undefined
      }
    >
      <QueryState query={q} />
      {q.value && (
        <Panel title="Training plan">
          {q.value.length ? (
            q.value.map((a) => (
              <Row
                key={a.id}
                title={a.title}
                detail={`Due ${dateLabel(a.due_at)}`}
                meta={a.published ? "Published" : "Draft"}
                onPress={() => go(`/assignment/${a.id}`)}
              />
            ))
          ) : (
            <Empty
              title="A clear next step"
              detail="Assignments from your coach will appear here. Coaches can create a draft and publish it when ready."
            />
          )}
        </Panel>
      )}
    </StudioScreen>
  );
}

export function AssignmentPage() {
  const { id, team } = useLocalSearchParams<{ id: string; team?: string }>();
  const creating = id === "new";
  const q = useStudio<Assignment>(creating ? null : `/assignments/${id}`);
  const teams = useStudio<Team[]>(creating ? "/teams" : null);
  const athletes = useStudio<Athlete[]>(creating ? "/athletes" : null);
  const skills = useStudio<Skill[]>("/skills");
  const action = useStudioAction();
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [recipient, setRecipient] = useState(team ? `team:${team}` : "");
  const [skill, setSkill] = useState("basketball.free-throw");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const assignment = q.value;
  const completion = useStudio<{
    completed: boolean;
    completed_at: string | null;
  }>(
    assignment &&
      !assignment.can_manage &&
      assignment.published &&
      skills.value?.some((s) => s.id === assignment.skill_id && !s.can_analyze)
      ? `/assignments/${id}/completion`
      : null,
  );
  const completions = useStudio<
    Array<{
      athlete_id: string;
      athlete_name: string;
      completed: boolean;
      completed_at: string | null;
    }>
  >(
    assignment?.can_manage &&
      assignment.published &&
      skills.value?.some((s) => s.id === assignment.skill_id && !s.can_analyze)
      ? `/assignments/${id}/completions`
      : null,
  );
  const definition = skills.value?.find(
    (s) => s.id === (assignment?.skill_id ?? skill),
  );
  async function save(published: boolean) {
    setError(null);
    const dueDate = due.trim() ? new Date(`${due.trim()}T23:59:00`) : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      setError("Enter a due date as YYYY-MM-DD or leave it empty.");
      return;
    }
    const [kind, target] = recipient.split(":");
    const saved = await action.run<Assignment>("/assignments", "POST", {
      title,
      instructions,
      skill_id: skill,
      team_id: kind === "team" ? target : null,
      athlete_id: kind === "athlete" ? target : null,
      due_at: dueDate?.toISOString() ?? null,
      published,
    });
    if (saved) router.replace(`/assignment/${saved.id}` as Href);
  }
  return (
    <StudioScreen
      title={
        creating
          ? "Plan a purposeful session."
          : (assignment?.title ?? "Assignment")
      }
      eyebrow="Training assignment"
      back
    >
      <QueryState query={q} />
      {creating ? (
        <Columns
          main={
            <Panel title="Training brief">
              <Input
                label="Assignment title"
                value={title}
                onChangeText={setTitle}
                placeholder="A balanced free throw routine"
              />
              <Input
                label="Instructions"
                value={instructions}
                onChangeText={setInstructions}
                multiline
                placeholder="Explain the drill, repetitions, rest, and what to focus on."
              />
              <Input
                label="Due date (optional, YYYY-MM-DD)"
                value={due}
                onChangeText={setDue}
              />
              <Text variant="body1Strong">Skill</Text>
              <QueryState query={skills} />
              <Choices
                value={skill}
                onChange={setSkill}
                options={(skills.value ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
              />
              <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
                <Button
                  label="Save draft"
                  appearance="outline"
                  disabled={!title.trim() || !recipient || action.busy}
                  onPress={() => save(false)}
                />
                <Button
                  label="Publish assignment"
                  disabled={!title.trim() || !recipient || action.busy}
                  onPress={() => save(true)}
                />
              </View>
            </Panel>
          }
          aside={
            <Panel title="Who is this for?">
              <QueryState query={teams} />
              <QueryState query={athletes} />
              <Choices
                value={recipient}
                onChange={setRecipient}
                options={[
                  ...(teams.value ?? []).map((t) => ({
                    value: `team:${t.id}`,
                    label: t.name,
                  })),
                  ...(athletes.value ?? [])
                    .filter((a) => !a.account_id)
                    .map((a) => ({ value: `athlete:${a.id}`, label: a.name })),
                ]}
              />
              <Text color="textSecondary">
                Use team assignments for athletes with accounts. Direct
                assignments support coach-managed profiles.
              </Text>
              <Text color="textSecondary">
                Planned skills support written drills; only available analysis
                modules accept recordings.
              </Text>
            </Panel>
          }
        />
      ) : (
        assignment && (
          <Columns
            main={
              <>
                <Panel title="The assignment">
                  <Badge label={assignment.published ? "Published" : "Draft"} />
                  <Text>
                    {assignment.instructions || "No additional instructions."}
                  </Text>
                  <Row
                    title={definition?.name ?? assignment.skill_id}
                    detail={`Due ${dateLabel(assignment.due_at)}`}
                  />
                  {assignment.can_manage ? (
                    <Button
                      label={
                        assignment.published
                          ? "Unpublish assignment"
                          : "Publish assignment"
                      }
                      appearance="outline"
                      disabled={action.busy}
                      onPress={() =>
                        action.run(`/assignments/${id}`, "PATCH", {
                          title: assignment.title,
                          instructions: assignment.instructions,
                          skill_id: assignment.skill_id,
                          team_id: assignment.team_id,
                          athlete_id: assignment.athlete_id,
                          due_at: assignment.due_at,
                          published: !assignment.published,
                        })
                      }
                    />
                  ) : definition?.can_analyze && assignment.published ? (
                    <>
                      <Notice>
                        Submitting a recording shares that session with this
                        team’s coach.
                      </Notice>
                      <Button
                        label="Record submission"
                        onPress={() =>
                          go(
                            `/capture?assignment=${id}&skill=${encodeURIComponent(assignment.skill_id)}`,
                          )
                        }
                      />
                    </>
                  ) : assignment.published ? (
                    <>
                      <Notice>
                        Mark this written training assignment complete when you
                        have worked through it. You can reopen it later.
                      </Notice>
                      <QueryState query={completion} />
                      <Button
                        label={
                          completion.value?.completed
                            ? "Reopen assignment"
                            : "Mark complete"
                        }
                        appearance={
                          completion.value?.completed ? "outline" : undefined
                        }
                        disabled={action.busy || !completion.value}
                        onPress={() =>
                          action.run(`/assignments/${id}/completion`, "PUT", {
                            completed: !completion.value?.completed,
                          })
                        }
                      />
                      {completion.value?.completed_at && (
                        <Text color="textSecondary">
                          Completed {dateLabel(completion.value.completed_at)}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Notice>
                      This skill currently supports written training guidance.
                      Automated analysis is not available yet.
                    </Notice>
                  )}
                </Panel>
                <Panel title="Accessible submissions">
                  {assignment.can_manage &&
                    assignment.published &&
                    definition &&
                    !definition.can_analyze && (
                      <Panel title="Written work completion">
                        <QueryState query={completions} />
                        {completions.value?.length ? (
                          completions.value.map((entry) => (
                            <Row
                              key={entry.athlete_id}
                              title={entry.athlete_name}
                              detail={
                                entry.completed_at
                                  ? `Completed ${dateLabel(entry.completed_at)}`
                                  : "Not marked complete"
                              }
                              meta={entry.completed ? "Complete" : "Open"}
                            />
                          ))
                        ) : (
                          <Text color="textSecondary">
                            Completion appears here for account holders who are
                            current members of this team.
                          </Text>
                        )}
                      </Panel>
                    )}
                  {assignment.can_manage &&
                    assignment.published &&
                    definition?.can_analyze && (
                      <Button
                        label="Record an athlete submission"
                        appearance="outline"
                        onPress={() =>
                          go(
                            `/capture?assignment=${id}&skill=${encodeURIComponent(assignment.skill_id)}${assignment.athlete_id ? `&athlete=${assignment.athlete_id}` : ""}`,
                          )
                        }
                      />
                    )}
                  {assignment.sessions?.length ? (
                    <SessionRows sessions={assignment.sessions} />
                  ) : (
                    <Text color="textSecondary">
                      No shared submissions for this assignment yet.
                    </Text>
                  )}
                </Panel>
              </>
            }
            aside={
              <Panel title="A useful review">
                <Text color="textSecondary">
                  Keep the capture setup consistent. Review sample coverage
                  alongside measurements, and use feedback to set the next
                  focus.
                </Text>
              </Panel>
            }
          />
        )
      )}
      <ActionError message={error ?? action.error} />
    </StudioScreen>
  );
}

export function PracticesPage() {
  const q = useStudio<Practice[]>("/practices");
  return (
    <StudioScreen
      title="Make practice easier to review."
      eyebrow="Practice notebook"
      subtitle="Set a roster, record events, and keep the team’s practice history organized."
      action={
        <Button label="Create practice" onPress={() => go("/practice/new")} />
      }
    >
      <QueryState query={q} />
      {q.value && (
        <Panel title="Practices">
          {q.value.length ? (
            q.value.map((p) => (
              <Row
                key={p.id}
                title={p.title}
                detail={dateLabel(p.scheduled_at)}
                meta="Manual log"
                onPress={() => go(`/practice/${p.id}`)}
              />
            ))
          ) : (
            <Empty
              title="Start a practice notebook"
              detail="Automatic multi-camera tracking is still in development. You can organize rosters and log observed events now."
            />
          )}
        </Panel>
      )}
    </StudioScreen>
  );
}

export function PracticePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const creating = id === "new";
  const q = useStudio<Practice>(creating ? null : `/practices/${id}`);
  const teams = useStudio<Team[]>(creating ? "/teams" : null);
  const [teamId, setTeamId] = useState("");
  const team = useStudio<Team>(teamId ? `/teams/${teamId}` : null);
  const athletes = useStudio<Athlete[]>("/athletes");
  const action = useStudioAction();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [player, setPlayer] = useState("");
  const [kind, setKind] = useState("shot");
  const [outcome, setOutcome] = useState("unknown");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const p = q.value;
  useEffect(() => {
    if (p) {
      setTitle(p.title);
      setNotes(p.notes);
      setTeamId(p.team_id);
      setRoster(p.roster);
    }
  }, [p?.id]);
  const athleteName = (id: string) =>
    athletes.value?.find((a) => a.id === id)?.name ?? "Athlete";
  async function event() {
    const seconds = Number(time);
    setError(null);
    if (!time.trim() || !Number.isFinite(seconds) || seconds < 0) {
      setError("Enter the event time in seconds from practice start.");
      return;
    }
    if (
      await action.run(`/practices/${id}/events`, "POST", {
        athlete_id: player || null,
        kind,
        outcome: kind === "shot" ? outcome : "unknown",
        timestamp_seconds: seconds,
        note,
      })
    ) {
      setNote("");
      setTime("");
    }
  }
  return (
    <StudioScreen
      title={
        creating ? "Set the stage for practice." : (p?.title ?? "Practice")
      }
      eyebrow="Practice notebook"
      back
    >
      <QueryState query={q} />
      {creating ? (
        <Columns
          main={
            <Panel title="Practice setup">
              <Input
                label="Practice title"
                value={title}
                onChangeText={setTitle}
                placeholder="Tuesday scrimmage"
              />
              <Text variant="body1Strong">Team</Text>
              <QueryState query={teams} />
              <Choices
                value={teamId}
                onChange={(v) => {
                  setTeamId(v);
                  setRoster([]);
                }}
                options={(teams.value ?? []).map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
              />
              {teams.value?.length === 0 && (
                <Button label="Create a team" onPress={() => go("/team/new")} />
              )}
              <Input
                label="Practice notes"
                value={notes}
                onChangeText={setNotes}
                multiline
              />
              <QueryState query={team} />
              {team.value?.members?.map((a) => {
                const entry = roster.find((r) => r.athlete_id === a.id);
                return (
                  <View key={a.id} style={{ gap: 10 }}>
                    <Row
                      title={a.name}
                      meta={entry ? "Selected" : "Add to roster"}
                      onPress={() =>
                        setRoster((rs) =>
                          entry
                            ? rs.filter((r) => r.athlete_id !== a.id)
                            : [
                                ...rs,
                                { athlete_id: a.id, jersey: "", side: "home" },
                              ],
                        )
                      }
                    />
                    {entry && (
                      <>
                        <Input
                          label={`${a.name} jersey number`}
                          value={entry.jersey}
                          onChangeText={(jersey) =>
                            setRoster((rs) =>
                              rs.map((r) =>
                                r.athlete_id === a.id ? { ...r, jersey } : r,
                              ),
                            )
                          }
                        />
                        <Choices
                          value={entry.side}
                          onChange={(side) =>
                            setRoster((rs) =>
                              rs.map((r) =>
                                r.athlete_id === a.id
                                  ? { ...r, side: side as "home" | "away" }
                                  : r,
                              ),
                            )
                          }
                          options={[
                            { value: "home", label: "Home" },
                            { value: "away", label: "Away" },
                          ]}
                        />
                      </>
                    )}
                  </View>
                );
              })}
              <Button
                label="Create practice"
                disabled={!title.trim() || !teamId}
                loading={action.busy}
                onPress={async () => {
                  const saved = await action.run<Practice>(
                    "/practices",
                    "POST",
                    { title, notes, team_id: teamId, roster },
                  );
                  if (saved) router.replace(`/practice/${saved.id}` as Href);
                }}
              />
            </Panel>
          }
          aside={
            <Panel title="Current capture mode">
              <Badge label="Coach-entered events" />
              <Text color="textSecondary">
                The roster records jersey numbers for reference. Automatic
                identity tracking, camera synchronization, and wearable data are
                not connected yet.
              </Text>
            </Panel>
          }
        />
      ) : (
        p && (
          <Columns
            main={
              <>
                <Panel title="Practice details">
                  <Input
                    label="Practice title"
                    value={title}
                    onChangeText={setTitle}
                  />
                  <Input
                    label="Practice notes"
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                  />
                  <QueryState query={team} />
                  {team.value?.members?.map((a) => {
                    const entry = roster.find((r) => r.athlete_id === a.id);
                    return (
                      <View key={a.id} style={{ gap: 10 }}>
                        <Row
                          title={a.name}
                          meta={entry ? "On roster" : "Add to roster"}
                          detail={
                            entry &&
                            p.events?.some((e) => e.athlete_id === a.id)
                              ? "Keep on roster because events reference this athlete."
                              : undefined
                          }
                          onPress={() => {
                            if (
                              entry &&
                              p.events?.some((e) => e.athlete_id === a.id)
                            ) {
                              setError(
                                "This athlete has logged events. Keep them on the practice roster so the history remains clear.",
                              );
                              return;
                            }
                            setError(null);
                            setRoster((rs) =>
                              entry
                                ? rs.filter((r) => r.athlete_id !== a.id)
                                : [
                                    ...rs,
                                    {
                                      athlete_id: a.id,
                                      jersey: "",
                                      side: "home",
                                    },
                                  ],
                            );
                          }}
                        />
                        {entry && (
                          <>
                            <Input
                              label={`${a.name} jersey number`}
                              value={entry.jersey}
                              onChangeText={(jersey) =>
                                setRoster((rs) =>
                                  rs.map((r) =>
                                    r.athlete_id === a.id
                                      ? { ...r, jersey }
                                      : r,
                                  ),
                                )
                              }
                            />
                            <Choices
                              value={entry.side}
                              onChange={(side) =>
                                setRoster((rs) =>
                                  rs.map((r) =>
                                    r.athlete_id === a.id
                                      ? { ...r, side: side as "home" | "away" }
                                      : r,
                                  ),
                                )
                              }
                              options={[
                                { value: "home", label: "Home" },
                                { value: "away", label: "Away" },
                              ]}
                            />
                          </>
                        )}
                      </View>
                    );
                  })}
                  <View
                    style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}
                  >
                    <Button
                      label="Save practice"
                      disabled={!title.trim() || action.busy}
                      loading={action.busy}
                      onPress={() =>
                        action.run(`/practices/${id}`, "PATCH", {
                          title,
                          notes,
                          team_id: p.team_id,
                          roster,
                        })
                      }
                    />
                    <Choices
                      value={p.status}
                      onChange={(status) =>
                        action.run(`/practices/${id}/status`, "PATCH", {
                          status,
                        })
                      }
                      options={[
                        { value: "draft", label: "Draft" },
                        { value: "live", label: "In progress" },
                        { value: "completed", label: "Completed" },
                      ]}
                    />
                  </View>
                </Panel>
                <Panel title="Practice report">
                  <Notice>{p.report?.provenance}</Notice>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 24 }}
                  >
                    <View>
                      <Text variant="display">
                        {p.report?.recorded_shots ?? 0}
                      </Text>
                      <Text color="textSecondary">Recorded shots</Text>
                    </View>
                    <View>
                      <Text variant="display">
                        {numberLabel(p.report?.make_percentage, "%")}
                      </Text>
                      <Text color="textSecondary">Makes / known outcomes</Text>
                    </View>
                  </View>
                  <Text color="textSecondary">
                    {p.report?.known_outcomes ?? 0} shots have a known result.
                    Unrecorded events are not included.
                  </Text>
                </Panel>
                <PracticeCapture practiceId={id} />
                <Panel title="Event timeline">
                  {p.events?.length ? (
                    p.events.map((e) => (
                      <View key={e.id}>
                        <Row
                          title={`${e.data.timestamp_seconds}s · ${e.data.kind} · ${e.data.outcome}`}
                          detail={`${e.athlete_id ? athleteName(e.athlete_id) : "Team"}${e.data.note ? " · " + e.data.note : ""}`}
                        />
                        <Button
                          label="Remove event"
                          appearance="subtle"
                          disabled={action.busy}
                          onPress={() =>
                            action.run(
                              `/practices/${id}/events/${e.id}`,
                              "DELETE",
                            )
                          }
                        />
                      </View>
                    ))
                  ) : (
                    <Empty
                      title="Log what you observed"
                      detail="Add an event with its time, athlete, and outcome. Reports use only the events you enter."
                    />
                  )}
                </Panel>
              </>
            }
            aside={
              <Panel title="Add observed event">
                <Text variant="body1Strong">Athlete</Text>
                <Choices
                  value={player}
                  onChange={setPlayer}
                  options={[
                    { value: "", label: "Team" },
                    ...p.roster.map((r) => ({
                      value: r.athlete_id,
                      label: `${r.jersey ? "#" + r.jersey + " " : ""}${athleteName(r.athlete_id)}`,
                    })),
                  ]}
                />
                <Text variant="body1Strong">Event</Text>
                <Choices
                  value={kind}
                  onChange={setKind}
                  options={["shot", "pass", "turnover", "rebound", "note"].map(
                    (v) => ({ value: v, label: v }),
                  )}
                />
                {kind === "shot" && (
                  <Choices
                    value={outcome}
                    onChange={setOutcome}
                    options={["made", "missed", "unknown"].map((v) => ({
                      value: v,
                      label: v,
                    }))}
                  />
                )}
                <Input
                  label="Seconds from practice start"
                  value={time}
                  onChangeText={setTime}
                  keyboardType="decimal-pad"
                />
                <Input
                  label="Observation"
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
                <Button
                  label="Add event"
                  loading={action.busy}
                  onPress={event}
                />
              </Panel>
            }
          />
        )
      )}
      <ActionError message={error ?? action.error} />
    </StudioScreen>
  );
}

export function DevicesPage() {
  const q = useStudio<Device[]>("/devices");
  const action = useStudioAction();
  const [name, setName] = useState("");
  const [serial, setSerial] = useState("");
  const [kind, setKind] = useState("camera");
  return (
    <StudioScreen
      title="Organize your capture kit."
      eyebrow="Equipment inventory"
      subtitle="Keep a record of equipment you own. Device registration does not establish a live connection."
    >
      <Notice>
        Camera synchronization, UWB positioning, and IMU streaming require
        hardware integration and field validation. This inventory does not
        collect sensor measurements.
      </Notice>
      <QueryState query={q} />
      <Columns
        main={
          <Panel title="Registered equipment">
            {q.value?.length ? (
              q.value.map((d) => (
                <Row
                  key={d.id}
                  title={d.name}
                  detail={`${d.kind.replaceAll("_", " ")} · ${d.serial}`}
                  meta={d.connection_status}
                />
              ))
            ) : (
              <Empty
                title="Your kit, in one place"
                detail="Add cameras or development devices to the inventory as you build your capture setup."
              />
            )}
          </Panel>
        }
        aside={
          <Panel title="Register equipment">
            <Input label="Device name" value={name} onChangeText={setName} />
            <Input
              label="Serial number or inventory ID"
              value={serial}
              onChangeText={setSerial}
            />
            <Choices
              value={kind}
              onChange={setKind}
              options={["camera", "uwb_tag", "anchor", "imu", "hub"].map(
                (k) => ({ value: k, label: k.replaceAll("_", " ") }),
              )}
            />
            <ActionError message={action.error} />
            <Button
              label="Add to inventory"
              disabled={!name.trim() || !serial.trim()}
              loading={action.busy}
              onPress={async () => {
                if (
                  await action.run("/devices", "POST", { name, serial, kind })
                ) {
                  setName("");
                  setSerial("");
                }
              }}
            />
          </Panel>
        }
      />
    </StudioScreen>
  );
}
