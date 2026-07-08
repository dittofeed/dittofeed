import {
  Computer,
  ContentCopyOutlined,
  ContentCopyTwoTone,
  Home,
} from "@mui/icons-material";
import {
  Box,
  Snackbar,
  Stack,
  SxProps,
  TextField,
  Theme,
  Tooltip,
  Typography,
} from "@mui/material";
import { formatDistanceToNow } from "date-fns";
import deepEqual from "fast-deep-equal";
import {
  DuplicateResourceTypeEnum,
  SegmentResource,
} from "isomorphic-lib/src/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { useImmer } from "use-immer";

import { copyToClipboard } from "../../lib/copyToClipboard";
import formatCurl from "../../lib/formatCurl";
import { useComputedPropertyPeriodsQuery } from "../../lib/useComputedPropertyPeriodsQuery";
import { useDuplicateResourceMutation } from "../../lib/useDuplicateResourceMutation";
import { useSegmentQuery } from "../../lib/useSegmentQuery";
import { useUpdateSegmentsMutation } from "../../lib/useUpdateSegmentsMutation";
import { EditableNameProps, EditableTitle } from "../editableName/v2";
import { GreyButton } from "../greyButtonStyle";
import { SettingsCommand, SettingsMenu } from "../settingsMenu";
import SegmentEditor, { SegmentEditorProps } from "./editor";

function LastRecomputedAt({ lastRecomputedAt }: { lastRecomputedAt: string }) {
  const date = new Date(lastRecomputedAt);

  const tooltipContent = (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Computer sx={{ color: "text.secondary" }} />
        <Stack>
          <Typography variant="body2" color="text.secondary">
            Your device
          </Typography>
          <Typography>
            {new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "numeric",
              second: "numeric",
              hour12: true,
            }).format(date)}
          </Typography>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center">
        <Home sx={{ color: "text.secondary" }} />
        <Stack>
          <Typography variant="body2" color="text.secondary">
            UTC
          </Typography>
          <Typography>
            {new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "numeric",
              second: "numeric",
              hour12: true,
              timeZone: "UTC",
            }).format(date)}
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  );

  const formatted = formatDistanceToNow(date, { addSuffix: true });
  return (
    <Tooltip title={tooltipContent} placement="bottom-start" arrow>
      <Typography variant="body2">Last Recomputed {formatted}</Typography>
    </Tooltip>
  );
}

function SegmentMetadata({ segmentId }: { segmentId: string }) {
  const { data: segment } = useSegmentQuery(segmentId);
  const { data: computedPropertyPeriods } = useComputedPropertyPeriodsQuery({
    step: "ComputeAssignments",
  });

  const lastRecomputedAt = useMemo(() => {
    return computedPropertyPeriods?.periods.find(
      (p) => p.type === "Segment" && p.id === segmentId,
    )?.lastRecomputed;
  }, [computedPropertyPeriods, segmentId]);

  if (!segment) {
    return null;
  }

  return (
    <Stack direction="row" spacing={3} flexWrap="wrap" alignItems="center">
      {lastRecomputedAt ? (
        <LastRecomputedAt lastRecomputedAt={lastRecomputedAt} />
      ) : (
        <Typography variant="body2" color="text.secondary">
          Not computed yet
        </Typography>
      )}
      {segment.status ? (
        <Typography variant="body2">Status: {segment.status}</Typography>
      ) : null}
      {segment.updatedAt ? (
        <Typography variant="body2">
          Updated{" "}
          {formatDistanceToNow(new Date(segment.updatedAt), {
            addSuffix: true,
          })}
        </Typography>
      ) : null}
      {segment.realtimeStatus ? (
        <Typography variant="body2">
          Live updates: {segment.realtimeStatus.mode}
        </Typography>
      ) : null}
    </Stack>
  );
}

export function formatSegmentCurl(segment: SegmentResource) {
  return formatCurl({
    method: "PUT",
    url: "https://app.dittofeed.com/api/admin/segments",
    headers: {
      Authorization: "Bearer MY_ADMIN_API_TOKEN",
      "Content-Type": "application/json",
    },
    data: {
      id: segment.id,
      workspaceId: segment.workspaceId,
      name: segment.name,
      definition: segment.definition,
    },
  });
}

export function getSegmentCommands(
  segment: SegmentResource,
  onDuplicate: () => void,
): SettingsCommand[] {
  return [
    {
      label: "Duplicate segment",
      icon: <ContentCopyOutlined />,
      disabled: !segment,
      action: onDuplicate,
    },
    {
      label: "Copy segment definition as JSON",
      icon: <ContentCopyOutlined />,
      disabled: !segment,
      action: () => {
        if (!segment) {
          return;
        }
        copyToClipboard({
          value: JSON.stringify(segment.definition),
          successNotice: "Segment definition copied to clipboard as JSON.",
          failureNotice: "Failed to copy segment definition.",
        });
      },
    },
    {
      label: "Copy segment definition as CURL",
      icon: <ContentCopyTwoTone />,
      disabled: !segment,
      action: () => {
        if (!segment) {
          return;
        }
        const curl = formatSegmentCurl(segment);
        copyToClipboard({
          value: curl,
          successNotice: "Segment definition copied to clipboard as CURL.",
          failureNotice: "Failed to copy segment CURL.",
        });
      },
    },
  ];
}

