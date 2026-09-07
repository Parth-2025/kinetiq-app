import { EmptyState } from "@/components/ui/EmptyState";
import { Screen } from "@/components/ui/Screen";

export default function AddFriendsScreen() {
  return (
    <Screen>
      <EmptyState icon="person" title="Add friends" body="Coming in a future update." />
    </Screen>
  );
}
