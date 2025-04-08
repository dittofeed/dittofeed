import Box from "@mui/material/Box";
import Step from "@mui/material/Step";
import StepButton from "@mui/material/StepButton";
import Stepper from "@mui/material/Stepper";
import Link from "next/link";
import React from "react";

const steps = [
  { key: "recipients", name: "Recipients", path: "/broadcasts/v2/recipients" },
  { key: "content", name: "Content", path: "/broadcasts/v2/content" },
  {
    key: "configuration",
    name: "Configuration",
    path: "/broadcasts/v2/configuration",
  },
  { key: "preview", name: "Preview", path: "/broadcasts/v2/preview" },
];

interface BroadcastLayoutProps {
  children: React.ReactNode;
  activeStepKey: string;
}

export default function BroadcastLayout({
  children,
  activeStepKey,
}: BroadcastLayoutProps) {
  const activeStepIndex = steps.findIndex((step) => step.key === activeStepKey);

  return (
    <Box sx={{ width: "100%" }}>
      <Stepper nonLinear activeStep={activeStepIndex}>
        {steps.map((step) => (
          <Step key={step.key}>
            <Link href={step.path} passHref legacyBehavior>
              <StepButton color="inherit" component="a">
                {step.name}
              </StepButton>
            </Link>
          </Step>
        ))}
      </Stepper>
      <div>
        <Box sx={{ mt: 2, mb: 1, py: 1 }}>{children}</Box>
      </div>
    </Box>
  );
}
