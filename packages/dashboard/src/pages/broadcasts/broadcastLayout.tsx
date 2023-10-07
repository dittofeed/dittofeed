import { Stack, Step, StepButton, Stepper, useTheme } from "@mui/material";
import Link from "next/link";
import React from "react";

import DashboardContent from "../../components/dashboardContent";
import EditableName from "../../components/editableName";
import { useAppStorePick } from "../../lib/appStore";

const steps: { name: string; path: string }[] = [
  { name: "Configure", path: "configure" },
  { name: "Select a Segment", path: "segment" },
  { name: "Select a Message Template", path: "template" },
  { name: "Review", path: "review" },
];

export function BroadcastLayout({
  activeStep,
  id,
}: {
  activeStep: number;
  id: string;
}) {
  // FIXM
  const wasBroadcastCreated = false;

  const { editedBroadcast, updateEditedBroadcast } = useAppStorePick([
    "editedBroadcast",
    "updateEditedBroadcast",
  ]);
  const theme = useTheme();

  if (!editedBroadcast) {
    return null;
  }

  return (
    <DashboardContent>
      <Stack
        direction="column"
        sx={{ width: "100%", height: "100%", padding: 2, alignItems: "start" }}
        spacing={3}
      >
        <Stack direction="row" spacing={2}>
          <Stepper nonLinear activeStep={activeStep}>
            {steps.map(({ name, path }) => (
              <Step key={name} completed={false}>
                <StepButton
                  color="inherit"
                  href={`/broadcasts/${path}/${id}`}
                  LinkComponent={Link}
                />
              </Step>
            ))}
          </Stepper>
          <EditableName
            variant="h6"
            sx={{
              minWidth: theme.spacing(52),
            }}
            name={editedBroadcast.name}
            disabled={wasBroadcastCreated}
            onChange={(e) => updateEditedBroadcast({ name: e.target.value })}
          />
        </Stack>
      </Stack>
    </DashboardContent>
  );
}
