import { ContentCopyOutlined, ContentCopyTwoTone } from "@mui/icons-material";
import KeyboardDoubleArrowDownRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowDownRounded";
import KeyboardDoubleArrowUpRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowUpRounded";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
import { SegmentResource } from "isomorphic-lib/src/types";
import { useCallback, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { copyToClipboard } from "../../lib/copyToClipboard";
import formatCurl from "../../lib/formatCurl";
import { useSegmentQuery } from "../../lib/useSegmentQuery";
import { useUpdateSegmentsMutation } from "../../lib/useUpdateSegmentsMutation";
import { EditableNameProps, EditableTitle } from "../editableName/v2";
import { InlineDrawer } from "../inlineDrawer";
import { SettingsCommand, SettingsMenu } from "../settingsMenu";
import UsersTableV2 from "../usersTableV2";
import SegmentEditor, { SegmentEditorProps } from "./editor";
import { GreyButton } from "../greyButtonStyle";

const MAX_DRAWER_HEIGHT = "440px";
const DRAWER_HEADER_HEIGHT = "48px";

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
): SettingsCommand[] {
  return [
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

function UsersDrawerHeader({
  isDrawerOpen,
  setIsDrawerOpen,
}: {
  isDrawerOpen: boolean;
  setIsDrawerOpen: (isDrawerOpen: boolean) => void;
}) {
  return (
    <Stack>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{
          p: 1,
          borderBottom: 1,
          borderColor: "divider",
          backgroundColor: "background.paper",
          height: DRAWER_HEADER_HEIGHT,
        }}
      >
        <Typography variant="h6">Users</Typography>
        <IconButton onClick={() => setIsDrawerOpen(!isDrawerOpen)}>
          {isDrawerOpen ? (
            <KeyboardDoubleArrowDownRoundedIcon />
          ) : (
            <KeyboardDoubleArrowUpRoundedIcon />
          )}
        </IconButton>
      </Stack>
    </Stack>
  );
}

function UsersDrawerContent({ segmentId }: { segmentId: string }) {
  return (
    <Box sx={{ flex: 1, overflow: "auto" }}>
      <UsersTableV2 limit={5} segmentFilter={[segmentId]} />
    </Box>
  );
}

export function SegmentEditorV2({ id }: { id: string }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { data: segment } = useSegmentQuery(id);

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [editedSegment, setEditedSegment] = useState<SegmentResource | null>(
    null,
  );

  const segmentsUpdateMutation = useUpdateSegmentsMutation({
    onSuccess: () => {
      setSnackbarMessage("Segment saved successfully!");
      setSnackbarOpen(true);
    },
  });
  // FIXME: immer

  const handleDefinitionSave = useCallback(() => {
    if (!id || !editedSegment) {
      return;
    }
    segmentsUpdateMutation.mutate({
      id,
      definition: editedSegment.definition,
      name: editedSegment.name,
    });
  }, [id, segmentsUpdateMutation, editedSegment]);

  const commands = useMemo(
    () => (segment ? getSegmentCommands(segment) : []),
    [segment],
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

  const handleDefinitionUpdate: SegmentEditorProps["onSegmentChange"] =
    useCallback(
      (s: SegmentResource) => {
        setEditedSegment(s);
      },
      [setEditedSegment],
    );

  if (!segment) {
    return null;
  }
  return (
    <>
      <Stack spacing={1}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <EditableTitle text={segment.name} onSubmit={handleNameSave} />
          <Stack direction="row" spacing={1}>
            <GreyButton variant="contained" onClick={handleDefinitionSave}>
              Save
            </GreyButton>
            <SettingsMenu commands={commands} />
          </Stack>
        </Stack>
        <SegmentEditor
          segmentId={id}
          onSegmentChange={handleDefinitionUpdate}
        />
      </Stack>
      <InlineDrawer
        open={isDrawerOpen}
        header={
          <UsersDrawerHeader
            isDrawerOpen={isDrawerOpen}
            setIsDrawerOpen={setIsDrawerOpen}
          />
        }
        maxHeight={MAX_DRAWER_HEIGHT}
      >
        <UsersDrawerContent segmentId={id} />
      </InlineDrawer>
    </>
  );
}
