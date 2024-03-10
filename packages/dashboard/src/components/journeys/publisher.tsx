import { Button } from "@mui/material";
import {
  CompletionStatus,
  EphemeralRequestStatus,
} from "isomorphic-lib/src/types";

export enum PublisherStatusType {
  Unpublished = "Unpublished",
  OutOfDate = "OutOfDate",
  UpToDate = "UpToDate",
}

export interface PublisherUnpublishedStatus {
  type: PublisherStatusType.Unpublished;
}

export interface PublisherOutOfDateStatus {
  type: PublisherStatusType.OutOfDate;
  // TODO add confirmation
  onPublish: () => void;
  // TODO add confirmation
  onRevert: () => void;
  updateRequest: EphemeralRequestStatus<Error>;
}

export interface PublisherUpToDateStatus {
  type: PublisherStatusType.UpToDate;
}

export type PublisherStatus =
  | PublisherUnpublishedStatus
  | PublisherOutOfDateStatus
  | PublisherUpToDateStatus;

export interface PublisherProps {
  status: PublisherStatus;
}

export function Publisher({ status }: PublisherProps) {
  if (status.type === PublisherStatusType.Unpublished) {
    return <>Unpublished</>;
  }
  if (status.type === PublisherStatusType.UpToDate) {
    return <>UpToDate</>;
  }
  const operationInProgress =
    status.updateRequest.type === CompletionStatus.InProgress;
  return (
    <>
      <p>OutOfDate</p>
      <Button onClick={status.onPublish} disabled={operationInProgress}>
        publish
      </Button>
      <Button onClick={status.onRevert} disabled={operationInProgress}>
        revert
      </Button>
    </>
  );
}

export type PublisherDraftToggleStatus =
  | PublisherUnpublishedStatus
  | (PublisherOutOfDateStatus & { isDraft: boolean; onToggle: () => void })
  | PublisherUpToDateStatus;

export interface PublisherDraftToggleProps {
  status: PublisherDraftToggleStatus;
}

export function PublisherDraftToggle(props: PublisherDraftToggleProps) {
  return (
    <div>
      <h1>PublisherDraftToggle</h1>
    </div>
  );
}
