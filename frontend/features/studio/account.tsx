import { useState } from "react";
import { Redirect, router, type Href, Slot } from "expo-router";
import { ActivityIndicator } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/context/auth-context";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useTheme } from "@/theme";
import { dateLabel, useStudio, useStudioAction } from "./data";
import type { Account, Skill } from "./types";
import { DataControls } from "./data-controls";
import { AccountDeletion } from "./account-deletion";
import {
  ActionError,
  Choices,
  Columns,
  go,
  Notice,
  Panel,
  QueryState,
  Row,
  StudioScreen,
} from "./ui";

export function WorkspaceLayout({ coach = false }: { coach?: boolean }) {
  const { user, role, isLoading, isRoleLoading } = useAuth();
  const profile = useUserProfile(user?.sub);
  const account = useStudio<Account>("/account");
  if (isLoading || isRoleLoading)
    return (
      <ActivityIndicator
        accessibilityLabel="Loading workspace"
        style={{ flex: 1 }}
      />
    );
  if (!user || !role) return <Redirect href="/login" />;
  if (coach && role !== "coach") return <Redirect href="/(tabs)" />;
  if (!coach && role === "coach") return <Redirect href={"/coach" as Href} />;
  if (profile.error || account.error)
    return (
      <StudioScreen title="Your workspace couldn’t load">
        <Notice error>
          {profile.error?.message ?? account.error?.message}
        </Notice>
        <Button
          label="Try again"
          onPress={() => {
            profile.refetch();
            account.refetch();
          }}
        />
      </StudioScreen>
    );
  if (profile.isLoading || !account.value)
    return (
      <ActivityIndicator
        accessibilityLabel="Loading profile"
        style={{ flex: 1 }}
      />
    );
  if (!profile.hasUsername) return <Redirect href="/onboarding/username" />;
  if (!account.value.onboarding_complete)
    return <Redirect href={"/onboarding/studio" as Href} />;
  return <Slot />;
}

export function SettingsPage() {
  const { role, selectRole, logout } = useAuth();
  const q = useStudio<Account>("/account");
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function changeRole(next: string) {
    if (next === role) return;
    setBusy(true);
    setError(null);
    try {
      await selectRole(next as "athlete" | "coach");
      router.replace((next === "coach" ? "/coach" : "/(tabs)") as Href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not switch workspace.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <StudioScreen title="Make this your studio." eyebrow="Settings" back>
      <QueryState query={q} />
      <Columns
        main={
          <>
            <Panel title="Workspace">
              <Text color="textSecondary">
                Your training profile and coaching records stay attached to the
                same account.
              </Text>
              {busy ? (
                <ActivityIndicator />
              ) : (
                <Choices
                  value={role ?? "athlete"}
                  onChange={changeRole}
                  options={[
                    { value: "athlete", label: "Athlete" },
                    { value: "coach", label: "Coach" },
                  ]}
                />
              )}
              <ActionError message={error} />
            </Panel>
            <Panel title="Appearance">
              <Choices
                value={t.mode}
                onChange={(v) => t.setThemeOverride(v as "light" | "dark")}
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
              <Button
                label="Use device appearance"
                appearance="subtle"
                onPress={() => t.setThemeOverride(null)}
              />
            </Panel>
            <DataControls />
            <AccountDeletion />
            <Panel title="Your account">
              <Row
                title="Athlete profile & measurements"
                onPress={() => go("/athlete/me")}
              />
              <Row title="Data & privacy" onPress={() => go("/privacy")} />
              {q.value?.is_admin && (
                <Row title="Administration" onPress={() => go("/admin")} />
              )}
              <Button
                label="Sign out"
                appearance="outline"
                onPress={() => logout()}
              />
            </Panel>
          </>
        }
        aside={
          <Panel title="Performance Studio">
            <Text>Basketball · experimental prototype</Text>
            <Text color="textSecondary">
              Available measurements are estimates. Review coverage and capture
              conditions with every session.
            </Text>
            {role === "coach" && (
              <>
                <Row title="Teams" onPress={() => go("/teams")} />
                <Row title="Assignments" onPress={() => go("/assignments")} />
                <Row
                  title="Equipment inventory"
                  onPress={() => go("/devices")}
                />
              </>
            )}
          </Panel>
        }
      />
    </StudioScreen>
  );
}

export function StudioOnboardingPage() {
  const { role } = useAuth();
  const action = useStudioAction();
  return (
    <StudioScreen
      title={
        role === "coach"
          ? "Build your coaching workspace."
          : "Start with your athlete profile."
      }
      eyebrow="Welcome to KinetiQ"
    >
      <Panel
        title={
          role === "coach"
            ? "Your team, organized"
            : "A baseline for your training"
        }
      >
        <Text color="textSecondary">
          {role === "coach"
            ? "Create a team and add coach-managed athlete profiles, or invite athletes with existing accounts. Each athlete controls sharing of their personal sessions."
            : "Set your shooting side and add optional height and wingspan measurements. You can train independently or join a team later."}
        </Text>
        <Button
          label={
            role === "coach" ? "Create my first team" : "Set up athlete profile"
          }
          appearance="outline"
          onPress={() => go(role === "coach" ? "/team/new" : "/athlete/me")}
        />
        <ActionError message={action.error} />
        <Button
          label="Open my workspace"
          loading={action.busy}
          onPress={async () => {
            if (
              await action.run("/account", "PATCH", {
                role: role ?? "athlete",
                onboarding_complete: true,
              })
            )
              router.replace((role === "coach" ? "/coach" : "/(tabs)") as Href);
          }}
        />
      </Panel>
    </StudioScreen>
  );
}

type AdminOverview = {
  accounts: number;
  teams: number;
  sessions: number;
  failed_sessions: number;
  audit: {
    id: string;
    action: string;
    created_at: string;
    resource_id: string;
  }[];
  skills: Skill[];
};
export function AdminPage() {
  const q = useStudio<AdminOverview>("/admin/overview");
  const d = q.value;
  return (
    <StudioScreen
      title="Keep the studio accountable."
      eyebrow="Administration"
      back
    >
      <QueryState query={q} />
      {d && (
        <Columns
          main={
            <Panel title="Recent audit events">
              {d.audit.map((a) => (
                <Row
                  key={a.id}
                  title={a.action.replaceAll(".", " · ")}
                  detail={`${dateLabel(a.created_at)} · ${a.resource_id}`}
                />
              ))}
            </Panel>
          }
          aside={
            <>
              <Panel title="Platform counts">
                <Row title="Accounts" meta={String(d.accounts)} />
                <Row title="Teams" meta={String(d.teams)} />
                <Row title="Sessions" meta={String(d.sessions)} />
                <Row title="Failed analysis" meta={String(d.failed_sessions)} />
              </Panel>
              <Panel title="Analysis capabilities">
                {d.skills
                  .filter((s) => s.can_analyze)
                  .map((s) => (
                    <Row key={s.id} title={s.name} meta={s.status} />
                  ))}
                <Text color="textSecondary">
                  Administrator access is provisioned by a server operator. It
                  cannot be enabled from signup.
                </Text>
              </Panel>
            </>
          }
        />
      )}
    </StudioScreen>
  );
}
