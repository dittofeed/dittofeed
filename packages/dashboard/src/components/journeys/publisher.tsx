import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  useTheme,
} from "@mui/material";
import {
  CompletionStatus,
  EphemeralRequestStatus,
} from "isomorphic-lib/src/types";
import { getWarningStyles } from "../../lib/warningTheme";
import { useEffect, useState } from "react";

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
  title: string;
}

function PublisherInner({
  showProgress,
  onPublish,
  onRevert,
  disablePublish,
  disableRevert,
  invisible,
  title,
}: {
  invisible?: boolean;
  onPublish: () => void;
  onRevert: () => void;
  showProgress: boolean;
  disableRevert: boolean;
  disablePublish: boolean;
  title: string;
}) {
  const [publishConfirmationOpen, setPublishConfirmationOpen] = useState(false);
  const theme = useTheme();
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        transition: "visibility 0.4s, opacity 0.4s linear",
        visibility: invisible ? "hidden" : undefined,
        opacity: invisible ? 0 : undefined,
      }}
    >
      <Box
        sx={{
          ...getWarningStyles(theme),
          p: 1,
        }}
      >
        Unpublished Changes.
      </Box>
      <Button
        onClick={() => {
          setPublishConfirmationOpen(true);
        }}
        disabled={disablePublish}
      >
        Publish
      </Button>
      <Button onClick={onRevert} disabled={disableRevert}>
        Revert
      </Button>
      {showProgress && <CircularProgress size="1rem" />}
      <Dialog
        open={publishConfirmationOpen}
        onClose={() => setPublishConfirmationOpen(false)}
      >
        <DialogTitle>Publish {title}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to publish {title}?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPublishConfirmationOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onPublish();
              setPublishConfirmationOpen(false);
            }}
            color="primary"
            autoFocus
          >
            Confirm Publish
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export function Publisher({ status, title }: PublisherProps) {
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (
      status.type === PublisherStatusType.OutOfDate &&
      status.updateRequest.type === CompletionStatus.InProgress &&
      !showProgress
    ) {
      setShowProgress(true);
    } else if (showProgress) {
      timeoutId = setTimeout(() => {
        setShowProgress(false);
      }, 500);
    }
    return () => clearTimeout(timeoutId); // Cleanup timeout
  }, [status, showProgress]);

  if (showProgress) {
    return (
      <PublisherInner
        showProgress={showProgress}
        onPublish={() => {}}
        onRevert={() => {}}
        title={title}
        disablePublish
        disableRevert
      />
    );
  }

  if (
    status.type === PublisherStatusType.Unpublished ||
    status.type === PublisherStatusType.UpToDate
  ) {
    return (
      <PublisherInner
        title={title}
        showProgress={showProgress}
        onPublish={() => {}}
        onRevert={() => {}}
        invisible
        disablePublish
        disableRevert
      />
    );
  }

  const operationInProgress =
    status.updateRequest.type === CompletionStatus.InProgress;

  return (
    <PublisherInner
      title={title}
      showProgress={showProgress}
      onPublish={status.onPublish}
      onRevert={status.onRevert}
      disablePublish={operationInProgress || Boolean(status.disabled)}
      disableRevert={operationInProgress}
    />
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
      label={status.isDraft ? "Draft View" : "Published View"}
    />
  );
}
