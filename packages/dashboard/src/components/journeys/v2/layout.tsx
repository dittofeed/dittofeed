import { Stack, Step, StepButton, Stepper, useTheme } from "@mui/material";
import { useCallback, useMemo } from "react";

import {
  JourneyV2StepKey,
  JourneyV2StepKeys,
  useJourneyV2Context,
} from "./shared";

const STEPS = [
  {
    label: "Editor",
    step: JourneyV2StepKeys.EDITOR,
  },
  {
    label: "Summary",
    step: JourneyV2StepKeys.SUMMARY,
  },
] as const;
function JourneyStepper() {
  const { state, setState } = useJourneyV2Context();
  const activeStep = useMemo(
    () => STEPS.findIndex((s) => s.step === state.step),
    [state.step],
  );
  const handleStepClick = useCallback(
    (step: JourneyV2StepKey) => {
      setState((draft) => {
        draft.step = step;
      });
    },
    [setState],
  );

  return (
    <Stack direction="row" spacing={1}>
      <Stepper
        sx={{
          minWidth: "240px",
          "& .MuiStepIcon-root.Mui-active": {
            color: "grey.600",
          },
        }}
        nonLinear
        activeStep={activeStep}
      >
        {STEPS.map((step) => (
          <Step key={step.label}>
            <StepButton
              color="inherit"
              onClick={() => handleStepClick(step.step)}
            >
              {step.label}
            </StepButton>
          </Step>
        ))}
      </Stepper>
    </Stack>
  );
}

export default function JourneyV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Stack
      sx={{
        height: "100%",
        width: "100%",
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{
          padding: 1,
          alignItems: "center",
          height: theme.spacing(8),
          borderBottom: `2px solid ${theme.palette.grey[200]}`,
        }}
      >
        <JourneyStepper />
      </Stack>
      {children}
    </Stack>
  );
}
