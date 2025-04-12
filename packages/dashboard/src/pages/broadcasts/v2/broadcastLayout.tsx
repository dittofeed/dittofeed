import Box from "@mui/material/Box";
import Step from "@mui/material/Step";
import StepButton from "@mui/material/StepButton";
import Stepper from "@mui/material/Stepper";
import React, { createContext, useCallback, useContext } from "react";
import { useImmer } from "use-immer";

const steps = [
  { key: "recipients", name: "Recipients" },
  { key: "content", name: "Content" },
  { key: "configuration", name: "Configuration" },
  { key: "preview", name: "Preview" },
];

interface BroadcastLayoutProps {
  children: React.ReactNode;
  activeStepKey: string;
}

interface BroadcastState {
  activeStepKey: string;
}

const BroadcastStateContext = createContext<BroadcastState | undefined>(
  undefined,
);

export function useBroadcast() {
  const context = useContext(BroadcastStateContext);
  if (!context) {
    throw new Error("useBroadcastState must be used within a BroadcastLayout");
  }
  return context;
}

export default function BroadcastLayout({ children }: BroadcastLayoutProps) {
  const [state, updateState] = useImmer<BroadcastState | null>(null);
  const updateActiveStepKey = useCallback(
    (activeStepKey: string) => {
      updateState((draft) => {
        if (!draft) {
          return;
        }
        draft.activeStepKey = activeStepKey;
      });
    },
    [updateState],
  );
  const activeStepIndex: number = steps.findIndex(
    (step) => step.key === state?.activeStepKey,
  );

  return (
    <Box sx={{ width: "100%" }}>
      <Stepper
        nonLinear
        activeStep={activeStepIndex === -1 ? 0 : activeStepIndex}
      >
        {steps.map((step) => (
          <Step key={step.key}>
            <StepButton
              color="inherit"
              component="a"
              onClick={() => updateActiveStepKey(step.key)}
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
