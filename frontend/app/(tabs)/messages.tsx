import { EmptyState } from "@/components/ui/EmptyState";
import { Screen } from "@/components/ui/Screen";

export default function MessagesScreen() {
  return (
    <Screen>
      <EmptyState icon="person" title="Messages" body="Coming in a future update." />
    </Screen>
  );
}
