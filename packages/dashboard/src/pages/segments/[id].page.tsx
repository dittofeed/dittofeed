import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import ContentCopyTwoTone from "@mui/icons-material/ContentCopyTwoTone";
import { Button, Stack, useTheme } from "@mui/material";
import { SegmentResource } from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import React, { useCallback, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import {
  EditableNameProps,
  EditableTitle,
} from "../../components/editableName/v2";
import SegmentEditor, {
  SegmentEditorProps,
} from "../../components/segmentEditor";
import { SettingsCommand, SettingsMenu } from "../../components/settingsMenu";
import { copyToClipboard } from "../../lib/copyToClipboard";
import formatCurl from "../../lib/formatCurl";
import { useSegmentQuery } from "../../lib/useSegmentQuery";
import { useUpdateSegmentsMutation } from "../../lib/useUpdateSegmentsMutation";
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
  const theme = useTheme();
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : undefined;
  const segmentsUpdateMutation = useUpdateSegmentsMutation();
  const { data: segment } = useSegmentQuery(id);
  const [editedSegment, setEditedSegment] = useState<SegmentResource | null>(
    null,
  );

  const commands: SettingsCommand[] = useMemo(() => {
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
  }, [segment]);
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
  const { name } = segment;
  if (!id) {
    return null;
  }

  return (
    <SegmentLayout segmentId={id} tab="configure">
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
          <EditableTitle text={name} onSubmit={handleNameSave} />
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={handleDefinitionSave}>
              Save
            </Button>
            <SettingsMenu commands={commands} />
          </Stack>
        </Stack>
        <SegmentEditor
          segmentId={id}
          onSegmentChange={handleDefinitionUpdate}
        />
      </Stack>
    </SegmentLayout>
  );
}
