import Box from "@mui/material/Box";
import Step from "@mui/material/Step";
import StepButton from "@mui/material/StepButton";
import Stepper from "@mui/material/Stepper";
import Link from "next/link";
import React from "react";

const steps = [
  { name: "Recipients", path: "/broadcasts/v2/recipients" },
  { name: "Content", path: "/broadcasts/v2/content" },
  { name: "Configuration", path: "/broadcasts/v2/configuration" },
  { name: "Preview", path: "/broadcasts/v2/preview" },
];

interface BroadcastLayoutProps {
  children: React.ReactNode;
  activeStepIndex: number;
}

export default function BroadcastLayout({
  children,
  activeStepIndex,
}: BroadcastLayoutProps) {
  return (
    <Box sx={{ width: "100%" }}>
      <Stepper nonLinear activeStep={activeStepIndex}>
        {steps.map((step) => (
          <Step key={step.name}>
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
