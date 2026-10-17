import { Redirect, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { ApiError, apiFetch } from "@/config/api";
import { useAuth } from "@/context/auth-context";
import { invalidate } from "@/hooks/use-api";
import { useUserProfile } from "@/hooks/use-user-profile";
import {
  isValidUsername,
  normalizeUsernameInput,
} from "@/services/user-profile";
import { useTheme } from "@/theme";

const FORMAT_HINT =
  "3–20 characters: lowercase letters, numbers, or underscores.";

export default function UsernameOnboardingScreen() {
  const t = useTheme();
  const router = useRouter();
  const { user, role } = useAuth();
  const { profile, isLoading } = useUserProfile(user?.sub);

  const [raw, setRaw] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const username = normalizeUsernameInput(raw);
  const formatValid = isValidUsername(username);

  useEffect(() => {
    setAvailable(null);
    setError(null);
    if (!formatValid) return;

    let cancelled = false;
    setChecking(true);
    const id = setTimeout(async () => {
      try {
        const res = await apiFetch<{ available: boolean }>(
          `/me/username-available?u=${encodeURIComponent(username)}`,
        );
        if (!cancelled) setAvailable(res.available);
      } catch {
        if (!cancelled) setAvailable(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [username, formatValid]);

  if (!user) return <Redirect href="/login" />;
  if (!isLoading && profile?.username)
    return (
      <Redirect href={(role === "coach" ? "/coach" : "/(tabs)") as Href} />
    );

  const fieldState: "default" | "error" | "success" =
    !username || checking
      ? "default"
      : !formatValid || available === false
        ? "error"
        : available
          ? "success"
          : "default";

  const helper = error
    ? undefined
    : !formatValid && username
      ? FORMAT_HINT
      : checking
        ? "Checking availability…"
        : available === false
          ? "That username is taken."
          : available
            ? "That username is available."
            : FORMAT_HINT;

  async function handleContinue() {
    if (!formatValid || available !== true) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/me/profile", { method: "PATCH", body: { username } });
      invalidate("me:");
      router.replace("/onboarding/studio" as Href);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409)
        setError("That username is taken.");
      else if (err instanceof ApiError && err.status === 400)
        setError(err.detail || "That username format is not allowed.");
      else setError("We could not save your username. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: t.space.l }}>
        <View style={{ gap: t.space.s }}>
          <Text variant="title2">Choose a username</Text>
          <Text variant="body1" color="textSecondary">
            This is how other players will see you. You can’t change it later.
          </Text>
        </View>

        <Field
          label="Username"
          prefix="@"
          value={raw}
          onChangeText={setRaw}
          placeholder="player"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          state={fieldState}
          helper={helper}
          error={error ?? undefined}
          onSubmitEditing={handleContinue}
        />

        <Button
          label="Continue"
          fullWidth
          loading={saving}
          disabled={!formatValid || available !== true}
          onPress={handleContinue}
        />
      </View>
    </Screen>
  );
}
