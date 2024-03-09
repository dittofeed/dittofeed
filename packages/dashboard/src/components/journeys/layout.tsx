import { Stack } from "@mui/material";
import {
  CompletionStatus,
  SavedJourneyResource,
} from "isomorphic-lib/src/types";
import React, { useMemo } from "react";

import { useAppStorePick } from "../../lib/appStore";
import MainLayout from "../mainLayout";
import { getGlobalJourneyErrors } from "./globalJourneyErrors";
import { Publisher, PublisherStatus, PublisherStatusType } from "./publisher";
import SaveButton from "./saveButton";
import JourneyStepper from "./stepper";

export default function JourneyLayout({
  journeyId,
  children,
}: {
  children: React.ReactNode;
  journeyId?: string;
}) {
  const { journeyNodes, journeys } = useAppStorePick([
    "journeyNodes",
    "journeys",
  ]);
  const journey: SavedJourneyResource | null = useMemo(() => {
    if (journeys.type !== CompletionStatus.Successful) {
      return null;
    }
    return journeys.value.find((j) => j.id === journeyId) ?? null;
  }, [journeyId, journeys]);

  const publisherStatus: PublisherStatus = useMemo(() => {
    if (!journey?.definition) {
      return { type: PublisherStatusType.Unpublished };
    }
    if (!journey.draft) {
      return { type: PublisherStatusType.UpToDate };
    }
    return {
      type: PublisherStatusType.OutOfDate,
      onPublish: () => {
        console.log("publish");
      },
      onRevert: () => {
        console.log("revert");
      },
    };
  }, [journey]);

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
      <Publisher status={publisherStatus} />
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
