import Box from "@mui/material/Box";
import Step from "@mui/material/Step";
import StepButton from "@mui/material/StepButton";
import Stepper from "@mui/material/Stepper";
import React, { useCallback } from "react";

import {
  BROADCAST_STEPS,
  BroadcastState,
  BroadcastStateUpdater,
  StepKey,
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
    (step: StepKey) => {
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
      <Stepper
        nonLinear
        activeStep={activeStepIndex === -1 ? 0 : activeStepIndex}
      >
        {BROADCAST_STEPS.map((step) => (
          <Step key={step.key}>
            <StepButton
              color="inherit"
              component="a"
              onClick={() => updateStep(step.key)}
            >
              {step.name}
            </StepButton>
          </Step>
        ))}
      </Stepper>
      <div>
        <Box sx={{ mt: 2, mb: 1, py: 1 }}>{children}</Box>
      </div>
    </Box>
  );
}
