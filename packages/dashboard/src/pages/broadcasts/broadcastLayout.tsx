import { Stack, Step, StepButton, Stepper } from "@mui/material";
import Link from "next/link";
import React from "react";
import { sortBy } from "remeda/dist/commonjs/sortBy";
import { toPairs } from "remeda/dist/commonjs/toPairs";

import DashboardContent from "../../components/dashboardContent";

const steps = {
  configure: "Configure",
  segment: "Select a Segment",
  template: "Select a Message Template",
  review: "Review",
} as const;

const order: Record<keyof typeof steps, number> = {
  configure: 0,
  template: 1,
  segment: 2,
  review: 3,
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
  const stepIndex = order[activeStep];
  const sortedSteps = sortBy(
    toPairs(steps),
    ([path]) => order[path as keyof typeof steps]
  );

  return (
    <DashboardContent>
      <Stack
        direction="column"
        sx={{ width: "100%", height: "100%", padding: 2, alignItems: "start" }}
        spacing={3}
      >
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
        {children}
      </Stack>
    </DashboardContent>
  );
}