interface SegmentEditorV2State {
  snackbarOpen: boolean;
  snackbarMessage: string;
  editedSegment: SegmentResource | null;
}

export function SegmentEditorV2({
  id,
  sx,
}: {
  id: string;
  sx?: SxProps<Theme>;
}) {
  const { data: segment } = useSegmentQuery(id);
  const [description, setDescription] = useState("");

  const [state, setState] = useImmer<SegmentEditorV2State>({
    snackbarOpen: false,
    snackbarMessage: "",
    editedSegment: null,
  });

  useEffect(() => {
    if (segment) {
      setDescription(segment.description ?? "");
    }
  }, [segment?.id, segment?.description]);

  const hasUnsavedChanges = useMemo(() => {
    if (!segment || !state.editedSegment) {
      return false;
    }
    const unsaved = !deepEqual(
      segment.definition,
      state.editedSegment.definition,
    );
    return unsaved;
  }, [segment, state.editedSegment]);

  const segmentsUpdateMutation = useUpdateSegmentsMutation({
    onSuccess: () => {
      setState((draft) => {
        draft.snackbarOpen = true;
        draft.snackbarMessage = "Segment saved successfully!";
      });
    },
  });

  const duplicateSegmentMutation = useDuplicateResourceMutation({
    onSuccess: (data) => {
      setState((draft) => {
        draft.snackbarOpen = true;
        draft.snackbarMessage = `Segment duplicated as "${data.name}"!`;
      });
    },
    onError: () => {
      setState((draft) => {
        draft.snackbarOpen = true;
        draft.snackbarMessage = "Failed to duplicate segment.";
      });
    },
  });

  const handleDefinitionSave = useCallback(() => {
    if (!id || !state.editedSegment) {
      return;
    }
    segmentsUpdateMutation.mutate({
      id,
      definition: state.editedSegment.definition,
      name: state.editedSegment.name,
    });
  }, [id, segmentsUpdateMutation, state.editedSegment]);

  const handleDuplicate = useCallback(() => {
    if (!segment || duplicateSegmentMutation.isPending) {
      return;
    }
    duplicateSegmentMutation.mutate({
      name: segment.name,
      resourceType: DuplicateResourceTypeEnum.Segment,
    });
  }, [segment, duplicateSegmentMutation]);

  const commands = useMemo(
    () => (segment ? getSegmentCommands(segment, handleDuplicate) : []),
    [segment, handleDuplicate],
  );

  const handleNameSave: EditableNameProps["onSubmit"] = useDebouncedCallback(
    (name) => {
      if (!id) {
        return;
      }
      segmentsUpdateMutation.mutate({
        id,
        name,
      });
    },
    500,
  );

  const handleDescriptionSave = useDebouncedCallback((value: string) => {
    if (!id || !segment) {
      return;
    }
    const trimmed = value.trim();
    const currentDescription = segment.description ?? "";
    if (trimmed === currentDescription) {
      return;
    }
    segmentsUpdateMutation.mutate({
      id,
      name: segment.name,
      description: trimmed || undefined,
    });
  }, 500);

  const handleDescriptionChange = useCallback(
    (value: string) => {
      setDescription(value);
      handleDescriptionSave(value);
    },
    [handleDescriptionSave],
  );

  const handleDefinitionUpdate: SegmentEditorProps["onSegmentChange"] =
    useCallback(
      (s: SegmentResource) => {
        setState((draft) => {
          draft.editedSegment = s;
        });
      },
      [setState],
    );

  const handleSnackbarClose = useCallback(() => {
    setState((draft) => {
      draft.snackbarOpen = false;
    });
  }, [setState]);

  if (!segment) {
    return null;
  }

  return (
    <Box sx={{ position: "relative", height: "100%", width: "100%" }}>
      <Stack spacing={2} sx={sx}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <EditableTitle text={segment.name} onSubmit={handleNameSave} />
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography
              sx={{
                opacity: hasUnsavedChanges ? 1 : 0,
                transition: "opacity 0.3s ease-in-out",
              }}
              variant="body2"
            >
              Unsaved Changes
            </Typography>
            <GreyButton variant="contained" onClick={handleDefinitionSave}>
              Save
            </GreyButton>
            <SettingsMenu commands={commands} />
          </Stack>
        </Stack>
        <TextField
          label="Description"
          value={description}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          variant="outlined"
          placeholder="Optional description"
        />
        <SegmentMetadata segmentId={id} />
        <SegmentEditor segmentId={id} onSegmentChange={handleDefinitionUpdate} />
      </Stack>
      <Snackbar
        open={state.snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        message={state.snackbarMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
