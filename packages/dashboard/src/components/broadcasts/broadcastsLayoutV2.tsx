import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepButton from "@mui/material/StepButton";
import Stepper from "@mui/material/Stepper";
import React, { useCallback } from "react";

import {
  BROADCAST_STEPS,
  BroadcastState,
  BroadcastStateUpdater,
  BroadcastStepKey,
} from "./broadcastsShared";

interface BroadcastLayoutProps {
  children: React.ReactNode;
  state: BroadcastState;
  updateState: BroadcastStateUpdater;
}

export default function BroadcastLayout({
  children,
  state,
  updateState,
}: BroadcastLayoutProps) {
  const updateStep = useCallback(
    (step: BroadcastStepKey) => {
      updateState((draft) => {
        draft.step = step;
      });
    },
    [updateState],
  );
  const activeStepIndex: number = BROADCAST_STEPS.findIndex(
    (step) => step.key === state.step,
  );

  return (
    <Box sx={{ width: "100%" }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        sx={{ width: "100%" }}
      >
        <Stepper
          sx={{
            minWidth: "720px",
          }}
          nonLinear
          activeStep={activeStepIndex === -1 ? 0 : activeStepIndex}
        >
          {BROADCAST_STEPS.map((step) => (
            <Step key={step.key}>
              <StepButton color="inherit" onClick={() => updateStep(step.key)}>
                {step.name}
              </StepButton>
            </Step>
          ))}
        </Stepper>
        <Stack direction="row" spacing={2}>
          <Button variant="contained" color="primary">
            Show Preview
          </Button>
        </Stack>
      </Stack>
      <Box sx={{ pt: 3, pb: 1, pl: 2 }}>{children}</Box>
    </Box>
  );
}
