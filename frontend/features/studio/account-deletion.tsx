import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { ActionError, Input, Panel } from "./ui";
import { dateLabel, useStudio, useStudioAction } from "./data";

type DeletionStatus = {
  id: string | null;
  status: "none" | "pending" | "processing" | "canceled" | "completed";
  requested_at: string | null;
  processed_at: string | null;
};

const CONFIRM_PHRASE = "DELETE MY ACCOUNT";

/** In-app initiation only; actual deletion requires an operator workflow. */
export function AccountDeletion() {
  const status = useStudio<DeletionStatus>("/account/deletion-request");
  const action = useStudioAction();
  const [phrase, setPhrase] = useState("");
  const canRequest = status.value?.status === "none" || status.value?.status === "canceled";

  async function requestDeletion() {
    const result = await action.run<DeletionStatus>("/account/deletion-request", "POST", { confirm_phrase: phrase });
    if (result) {
      setPhrase("");
      status.refetch();
    }
  }

  async function cancelRequest() {
    const result = await action.run<DeletionStatus>("/account/deletion-request", "DELETE");
    if (result) status.refetch();
  }

  return (
    <Panel title="Request account deletion">
      <Text color="textSecondary">
        This submits a request for an operator to remove your local account and Auth0 identity. Your account and data remain in place while the request is pending. Backup retention also needs to be addressed as part of processing. This screen does not mean deletion is complete.
      </Text>
      {status.value?.status === "pending" && (
        <>
          <Text>Request pending · submitted {dateLabel(status.value.requested_at)}.</Text>
          <Button label="Cancel deletion request" appearance="outline" loading={action.busy} disabled={action.busy} onPress={cancelRequest} />
        </>
      )}
      {status.value?.status === "processing" && (
        <Text color="textSecondary">An operator has started processing this request. Contact support if you submitted it by mistake.</Text>
      )}
      {status.value?.status === "canceled" && <Text color="textSecondary">Your previous request was canceled. You can submit a new request below.</Text>}
      {status.value?.status === "completed" && <Text color="textSecondary">The operator marked this request complete.</Text>}
      {canRequest && (
        <>
          <Input label={`Type ${CONFIRM_PHRASE} to confirm`} value={phrase} onChangeText={setPhrase} />
          <Button label="Submit deletion request" loading={action.busy} disabled={action.busy || phrase !== CONFIRM_PHRASE} onPress={requestDeletion} />
        </>
      )}
      <ActionError message={action.error} />
    </Panel>
  );
}
