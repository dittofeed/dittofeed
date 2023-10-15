import { Button, Stack, useTheme } from "@mui/material";
import { SegmentResource } from "isomorphic-lib/src/types";
import React from "react";

import EditableName from "../../components/editableName";
import SegmentEditor from "../../components/segmentEditor";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStore } from "../../lib/appStore";
import getSegmentServerSideProps from "./[id]/getSegmentServerSideProps";
import SegmentLayout from "./[id]/segmentLayout";

export const getServerSideProps = getSegmentServerSideProps;

export default function NewSegment() {
  const editedSegment = useAppStore((state) => state.editedSegment);
  const setName = useAppStore((state) => state.setEditableSegmentName);
  const apiBase = useAppStore((state) => state.apiBase);
  const segmentUpdateRequest = useAppStore(
    (state) => state.segmentUpdateRequest
  );
  const setSegmentUpdateRequest = useAppStore(
    (state) => state.setSegmentUpdateRequest
  );
  const upsertSegment = useAppStore((state) => state.upsertSegment);
  const theme = useTheme();

  if (!editedSegment) {
    return null;
  }
  const { name } = editedSegment;

  const handleSave = apiRequestHandlerFactory({
    request: segmentUpdateRequest,
    setRequest: setSegmentUpdateRequest,
    responseSchema: SegmentResource,
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
