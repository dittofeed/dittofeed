import { Stack } from "@mui/material";
import Step from "@mui/material/Step";
import StepButton from "@mui/material/StepButton";
import Stepper from "@mui/material/Stepper";
import { useRouter } from "next/router";

export default function JourneyStepper({ journeyId }: { journeyId: string }) {
  const path = useRouter();
  const steps: { label: string; path: string }[] = [
    {
      label: "Journey Builder",
      path: `/journeys/${journeyId}`,
    },
    { label: "Configure", path: `/journeys/configure/${journeyId}` },
  ];
  const activeStep = steps.findIndex((s) => s.path === path.asPath);

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
    </Stack>
  );
}
