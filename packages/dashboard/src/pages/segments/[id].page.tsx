import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import ContentCopyTwoTone from "@mui/icons-material/ContentCopyTwoTone";
import { Button, Stack, useTheme } from "@mui/material";
import {
  SavedSegmentResource,
  SegmentResource,
} from "isomorphic-lib/src/types";
import React, { useMemo } from "react";

import EditableName from "../../components/editableName";
import SegmentEditor from "../../components/segmentEditor";
import { SettingsCommand, SettingsMenu } from "../../components/settingsMenu";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../../lib/appStore";
import { copyToClipboard } from "../../lib/copyToClipboard";
import formatCurl from "../../lib/formatCurl";
import getSegmentServerSideProps from "./[id]/getSegmentServerSideProps";
import SegmentLayout from "./[id]/segmentLayout";

export const getServerSideProps = getSegmentServerSideProps;

function formatSegmentCurl(segment: SegmentResource) {
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

export default function NewSegment() {
  const {
    editedSegment,
    setEditableSegmentName: setName,
    apiBase,
    setSegmentUpdateRequest,
    segmentUpdateRequest,
    upsertSegment,
  } = useAppStorePick([
    "editedSegment",
    "setEditableSegmentName",
    "apiBase",
    "setSegmentUpdateRequest",
    "upsertSegment",
    "segmentUpdateRequest",
  ]);
  const theme = useTheme();

  const commands: SettingsCommand[] = useMemo(() => {
    return [
      {
        label: "Copy segment definition as JSON",
        icon: <ContentCopyOutlined />,
        disabled: !editedSegment?.definition,
        action: () => {
          if (!editedSegment) {
            return;
          }
          copyToClipboard({
            value: JSON.stringify(editedSegment.definition),
            successNotice: "Segment definition copied to clipboard as JSON.",
            failureNotice: "Failed to copy segment definition.",
          });
        },
      },
      {
        label: "Copy segment definition as CURL",
        icon: <ContentCopyTwoTone />,
        disabled: !editedSegment?.definition,
        action: () => {
          if (!editedSegment) {
            return;
          }
          const curl = formatSegmentCurl(editedSegment);
          copyToClipboard({
            value: curl,
            successNotice: "Segment definition copied to clipboard as CURL.",
            failureNotice: "Failed to copy segment CURL.",
          });
        },
      },
    ];
  }, [editedSegment]);

  if (!editedSegment) {
    return null;
  }
  const { name } = editedSegment;

  const handleSave = apiRequestHandlerFactory({
    request: segmentUpdateRequest,
    setRequest: setSegmentUpdateRequest,
    responseSchema: SavedSegmentResource,
    setResponse: upsertSegment,
    onSuccessNotice: `Saved segment ${editedSegment.name}`,
    onFailureNoticeHandler: () =>
      `API Error: Failed to save segment ${editedSegment.name}`,
    requestConfig: {
      method: "PUT",
      url: `${apiBase}/api/segments`,
      data: editedSegment,
      headers: {
        "Content-Type": "application/json",
      },
    },
  });

  return (
    <SegmentLayout segmentId={editedSegment.id} tab="configure">
      <Stack
        spacing={1}
        sx={{
          width: "100%",
          padding: 3,
          backgroundColor: theme.palette.grey[100],
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignContent="center"
        >
          <EditableName
            name={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={handleSave}>
              Save
            </Button>
            <SettingsMenu commands={commands} />
          </Stack>
        </Stack>
        <SegmentEditor />
      </Stack>
    </SegmentLayout>
  );
}
