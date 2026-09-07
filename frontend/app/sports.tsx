import { router } from "expo-router";
import { useState } from "react";
import { Modal, View } from "react-native";

import { AppBar } from "@/components/ui/AppBar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { ListItem } from "@/components/ui/ListItem";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { invalidate, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useTheme } from "@/theme";

const SPORTS = [
  { name: "Basketball", key: "basketball" },
  { name: "Soccer", key: "soccer" },
  { name: "Tennis", key: "tennis" },
  { name: "Baseball", key: "baseball" },
  { name: "Football", key: "football" },
  { name: "Volleyball", key: "volleyball" },
  { name: "Swimming", key: "swimming" },
];

type SportsState = { active: string | null; selected: string[] };

export default function SportsScreen() {
  const t = useTheme();
  const { value: sportsState } = useApiQuery<SportsState>("sports", "/me/sports");
  const activeSport = sportsState?.active ?? null;
  const selected = new Set(sportsState?.selected ?? []);

  const addSport = useApiMutation<SportsState>("/me/sports/selected", "POST");
  const setActive = useApiMutation<SportsState>("/me/sports/active", "PUT");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleBasketballPress() {
    setErrorMsg(null);
    if (selected.has("basketball")) {
      try {
        await setActive.mutate({ sport: "basketball" });
        invalidate("sports");
      } catch {
        setErrorMsg("Could not update your sport. Check your connection and try again.");
      }
    } else {
      setConfirmOpen(true);
    }
  }

  async function handleAdd() {
    setErrorMsg(null);
    try {
      await addSport.mutate({ sport: "basketball" });
      invalidate("sports");
    } catch {
      setErrorMsg("Could not add the sport. Check your connection and try again.");
    } finally {
      setConfirmOpen(false);
    }
  }

  return (
    <Screen scroll appBar={<AppBar title="Sport" onBack={() => router.back()} />}>
      <View style={{ gap: t.space.m }}>
        {errorMsg ? <InlineAlert tone="danger" message={errorMsg} onDismiss={() => setErrorMsg(null)} /> : null}
        <Text variant="body1" color="textSecondary">
          Basketball is live. More sports are on the way.
        </Text>

        {SPORTS.map((s, i) => {
          const isBasketball = s.key === "basketball";
          const isActive = activeSport === s.key;
          return (
            <ListItem
              key={s.key}
              leading="basketball"
              title={s.name}
              divider={i < SPORTS.length - 1}
              onPress={isBasketball ? handleBasketballPress : undefined}
              trailing={
                isBasketball ? (
                  isActive ? (
                    <Chip label="Active" tone="accent" />
                  ) : (
                    <Chip label={selected.has("basketball") ? "Set active" : "Add"} />
                  )
                ) : (
                  <Text variant="caption1" color="textSecondary">
                    Coming soon
                  </Text>
                )
              }
            />
          );
        })}
      </View>

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: t.color.overlay,
            justifyContent: "flex-end",
            padding: t.space.l,
          }}
        >
          <View
            style={{
              backgroundColor: t.color.layer,
              borderRadius: t.radius.xl,
              padding: t.space.l,
              gap: t.space.m,
              ...(t.mode === "light" ? t.elevation.shadow16 : { borderWidth: 1, borderColor: t.color.stroke }),
            }}
          >
            <Text variant="subtitle1">Add Basketball?</Text>
            <Text variant="body1" color="textSecondary">
              Start tracking your basketball shots and stats.
            </Text>
            <View style={{ flexDirection: "row", gap: t.space.s, justifyContent: "flex-end" }}>
              <Button label="Cancel" appearance="outline" onPress={() => setConfirmOpen(false)} />
              <Button label="Add sport" onPress={handleAdd} />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
