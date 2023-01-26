import { Button, Stack } from "@mui/material";
import Step from "@mui/material/Step";
import StepButton from "@mui/material/StepButton";
import Stepper from "@mui/material/Stepper";
import { useRouter } from "next/router";

export default function JourneyStepper({ journeyId }: { journeyId: string }) {
  const path = useRouter();
  const steps: { label: string; path: string }[] = [
    {
      label: "Journey Builder",
      path: `/dashboard/journeys/${journeyId}`,
    },
    { label: "Configure", path: `/dashboard/journeys/${journeyId}/configure` },
  ];
  const activeStep = steps.findIndex((s) => s.path === path.asPath);
  const nextStep = activeStep === steps.length - 1 ? null : activeStep + 1;
  const previousStep = activeStep === 0 ? null : activeStep - 1;

  return (
    <Stack direction="row" spacing={1}>
      <Stepper nonLinear activeStep={activeStep}>
        {steps.map((step) => (
          <Step key={step.label}>
            <StepButton color="inherit" onClick={() => path.push(step.path)}>
              {step.label}
            </StepButton>
          </Step>
        ))}
      </Stepper>
      <Button
        disabled={previousStep === null}
        onClick={() => {
          if (previousStep !== null) {
            const step = steps[previousStep];
            if (step) {
              path.push(step.path);
            }
          }
        }}
      >
        Back
      </Button>
      <Button
        disabled={nextStep === null}
        onClick={() => {
          if (nextStep !== null) {
            const step = steps[nextStep];
            if (step) {
              path.push(step.path);
            }
          }
        }}
      >
        Next
      </Button>
    </Stack>
  );
}
