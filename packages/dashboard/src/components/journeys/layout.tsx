import { Stack } from "@mui/material";
import React, { useMemo } from "react";

import { useAppStorePick } from "../../lib/appStore";
import MainLayout from "../mainLayout";
import { getGlobalJourneyErrors } from "./globalJourneyErrors";
import SaveButton from "./saveButton";
import JourneyStepper from "./stepper";

export default function JourneyLayout({
  journeyId,
  children,
}: {
  children: React.ReactNode;
  journeyId?: string;
}) {
  const { journeyNodes } = useAppStorePick(["journeyNodes"]);

  const globalJourneyErrors = useMemo(
    () => getGlobalJourneyErrors({ nodes: journeyNodes }),
    [journeyNodes],
  );

  const body = journeyId ? (
    <Stack
      direction="column"
      sx={{ width: "100%", height: "100%" }}
      spacing={1}
    >
      <Stack direction="row" spacing={1} sx={{ padding: 1 }}>
        <JourneyStepper journeyId={journeyId} />
        <SaveButton
          journeyId={journeyId}
          disabled={globalJourneyErrors.size > 0}
        />
      </Stack>
      <Stack direction="column" sx={{ flex: 1 }}>
        {children}
      </Stack>
    </Stack>
  ) : null;

  return <MainLayout>{body}</MainLayout>;
}
