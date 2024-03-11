import { Box, Button, FormControlLabel, Switch } from "@mui/material";
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

export interface PublisherOutOfDateBaseStatus {
  type: PublisherStatusType.OutOfDate;
  updateRequest: EphemeralRequestStatus<Error>;
}

export interface PublisherUpToDateStatus {
  type: PublisherStatusType.UpToDate;
}

export type PublisherOutOfDateStatus = PublisherOutOfDateBaseStatus & {
  onPublish: () => void;
  onRevert: () => void;
  disabled?: boolean;
};

export type PublisherStatus =
  | PublisherUnpublishedStatus
  | PublisherOutOfDateStatus
  | PublisherUpToDateStatus;

export interface PublisherProps {
  status: PublisherStatus;
}

export function Publisher({ status }: PublisherProps) {
  if (status.type === PublisherStatusType.Unpublished) {
    return <Box>Unpublished</Box>;
  }
  if (status.type === PublisherStatusType.UpToDate) {
    return <Box>UpToDate</Box>;
  }
  const operationInProgress =
    status.updateRequest.type === CompletionStatus.InProgress;
  return (
    <>
      <p>OutOfDate</p>
      <Button
        onClick={status.onPublish}
        disabled={operationInProgress || status.disabled}
      >
        publish
      </Button>
      <Button onClick={status.onRevert} disabled={operationInProgress}>
        revert
      </Button>
    </>
  );
}

export type PublisherOutOfDateToggleStatus = PublisherOutOfDateBaseStatus & {
  isDraft: boolean;
  onToggle: ({ isDraft }: { isDraft: boolean }) => void;
};

export type PublisherDraftToggleStatus =
  | PublisherUnpublishedStatus
  | PublisherOutOfDateToggleStatus
  | PublisherUpToDateStatus;

export interface PublisherDraftToggleProps {
  status: PublisherDraftToggleStatus;
}

export function PublisherDraftToggle({ status }: PublisherDraftToggleProps) {
  if (status.type === PublisherStatusType.Unpublished) {
    return null;
  }
  if (status.type === PublisherStatusType.UpToDate) {
    return null;
  }
  return (
    <FormControlLabel
      control={
        <Switch
          checked={status.isDraft}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            status.onToggle({ isDraft: event.target.checked });
          }}
          name="draft"
        />
      }
      label="Draft View"
    />
  );
}
