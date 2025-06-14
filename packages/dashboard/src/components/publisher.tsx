import {
  PublishOutlined,
  UndoOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";
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
  IconButton,
  Stack,
  Switch,
  Tooltip,
  useTheme,
} from "@mui/material";
import { useEffect, useState } from "react";

import { getWarningStyles } from "../lib/warningTheme";

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
  isUpdating: boolean;
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
  isMinimised?: boolean;
}

function PublisherInner({
  showProgress,
  onPublish,
  onRevert,
  disablePublish,
  disableRevert,
  invisible,
  title,
  showUnpublishedWarning,
  isMinimised,
}: {
  onPublish: () => void;
  onRevert: () => void;
  invisible?: boolean;
  showProgress: boolean;
  disableRevert: boolean;
  disablePublish: boolean;
  showUnpublishedWarning?: boolean;
  title: string;
  isMinimised?: boolean;
}) {
  const [publishConfirmationOpen, setPublishConfirmationOpen] = useState(false);
  const theme = useTheme();
  return (
    <Stack
      direction={isMinimised ? "column" : "row"}
      alignItems="center"
      spacing={1}
      sx={{
        visibility: !invisible ? "visible" : "hidden",
        opacity: !invisible ? 1 : 0,
        transition: "visibility 0.4s, opacity 0.4s linear",
      }}
    >
      {!isMinimised && (
        <Button
          onClick={() => {
            setPublishConfirmationOpen(true);
          }}
          disabled={disablePublish}
        >
          Publish
        </Button>
      )}
      {isMinimised && (
        <Tooltip title="Publish">
          <IconButton
            onClick={() => {
              setPublishConfirmationOpen(true);
            }}
            disabled={disablePublish}
          >
            <PublishOutlined
              sx={{
                border: `2px solid ${disablePublish ? theme.palette.grey[400] : theme.palette.grey[600]}`,
                borderRadius: "50%",
              }}
            />
          </IconButton>
        </Tooltip>
      )}

      {!isMinimised && (
        <Button onClick={onRevert} disabled={disableRevert}>
          Revert
        </Button>
      )}
      {isMinimised && (
        <Tooltip title="Revert">
          <IconButton onClick={onRevert} disabled={disableRevert}>
            <UndoOutlined
              sx={{
                border: `2px solid ${disablePublish ? theme.palette.grey[400] : theme.palette.grey[600]}`,
                borderRadius: "50%",
              }}
            />
          </IconButton>
        </Tooltip>
      )}
      <CircularProgress
        sx={{
          visibility: showProgress ? "visible" : "hidden",
          opacity: showProgress ? 1 : 0,
          transition: "visibility 0.4s, opacity 0.4s linear",
          display: showProgress ? "block" : "none",
        }}
        size="1rem"
      />
      {!isMinimised && (
        <Box
          sx={{
            ...getWarningStyles(theme),
            p: 1,
            opacity: showUnpublishedWarning ? undefined : 0,
            transition: "visibility 0.4s, opacity 0.4s linear",
            display: showUnpublishedWarning ? "block" : "none",
          }}
        >
          Unpublished Changes.
        </Box>
      )}

      {isMinimised && showUnpublishedWarning && (
        <Tooltip title="Unpublished Changes.">
          <WarningAmberOutlined
            sx={{
              ...getWarningStyles(theme),
              color: `${theme.palette.warning.light}`,
              border: `2px solid ${theme.palette.warning.light}`,
              borderRadius: "50%",
            }}
          />
        </Tooltip>
      )}

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

export function Publisher({ status, title, isMinimised }: PublisherProps) {
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (
      status.type === PublisherStatusType.OutOfDate &&
      status.isUpdating &&
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
        showUnpublishedWarning
        disableRevert
        isMinimised={isMinimised}
      />
    );
  }

  if (status.type === PublisherStatusType.Unpublished) {
    return (
      <PublisherInner
        title={title}
        showProgress={showProgress}
        onPublish={() => {}}
        onRevert={() => {}}
        invisible
        disablePublish
        disableRevert
        isMinimised={isMinimised}
      />
    );
  }

  if (status.type === PublisherStatusType.UpToDate) {
    return (
      <PublisherInner
        title={title}
        showProgress={showProgress}
        onPublish={() => {}}
        onRevert={() => {}}
        disablePublish
        disableRevert
        isMinimised={isMinimised}
      />
    );
  }

  const { isUpdating } = status;

  return (
    <PublisherInner
      title={title}
      showProgress={showProgress}
      onPublish={status.onPublish}
      onRevert={status.onRevert}
      showUnpublishedWarning
      disablePublish={isUpdating || Boolean(status.disabled)}
      disableRevert={isUpdating}
      isMinimised={isMinimised}
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
  isMinimised?: boolean;
}

export function PublisherDraftToggle({
  status,
  isMinimised,
}: PublisherDraftToggleProps) {
  const theme = useTheme();
  const labelPlacement = isMinimised ? "bottom" : "end";
  if (status.type === PublisherStatusType.Unpublished) {
    return null;
  }
  if (status.type === PublisherStatusType.UpToDate) {
    return (
      <FormControlLabel
        control={<Switch checked={false} name="draft" />}
        disabled
        label="View Draft"
        labelPlacement={labelPlacement}
        componentsProps={{ typography: { align: "center" } }}
      />
    );
  }
  return (
    <FormControlLabel
      sx={{ color: status.isDraft ? undefined : theme.palette.grey[400] }}
      control={
        <Switch
          checked={status.isDraft}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            status.onToggle({ isDraft: event.target.checked });
          }}
          name="draft"
        />
      }
      label="View Draft"
      labelPlacement={labelPlacement}
      componentsProps={{ typography: { align: "center" } }}
    />
  );
}
