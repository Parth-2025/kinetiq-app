import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, router, type Href } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Platform, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { authorizationHeaders } from "@/config/api";
import { requireRuntimeConfig } from "@/config/runtime";
import { useAuth } from "@/context/auth-context";
import { invalidate } from "@/hooks/use-api";
import { ballEvidenceFromAnalysis, dateLabel, numberLabel, useStudio, useStudioAction } from "./data";
import type { Athlete, TrainingSession } from "./types";
import {
  ActionError,
  Badge,
  Choices,
  Columns,
  go,
  Input,
  Notice,
  Panel,
  QueryState,
  Row,
  StudioScreen,
} from "./ui";
import { SessionRigReplay } from "./session-rig-replay";
import { ShotCandidates } from "./shot-candidates";
import { SessionShots } from "./session-shots";
import { SessionMotionQuery } from "./session-motion-query";
import { BallEvidence } from "./ball-evidence";

export function CapturePage() {
  const params = useLocalSearchParams<{
    skill?: string;
    athlete?: string;
    assignment?: string;
    session?: string;
  }>();
  const { role } = useAuth();
  const athletes = useStudio<Athlete[]>(role === "coach" ? "/athletes" : null);
  const me = useStudio<Athlete>(role === "athlete" ? "/athletes/me" : null);
  const [athlete, setAthlete] = useState(params.athlete ?? "");
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "creating" | "uploading" | "retry">("idle");
  const submitLock = useRef(false);
  const sessionIdRef = useRef(params.session ?? "");
  const uploadController = useRef<AbortController | null>(null);
  const [consent, setConsent] = useState(false);
  const action = useStudioAction();
  const retrySession = useStudio<TrainingSession>(
    params.session ? `/sessions/${params.session}` : null,
  );
  const retryAthlete = useStudio<Athlete>(
    retrySession.value ? `/athletes/${retrySession.value.athlete_id}` : null,
  );
  const subject = params.session
    ? retryAthlete.value
    : role === "coach"
      ? athletes.value?.find((a) => a.id === athlete)
      : me.value;
  async function choose() {
    try {
      if (Platform.OS === "ios") {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted)
          throw new Error(
            "Allow video library access in Settings to choose a recording.",
          );
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
      });
      if (!result.canceled) {
        setAsset(result.assets[0]);
        setError(null);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The video library could not open.",
      );
    }
  }
  async function record() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted)
        throw new Error("Allow camera access in Settings to record a session.");
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["videos"],
        videoMaxDuration: 60,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
        allowsEditing: false,
      });
      if (!result.canceled) {
        setAsset(result.assets[0]);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The camera could not open.");
    }
  }
  async function submit() {
    if (submitLock.current || !asset || !subject || !consent) return;
    submitLock.current = true;
    const existingSessionId = sessionIdRef.current;
    setError(null);
    setUploading(true);
    setUploadState(existingSessionId ? "retry" : "creating");
    try {
      if (asset.duration && asset.duration > 60500)
        throw new Error("Choose a clip of 60 seconds or less.");
      if (asset.fileSize && asset.fileSize > 150 * 1024 * 1024)
        throw new Error("Choose a clip smaller than 150 MB.");
      let id = existingSessionId;
      if (!id) {
        const created = await action.run<TrainingSession>("/sessions", "POST", {
          athlete_id: subject.id,
          skill_id: params.skill ?? "basketball.free-throw",
          assignment_id: params.assignment ?? null,
        });
        if (!created) return;
        id = created.id;
        sessionIdRef.current = id;
      }
      const body = new FormData();
      const part =
        asset.file ??
        ({
          uri: asset.uri,
          name: asset.fileName ?? "recording.mp4",
          type: asset.mimeType ?? "video/mp4",
        } as unknown as Blob);
      body.append("video", part);
      const base = requireRuntimeConfig(
        "kinetiqApiUrl",
        "Configure the KinetiQ backend URL.",
      );
      if (existingSessionId) {
        const statusResponse = await fetch(`${base}/studio/sessions/${id}`, {
          headers: authorizationHeaders(),
        });
        if (!statusResponse.ok) {
          throw new Error("Could not check this session before retrying. Check your connection and try again.");
        }
        const status = await statusResponse.json();
        if (!["awaiting_upload", "failed"].includes(status.status)) {
          invalidate("studio:");
          router.replace(`/session/${id}` as Href);
          return;
        }
      }
      const controller = new AbortController();
      uploadController.current = controller;
      setUploadState("uploading");
      const response = await fetch(`${base}/studio/sessions/${id}/video`, {
        method: "POST",
        headers: authorizationHeaders(),
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : "Upload failed. Please try again.",
        );
      }
      invalidate("studio:");
      setUploadState("idle");
      router.replace(`/session/${id}` as Href);
    } catch (e) {
      setError(
        e instanceof Error && e.name === "AbortError"
          ? "Upload stopped on this device. The server may have received the complete recording; check the session before retrying."
          : e instanceof Error
            ? e.message
            : "Upload failed.",
      );
      setUploadState("retry");
    } finally {
      uploadController.current = null;
      submitLock.current = false;
      setUploading(false);
    }
  }
  function cancelUpload() {
    uploadController.current?.abort();
  }
  return (
    <StudioScreen
      title="Capture your free throw."
      eyebrow="New session"
      back
      subtitle="One athlete, a stable camera, and a clear full-body view. Start with a short clip."
    >
      <Columns
        main={
          <Panel title="Your recording">
            {role === "coach" && !params.session && (
              <>
                <QueryState query={athletes} />
                <Text variant="body1Strong">Choose athlete</Text>
                <Choices
                  value={athlete}
                  onChange={(v) => {
                    if (submitLock.current) return;
                    setAthlete(v);
                    sessionIdRef.current = "";
                  }}
                  options={(athletes.value ?? []).map((a) => ({
                    value: a.id,
                    label: a.name,
                  }))}
                />
                {!athletes.value?.length && (
                  <Button
                    label="Add an athlete"
                    appearance="outline"
                    onPress={() => go("/athlete/new")}
                  />
                )}
              </>
            )}
            {role === "athlete" && !params.session && <QueryState query={me} />}
            {params.session && (
              <>
                <QueryState query={retrySession} />
                <QueryState query={retryAthlete} />
              </>
            )}
            {subject && (
              <Row
                title={subject.name}
                detail={`Shooting side: ${subject.dominant_side}`}
                onPress={() => go(`/athlete/${subject.id}`)}
              />
            )}
            {subject && !["left", "right"].includes(subject.dominant_side) && (
              <Notice>
                Set your shooting side to left or right in your athlete profile
                first.
              </Notice>
            )}
            <Button
              label={asset ? "Choose a different video" : "Choose video"}
              icon="arrow-upload"
              appearance="outline"
              disabled={uploading}
              onPress={choose}
            />
            {Platform.OS !== "web" && (
              <Button
                label="Record with camera"
                icon="camera"
                appearance="outline"
                disabled={uploading}
                onPress={record}
              />
            )}
            {asset && (
              <Row
                title={asset.fileName ?? "Selected recording"}
                detail={`${asset.duration ? (asset.duration / 1000).toFixed(1) + " seconds" : "Duration checked during analysis"} · ${asset.fileSize ? (asset.fileSize / 1024 / 1024).toFixed(1) + " MB" : "Up to 150 MB"}`}
              />
            )}
            <Notice>
              The recording is temporarily uploaded for processing, then deleted
              after analysis. Numerical body movement is retained. Queued files
              expire after 24 hours while the worker is running.{" "}
              {params.assignment
                ? "Submitting this team assignment shares the session with its coach."
                : "Personal sessions are private until you choose to share them."}
            </Notice>
            <Choices
              value={consent ? "yes" : "no"}
              onChange={(v) => setConsent(v === "yes")}
              options={[
                { value: "no", label: "Review consent" },
                {
                  value: "yes",
                  label: "I have permission to upload this athlete",
                },
              ]}
            />
            <ActionError message={error ?? action.error} />
            {uploading && (
              <Notice>
                {uploadState === "creating"
                  ? "Preparing your session…"
                  : "Uploading your recording. Keep this screen open until it finishes."}
              </Notice>
            )}
            {uploadState === "retry" && (
              <Notice>
                Your selected video and session are kept on this screen. Try
                again with the same session. If the server finished receiving
                the clip, open Sessions to check its status before retrying.
              </Notice>
            )}
            <Button
              label={uploading ? (uploadState === "creating" ? "Preparing session…" : "Uploading recording…") : uploadState === "retry" ? "Retry upload" : "Upload & analyze"}
              loading={uploading}
              disabled={
                !asset ||
                !subject ||
                !["left", "right"].includes(subject.dominant_side) ||
                !consent
              }
              onPress={submit}
            />
            {uploading && uploadState === "uploading" && (
              <Button label="Stop upload" appearance="outline" onPress={cancelUpload} />
            )}
          </Panel>
        }
        aside={
          <>
            <Panel title="A useful recording">
              <Text>1. Keep head, hands, hips, and feet inside the frame.</Text>
              <Text>2. Use bright, even lighting and a stable camera.</Text>
              <Text>3. Keep other players out of the recording.</Text>
              <Text>4. Capture the full movement, up to 60 seconds.</Text>
            </Panel>
            <Panel title="What you’ll receive">
              <Badge label="Experimental" />
              <Text>
                Body-only movement replay, elbow and knee flexion, and sample
                coverage.
              </Text>
              <Text color="textSecondary">
                Ball tracking, shot outcomes, automated coaching scores, and a
                fully skinned mannequin are not available yet.
              </Text>
            </Panel>
          </>
        }
      />
    </StudioScreen>
  );
}

