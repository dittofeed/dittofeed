import { Stack } from "@mui/material";
import Step from "@mui/material/Step";
import StepButton from "@mui/material/StepButton";
import Stepper from "@mui/material/Stepper";
import { useRouter } from "next/router";

export default function JourneyStepper({ journeyId }: { journeyId: string }) {
  const router = useRouter();
  const path = router.asPath.split("?")[0];

  const steps: { label: string; path: [string, ...string[]] }[] = [
    {
      label: "Journey Builder",
      path: [`/journeys/${journeyId}`, `/journeys/editor`],
    },
    { label: "Configure", path: [`/journeys/configure/${journeyId}`] },
  ];
  const activeStep = path ? steps.findIndex((s) => s.path.includes(path)) : -1;

  return (
    <Stack direction="row" spacing={1}>
      <Stepper nonLinear activeStep={activeStep}>
        {steps.map((step) => (
          <Step key={step.label}>
            <StepButton
              color="inherit"
              onClick={() => router.push(step.path[0])}
            >
              {step.label}
            </StepButton>
          </Step>
        ))}
      </Stepper>
    </Stack>
  );
}
