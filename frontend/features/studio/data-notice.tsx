import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/theme";

export function PrivacyPage() {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }}>
      <ScrollView
        contentContainerStyle={{
          maxWidth: 800,
          width: "100%",
          alignSelf: "center",
          padding: 28,
          gap: 24,
        }}
      >
        <Button
          label="Back"
          appearance="subtle"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/login")
          }
        />
        <Text variant="display">Your data in this prototype.</Text>
        <Text>
          This describes the implemented Studio workflow. Public legal policies
          and account-deletion support still need to be completed before
          release.
        </Text>
        <Text variant="title3">Account and training records</Text>
        <Text>
          Auth0 handles sign-in. KinetiQ stores your profile, role,
          measurements, teams, assignments, numerical motion records, and
          feedback.
        </Text>
        <Text variant="title3">Recordings</Text>
        <Text>
          Studio uploads are temporarily held by the backend for analysis. The
          worker removes the source recording after processing or failure.
          Unprocessed uploads expire after 24 hours while the worker is running.
          The numerical body replay remains until the session owner deletes it.
          Deletion removes that session’s replay, feedback, and sharing
          permissions from the active database.
        </Text>
        <Text variant="title3">Teams and sharing</Text>
        <Text>
          Joining a team makes your athlete profile and measurements visible to
          its coach. Personal sessions stay private unless you share them or
          submit a team assignment. Leaving removes the team’s existing session
          access. Coaches retain records they created themselves, such as their
          practice event logs.
        </Text>
        <Text variant="title3">Measurements and limitations</Text>
        <Text>
          Pose measurements are experimental estimates. Height and wingspan
          provide profile context and do not establish measurement accuracy. The
          current replay is a joint-based body representation, not a validated
          anatomical model.
        </Text>
        <Text variant="title3">Prototype limits</Text>
        <Text>
          Account deletion, data export, backup retention controls, production
          monitoring, and published legal policies remain release requirements.
          The legacy analysis API has a separate workflow; this description
          applies to Studio uploads.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
