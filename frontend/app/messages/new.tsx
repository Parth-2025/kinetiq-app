import { EmptyState } from "@/components/ui/EmptyState";
import { Screen } from "@/components/ui/Screen";

export default function NewMessageScreen() {
  return (
    <Screen>
      <EmptyState icon="person" title="New message" body="Coming in a future update." />
    </Screen>
  );
}
