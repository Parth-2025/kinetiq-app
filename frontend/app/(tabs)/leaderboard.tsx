import { EmptyState } from "@/components/ui/EmptyState";
import { Screen } from "@/components/ui/Screen";

export default function LeaderboardScreen() {
  return (
    <Screen>
      <EmptyState icon="trophy" title="Leaderboards" body="Coming in a future update." />
    </Screen>
  );
}