export function SessionPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { role } = useAuth();
  const q = useStudio<TrainingSession>(`/sessions/${id}`);
  const action = useStudioAction();
  const [note, setNote] = useState("");
  const [editingFeedback, setEditingFeedback] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const s = q.value;
  useEffect(() => {
    if (!s || !["queued", "processing"].includes(s.status)) return;
    const timer = setInterval(q.refetch, 4000);
    return () => clearInterval(timer);
  }, [s?.status, q.refetch]);
  async function feedback(published: boolean) {
    if (
      await action.run(
        editingFeedback
          ? `/feedback/${editingFeedback}`
          : `/sessions/${id}/feedback`,
        editingFeedback ? "PATCH" : "POST",
        {
          body: note,
          published,
        },
      )
    ) {
      setNote("");
      setEditingFeedback(null);
    }
  }
  return (
    <StudioScreen
      title={s?.skill_name ?? "Session"}
      eyebrow={
        s ? `${s.athlete_name} · ${dateLabel(s.created_at)}` : "Movement review"
      }
      back
    >
      <QueryState query={q} />
      {s && (
        <>
          <Badge label={s.status} />
          <Columns
            main={
              <>
                {s.status === "ready" && s.analysis?.frames && (
                  <>
                    <Panel title="Movement replay">
                      <SessionRigReplay sessionId={s.id} canManage={!!s.can_manage} frames={s.analysis.frames} />
                    </Panel>
                    <ShotCandidates summary={s.analysis.shot_candidates} />
                    <SessionShots key={s.id} sessionId={s.id} canManage={!!s.can_manage} frames={s.analysis.frames} />
                    <BallEvidence ball={ballEvidenceFromAnalysis(s.analysis)} />
                    {role === "coach" && s.analysis.frames.length > 0 && (
                      <SessionMotionQuery sessionId={s.id} />
                    )}
                  </>
                )}
                {["queued", "processing"].includes(s.status) && (
                  <Panel
                    title={
                      s.status === "queued"
                        ? "Waiting for analysis"
                        : "Building your movement replay"
                    }
                  >
                    <Text color="textSecondary">
                      You can leave this page and return later. Your session
                      will update when processing finishes.
                    </Text>
                    <Button
                      label="Refresh status"
                      appearance="outline"
                      onPress={q.refetch}
                    />
                  </Panel>
                )}
                {s.status === "failed" && (
                  <Panel title="This recording needs another try">
                    <Notice error>
                      {s.error ?? "Analysis could not finish."}
                    </Notice>
                    <Button
                      label="Choose another recording"
                      onPress={() =>
                        go(`/capture?session=${id}&athlete=${s.athlete_id}`)
                      }
                    />
                  </Panel>
                )}
                {s.status === "awaiting_upload" && (
                  <Panel title="Ready for your recording">
                    <Button
                      label="Upload video"
                      onPress={() =>
                        go(`/capture?session=${id}&athlete=${s.athlete_id}`)
                      }
                    />
                  </Panel>
                )}
                <Panel title="Coach feedback">
                  {s.feedback?.map((f) => (
                    <Row
                      key={f.id}
                      title={f.body}
                      detail={dateLabel(f.created_at)}
                      meta={f.published ? "Published" : "Draft"}
                      onPress={
                        f.can_edit
                          ? () => {
                              setEditingFeedback(f.id);
                              setNote(f.body);
                            }
                          : undefined
                      }
                    />
                  ))}
                  {!s.feedback?.length && (
                    <Text color="textSecondary">No feedback yet.</Text>
                  )}
                  {role === "coach" && (
                    <>
                      {editingFeedback && (
                        <Button
                          label="Cancel editing feedback"
                          appearance="subtle"
                          onPress={() => {
                            setEditingFeedback(null);
                            setNote("");
                          }}
                        />
                      )}
                      <Input
                        label={
                          editingFeedback ? "Edit feedback" : "Your feedback"
                        }
                        value={note}
                        onChangeText={setNote}
                        multiline
                        placeholder="Describe what you observed and one useful next step."
                      />
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <Button
                          label="Save draft"
                          appearance="outline"
                          disabled={!note.trim() || action.busy}
                          onPress={() => feedback(false)}
                        />
                        <Button
                          label="Publish feedback"
                          disabled={!note.trim() || action.busy}
                          onPress={() => feedback(true)}
                        />
                      </View>
                    </>
                  )}
                </Panel>
              </>
            }
            aside={
              <>
                <Panel title="Available measurements">
                  {Object.entries(s.summary).map(([key, m]) => (
                    <View key={key} style={{ gap: 8 }}>
                      <Text variant="body1Strong">
                        {key.replaceAll("_", " ")}
                      </Text>
                      <Text variant="title2">
                        {numberLabel(m.minimum, "°")} –{" "}
                        {numberLabel(m.maximum, "°")}
                      </Text>
                      <Text variant="caption1" color="textSecondary">
                        {m.valid_samples} of {m.total_samples} samples usable ·{" "}
                        {m.status}
                      </Text>
                    </View>
                  ))}
                  {!Object.keys(s.summary).length && (
                    <Text color="textSecondary">
                      Measurements appear after processing.
                    </Text>
                  )}
                  <Text variant="caption1" color="textSecondary">
                    Flexion: 0° is full extension. Missing measurements are
                    unavailable, never substituted with zero.
                  </Text>
                </Panel>
                {s.analysis?.quality_counts && (
                  <Panel title="Capture coverage">
                    {Object.entries(s.analysis.quality_counts).map(
                      ([reason, count]) => (
                        <Row
                          key={reason}
                          title={reason.replaceAll("_", " ")}
                          meta={`${count} frames`}
                        />
                      ),
                    )}
                    <Text variant="caption1" color="textSecondary">
                      Visibility checks are heuristic. Passing them does not
                      establish measurement accuracy.
                    </Text>
                  </Panel>
                )}
                {s.analysis?.limitations && (
                  <Panel title="How to read this">
                    {s.analysis.limitations.map((l, i) => (
                      <Text key={i} color="textSecondary">
                        {l}
                      </Text>
                    ))}
                  </Panel>
                )}
                {s.can_manage && (
                  <Panel title="Sharing">
                    <Text color="textSecondary">
                      Choose which team coaches can review this session.
                    </Text>
                    {s.shareable_teams?.map((team) => (
                      <Row
                        key={team.id}
                        title={team.name}
                        meta={
                          s.shared_team_ids?.includes(team.id)
                            ? "Shared"
                            : "Private"
                        }
                        onPress={() => {
                          const ids = s.shared_team_ids ?? [];
                          void action.run(`/sessions/${id}/sharing`, "PUT", {
                            team_ids: ids.includes(team.id)
                              ? ids.filter((x) => x !== team.id)
                              : [...ids, team.id],
                          });
                        }}
                      />
                    ))}
                    <Button
                      label="Make private"
                      appearance="outline"
                      disabled={action.busy || !s.shared_team_ids?.length}
                      onPress={() =>
                        action.run(`/sessions/${id}/sharing`, "PUT", {
                          team_ids: [],
                        })
                      }
                    />
                    <Button
                      label="Delete session"
                      appearance="subtle"
                      onPress={() => setConfirmDelete(true)}
                    />
                    {confirmDelete && (
                      <>
                        <Notice>
                          Delete this session, its stored movement, and
                          feedback? This cannot be undone.
                        </Notice>
                        <Button
                          label="Delete permanently"
                          disabled={action.busy}
                          onPress={async () => {
                            if (await action.run(`/sessions/${id}`, "DELETE"))
                              router.replace(
                                (role === "coach"
                                  ? "/coach/sessions"
                                  : "/sessions") as Href,
                              );
                          }}
                        />
                        <Button
                          label="Keep session"
                          appearance="outline"
                          onPress={() => setConfirmDelete(false)}
                        />
                      </>
                    )}
                  </Panel>
                )}
              </>
            }
          />
          <ActionError message={action.error} />
        </>
      )}
    </StudioScreen>
  );
}
