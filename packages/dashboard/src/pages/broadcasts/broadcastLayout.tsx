import { Stack, Step, StepButton, Stepper, useTheme } from "@mui/material";
import {
  BroadcastResource,
  UpdateBroadcastRequest,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import React, { useMemo } from "react";
import { sortBy, toPairs } from "remeda";
import { useDebounce } from "use-debounce";

import DashboardContent from "../../components/dashboardContent";
import EditableName from "../../components/editableName";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../../lib/appStore";
import { useUpdateEffect } from "../../lib/useUpdateEffect";

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
  } = useAppStorePick([
    "apiBase",
    "broadcasts",
    "editedBroadcast",
    "updateEditedBroadcast",
    "broadcastUpdateRequest",
    "setBroadcastUpdateRequest",
    "upsertBroadcast",
  ]);
  const broadcast = useMemo(
    () => broadcasts.find((b) => b.id === id),
    [broadcasts, id],
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

  return (
    <DashboardContent>
      <Stack
        direction="column"
        sx={{ width: "100%", height: "100%", padding: 2, alignItems: "start" }}
        spacing={1}
      >
        <Stack direction="row" spacing={2}>
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
        </Stack>
        {children}
      </Stack>
    </DashboardContent>
  );
}
