import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/theme";
import { dateLabel, numberLabel, useStudio } from "./data";
import type { Overview, Skill, TrainingSession } from "./types";
import {
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

export function SessionRows({ sessions }: { sessions: TrainingSession[] }) {
  return sessions.length ? (
    <>
      {sessions.map((s) => (
        <Row
          key={s.id}
          title={s.skill_name}
          detail={`${s.athlete_name} · ${dateLabel(s.created_at)}`}
          meta={s.status}
          onPress={() => go(`/session/${s.id}`)}
        />
      ))}
    </>
  ) : (
    <Empty
      title="Your next session starts here"
      detail="Record a short skill session. Your movement replay and available measurements will appear here."
      action={<Button label="Start a session" onPress={() => go("/capture")} />}
    />
  );
}

export function HomePage() {
  const { role } = useAuth();
  const q = useStudio<Overview>("/overview");
  const d = q.value;
  const t = useTheme();
  const coach = role === "coach";
  return (
    <StudioScreen
      eyebrow={coach ? "Coach workspace" : "Your training"}
      title={
        coach ? "A clearer view of your team." : "Make every session count."
      }
      subtitle={
        coach
          ? "Plan the work, review movement, and give each athlete a clear next step."
          : "Choose a skill. Capture your movement. Build a record you can learn from."
      }
      action={
        <Button
          label={coach ? "Create assignment" : "Start a session"}
          icon={coach ? "basketball" : "camera"}
          onPress={() => go(coach ? "/assignment/new" : "/capture")}
        />
      }
    >
      <QueryState query={q} />
      {d && (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
            {(coach
              ? [
                  ["Athletes", d.athletes.length],
                  ["Teams", d.teams.length],
                  ["Practices", d.practices.length],
                ]
              : [
                  ["Recent sessions", d.sessions.length],
                  [
                    "Ready to review",
                    d.sessions.filter((s) => s.status === "ready").length,
                  ],
                  ["Assignments", d.assignments.length],
                ]
            ).map(([label, value]) => (
              <View
                key={label}
                style={{
                  flex: 1,
                  minWidth: 130,
                  padding: 22,
                  borderRadius: 0,
                  backgroundColor: t.color.layer,
                  borderWidth: 1,
                  borderColor: t.color.stroke,
                }}
              >
                <Text variant="display">{value}</Text>
                <Text color="textSecondary">{label}</Text>
              </View>
            ))}
          </View>
          <Columns
            main={
              <>
                <Panel
                  title={
                    coach ? "Recent athlete sessions" : "Your recent sessions"
                  }
                  action={
                    <Button
                      label="View all"
                      appearance="subtle"
                      onPress={() =>
                        go(coach ? "/coach/sessions" : "/sessions")
                      }
                    />
                  }
                >
                  <SessionRows sessions={d.sessions.slice(0, 4)} />
                </Panel>
                <Panel title={coach ? "Practice notebook" : "Coach feedback"}>
                  {coach ? (
                    d.practices.length ? (
                      d.practices
                        .slice(0, 3)
                        .map((p) => (
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
                        title="Plan your first practice"
                        detail="Choose a team, set the roster, and keep a record of events."
                        action={
                          <Button
                            label="Create practice"
                            appearance="outline"
                            onPress={() => go("/practice/new")}
                          />
                        }
                      />
                    )
                  ) : d.feedback.length ? (
                    d.feedback
                      .slice(0, 3)
                      .map((f) => (
                        <Row
                          key={f.id}
                          title={f.body}
                          detail={dateLabel(f.created_at)}
                          onPress={() => go(`/session/${f.session_id}`)}
                        />
                      ))
                  ) : (
                    <Text color="textSecondary">
                      Feedback from shared sessions will appear here. You can
                      also train independently.
                    </Text>
                  )}
                </Panel>
                <Panel title="Longitudinal review">
                  <Text color="textSecondary">Compare coverage and numerical ranges across compatible sessions.</Text>
                  <Button label="Open comparison" appearance="outline" onPress={() => go("/compare")} />
                </Panel>
              </>
            }
            aside={
              <>
                <Panel
                  title="Up next"
                  action={
                    <Button
                      label="View all"
                      appearance="subtle"
                      onPress={() => go("/assignments")}
                    />
                  }
                >
                  {d.assignments.length ? (
                    d.assignments
                      .slice(0, 4)
                      .map((a) => (
                        <Row
                          key={a.id}
                          title={a.title}
                          detail={`Due ${dateLabel(a.due_at)}`}
                          meta={a.published ? "Published" : "Draft"}
                          onPress={() => go(`/assignment/${a.id}`)}
                        />
                      ))
                  ) : (
                    <Text color="textSecondary">
                      No assignments yet. Start with a free throw session or
                      explore the skill library.
                    </Text>
                  )}
                </Panel>
                <Panel title={coach ? "Your workspace" : "Build your baseline"}>
                  {coach ? (
                    <>
                      <Row
                        title="Teams & invitations"
                        onPress={() => go("/teams")}
                      />
                      <Row
                        title="Athlete roster"
                        onPress={() => go("/coach/athletes")}
                      />
                      <Row
                        title="Equipment inventory"
                        onPress={() => go("/devices")}
                      />
                    </>
                  ) : (
                    <>
                      <Text color="textSecondary">
                        Add your shooting side and optional body measurements
                        before your first session.
                      </Text>
                      <Button
                        label="Edit athlete profile"
                        appearance="outline"
                        onPress={() => go("/athlete/me")}
                      />
                    </>
                  )}
                </Panel>
              </>
            }
          />
        </>
      )}
    </StudioScreen>
  );
}

export function SkillsPage() {
  const q = useStudio<Skill[]>("/skills");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const list = q.value?.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" || s.can_analyze),
  );
  return (
    <StudioScreen
      title="Find your focus."
      eyebrow="Skill library"
      subtitle="One sport, deeper work. Each skill has its own capture guidance and measurement requirements."
    >
      <Input
        label="Search basketball skills"
        value={search}
        onChangeText={setSearch}
        placeholder="Free throw, footwork, defense…"
      />
      <Choices
        options={[
          { value: "all", label: "All skills" },
          { value: "available", label: "Analysis available" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <QueryState query={q} />
      {list && (
        <Panel title="Basketball">
          {list.length ? (
            list.map((s) => (
              <Row
                key={s.id}
                title={s.name}
                detail={`${s.family} · ${s.description}`}
                meta={s.can_analyze ? "Experimental" : "Planned"}
                onPress={() => go(`/skill/${s.id}`)}
              />
            ))
          ) : (
            <Empty
              title="No matching skills"
              detail="Try a different search or show all skills."
            />
          )}
        </Panel>
      )}
    </StudioScreen>
  );
}

export function SkillPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useStudio<Skill[]>("/skills");
  const skill = q.value?.find((s) => s.id === id);
  return (
    <StudioScreen
      title={skill?.name ?? "Skill details"}
      eyebrow="Basketball"
      back
    >
      <QueryState query={q} />
      {skill ? (
        <Columns
          main={
            <Panel title="The focus">
              <Text>{skill.description}</Text>
              <Badge label={skill.status} />
              <Text color="textSecondary">{skill.limitations}</Text>
              {skill.can_analyze ? (
                <Button
                  label="Capture this skill"
                  onPress={() =>
                    go(`/capture?skill=${encodeURIComponent(skill.id)}`)
                  }
                />
              ) : (
                <Notice>
                  Automated analysis for this skill is in development. Coaches
                  can include it in written training assignments.
                </Notice>
              )}
            </Panel>
          }
          aside={
            <Panel title="Before you record">
              {skill.requirements.map((r, i) => (
                <Text key={i}>• {r.replaceAll("_", " ")}</Text>
              ))}
              <Text color="textSecondary">
                Keep one athlete visible from head to feet, use steady lighting,
                and place the camera on a stable support.
              </Text>
            </Panel>
          }
        />
      ) : (
        q.value && (
          <Empty
            title="Skill unavailable"
            detail="Return to the skill library to choose another skill."
          />
        )
      )}
    </StudioScreen>
  );
}

export function SessionsPage() {
  const q = useStudio<TrainingSession[]>("/sessions");
  const [filter, setFilter] = useState("all");
  const { role } = useAuth();
  return (
    <StudioScreen
      title={
        role === "coach" ? "Movement worth reviewing." : "Your session library."
      }
      eyebrow={role === "coach" ? "Reviews" : "Sessions"}
      subtitle="Recordings become private numerical movement replays. Open a session to inspect coverage, measurements, and feedback."
      action={<Button label="New session" onPress={() => go("/capture")} />}
    >
      <Choices
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "ready", label: "Ready" },
          { value: "queued", label: "Processing" },
          { value: "failed", label: "Needs attention" },
        ]}
      />
      <QueryState query={q} />
      {q.value && (
        <Panel>
          <SessionRows
            sessions={q.value.filter(
              (s) =>
                filter === "all" ||
                s.status === filter ||
                (filter === "queued" && s.status === "processing"),
            )}
          />
        </Panel>
      )}
    </StudioScreen>
  );
}

export function ProgressPage() {
  const q = useStudio<TrainingSession[]>("/sessions");
  const ready = q.value?.filter((s) => s.status === "ready");
  return (
    <StudioScreen
      title="See the work over time."
      eyebrow="Progress"
      subtitle="An honest record of captured movement. Compare similar recordings and review measurement coverage before drawing conclusions."
    >
      <QueryState query={q} />
      <Notice>
        Technique, consistency, and performance scores will appear only after
        the corresponding measurements have been validated. Clip angle ranges
        are not consistency scores.
      </Notice>
      {ready && (
        <Panel title="Session measurements">
          {ready.length ? (
            ready.map((s) => (
              <Row
                key={s.id}
                title={`${s.skill_name} · ${dateLabel(s.created_at)}`}
                detail={`Elbow flexion: ${numberLabel(s.summary.elbow_flexion?.minimum, "°")} to ${numberLabel(s.summary.elbow_flexion?.maximum, "°")} · ${s.summary.elbow_flexion?.valid_samples ?? 0} usable samples`}
                onPress={() => go(`/session/${s.id}`)}
              />
            ))
          ) : (
            <Empty
              title="Start with one session"
              detail="Your recorded measurements will build a timeline here."
              action={
                <Button label="Start training" onPress={() => go("/capture")} />
              }
            />
          )}
        </Panel>
      )}
    </StudioScreen>
  );
}
