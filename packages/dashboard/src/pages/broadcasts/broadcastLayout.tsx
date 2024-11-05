import { ContentCopyTwoTone } from "@mui/icons-material";
import { Box, Stack, Step, StepButton, Stepper, useTheme } from "@mui/material";
import {
  BroadcastResource,
  CompletionStatus,
  MessageTemplateResourceDefinition,
  SegmentDefinition,
  UpdateBroadcastRequest,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import React, { useMemo } from "react";
import { sortBy, toPairs } from "remeda";
import { useDebounce } from "use-debounce";

import DashboardContent from "../../components/dashboardContent";
import EditableName from "../../components/editableName";
import { SettingsCommand, SettingsMenu } from "../../components/settingsMenu";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../../lib/appStore";
import { getBroadcastMessageNode } from "../../lib/broadcasts";
import { copyToClipboard } from "../../lib/copyToClipboard";
import formatCurl from "../../lib/formatCurl";
import { useUpdateEffect } from "../../lib/useUpdateEffect";

function formatExecuteBroadcastCurl({
  broadcastName,
  workspaceId,
  subscriptionGroupId,
  segmentDefinition,
  messageTemplateDefinition,
}: {
  broadcastName: string;
  workspaceId: string;
  subscriptionGroupId?: string;
  segmentDefinition: SegmentDefinition;
  messageTemplateDefinition: MessageTemplateResourceDefinition;
}) {
  const data = {
    workspaceId,
    broadcastName: `${broadcastName} - ${Date.now()}`,
    ...(subscriptionGroupId ? { subscriptionGroupId } : {}),
    segmentDefinition,
    messageTemplateDefinition,
  };

  return formatCurl({
    method: "POST",
    url: "https://app.dittofeed.com/api/admin/broadcasts/execute",
    headers: {
      Authorization: "Bearer MY_ADMIN_API_TOKEN",
      "Content-Type": "application/json",
    },
    data,
  });
}

export const steps = {
  segment: "Select a Segment",
  template: "Select a Message Template",
  review: "Review",
} as const;

export const order: Record<keyof typeof steps, number> = {
  segment: 0,
  template: 1,
  review: 2,
};

export function BroadcastLayout({
  activeStep,
  id,
  children,
}: {
  activeStep: keyof typeof steps;
  children: React.ReactNode;
  id: string;
}) {
  const theme = useTheme();
  const {
    editedBroadcast,
    updateEditedBroadcast,
    apiBase,
    broadcastUpdateRequest,
    setBroadcastUpdateRequest,
    broadcasts,
    upsertBroadcast,
    journeys,
    segments,
    messages,
  } = useAppStorePick([
    "apiBase",
    "broadcasts",
    "editedBroadcast",
    "updateEditedBroadcast",
    "broadcastUpdateRequest",
    "setBroadcastUpdateRequest",
    "journeys",
    "upsertBroadcast",
    "segments",
    "messages",
  ]);
  const broadcast = useMemo(
    () => broadcasts.find((b) => b.id === id),
    [broadcasts, id],
  );
  const messageNode = useMemo(
    () =>
      broadcast?.journeyId
        ? getBroadcastMessageNode(broadcast.journeyId, journeys)
        : undefined,
    [broadcast?.journeyId, journeys],
  );
  const segment = useMemo(
    () =>
      broadcast?.segmentId && segments.type === CompletionStatus.Successful
        ? segments.value.find((s) => s.id === broadcast.segmentId)
        : undefined,
    [broadcast?.segmentId, segments],
  );
  const messageTemplate = useMemo(
    () =>
      broadcast?.messageTemplateId &&
      messages.type === CompletionStatus.Successful
        ? messages.value.find((mt) => mt.id === broadcast.messageTemplateId)
        : undefined,
    [broadcast?.messageTemplateId, messages],
  );
  const editable = broadcast?.status === "NotStarted";
  const stepIndex = order[activeStep];
  const sortedSteps = sortBy(
    toPairs(steps),
    ([path]) => order[path as keyof typeof steps],
  );
  const [debouncedName] = useDebounce(editedBroadcast?.name, 1000);
  useUpdateEffect(() => {
    if (!editedBroadcast || !debouncedName) {
      return;
    }
    const body: UpdateBroadcastRequest = {
      workspaceId: editedBroadcast.workspaceId,
      id: editedBroadcast.id,
      name: debouncedName,
    };
    apiRequestHandlerFactory({
      request: broadcastUpdateRequest,
      setRequest: setBroadcastUpdateRequest,
      setResponse: upsertBroadcast,
      responseSchema: BroadcastResource,
      onSuccessNotice: `Saved broadcast`,
      onFailureNoticeHandler: () => `API Error: Failed to save broadcast`,
      requestConfig: {
        method: "PUT",
        url: `${apiBase}/api/broadcasts`,
        data: body,
        headers: {
          "Content-Type": "application/json",
        },
      },
    })();
  }, [debouncedName]);
  const commands: SettingsCommand[] = useMemo(() => {
    return [
      {
        label: "Copy execute broadcast CURL",
        icon: <ContentCopyTwoTone />,

        action: () => {
          if (
            !broadcast ||
            !segment ||
            !messageNode ||
            !messageTemplate ||
            !segment.definition ||
            !messageTemplate.definition
          ) {
            return;
          }
          const curl = formatExecuteBroadcastCurl({
            broadcastName: broadcast.name,
            workspaceId: broadcast.workspaceId,
            subscriptionGroupId: messageNode.subscriptionGroupId,
            segmentDefinition: segment.definition,
            messageTemplateDefinition: messageTemplate.definition,
          });
          copyToClipboard({
            value: curl,
            successNotice: "Execute broadcast CURL copied to clipboard.",
            failureNotice: "Failed to copy execute broadcast CURL.",
          });
        },
      },
    ];
  }, []);

  return (
    <DashboardContent>
      <Stack
        direction="column"
        sx={{
          width: "100%",
          height: "100%",
          paddingTop: 2,
          paddingLeft: 2,
          paddingRight: 1,
          paddingBottom: 1,
          alignItems: "start",
        }}
        spacing={1}
      >
        <Stack direction="row" spacing={2} sx={{ width: "100%" }}>
          <Stepper nonLinear activeStep={stepIndex}>
            {sortedSteps.map(([path, name]) => (
              <Step key={path} completed={false}>
                <StepButton
                  color="inherit"
                  href={`/broadcasts/${path}/${id}`}
                  LinkComponent={Link}
                >
                  {name}
                </StepButton>
              </Step>
            ))}
          </Stepper>
          <Box sx={{ flexGrow: 1 }} />
          {editedBroadcast ? (
            <EditableName
              variant="h6"
              sx={{
                minWidth: theme.spacing(52),
              }}
              name={editedBroadcast.name}
              disabled={!editable}
              onChange={(e) => updateEditedBroadcast({ name: e.target.value })}
            />
          ) : null}
          <SettingsMenu commands={commands} />
        </Stack>
        {children}
      </Stack>
    </DashboardContent>
  );
}
