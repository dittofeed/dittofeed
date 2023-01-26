import { Stack } from "@mui/material";
import React from "react";

import MainLayout from "../mainLayout";
import SaveButton from "./saveButton";
import JourneyStepper from "./stepper";

export default function JourneyLayout({
  journeyId,
  children,
}: {
  children: React.ReactNode;
  journeyId?: string;
}) {
  const body = journeyId ? (
    <Stack
      direction="column"
      sx={{ width: "100%", height: "100%" }}
      spacing={1}
    >
      <Stack direction="row" spacing={1} sx={{ padding: 1 }}>
        <JourneyStepper journeyId={journeyId} />
        <SaveButton journeyId={journeyId} />
      </Stack>
      <Stack direction="column" sx={{ flex: 1 }}>
        {children}
      </Stack>
    </Stack>
  ) : null;

  return <MainLayout>{body}</MainLayout>;
}
