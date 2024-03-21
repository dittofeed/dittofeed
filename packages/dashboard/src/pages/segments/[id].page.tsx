import { Button, Stack, useTheme } from "@mui/material";
import { SavedSegmentResource } from "isomorphic-lib/src/types";
import React from "react";

import EditableName from "../../components/editableName";
import SegmentEditor from "../../components/segmentEditor";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../../lib/appStore";
import getSegmentServerSideProps from "./[id]/getSegmentServerSideProps";
import SegmentLayout from "./[id]/segmentLayout";

export const getServerSideProps = getSegmentServerSideProps;

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
          <Button variant="contained" onClick={handleSave}>
            Save
          </Button>
        </Stack>
        <SegmentEditor />
      </Stack>
    </SegmentLayout>
  );
}
