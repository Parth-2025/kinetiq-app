import { EmptyState } from "@/components/ui/EmptyState";
import { Screen } from "@/components/ui/Screen";

export default function MessageThreadScreen() {
  return (
    <Screen>
      <EmptyState icon="person" title="Conversation" body="Coming in a future update." />
    </Screen>
  );
}
