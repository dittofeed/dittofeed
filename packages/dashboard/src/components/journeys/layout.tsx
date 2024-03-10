import { Stack } from "@mui/material";
import {
  CompletionStatus,
  SavedJourneyResource,
} from "isomorphic-lib/src/types";
import React, { useEffect, useMemo } from "react";

import { useAppStorePick } from "../../lib/appStore";
import MainLayout from "../mainLayout";
import { getGlobalJourneyErrors } from "./globalJourneyErrors";
import {
  Publisher,
  PublisherOutOfDateStatus,
  PublisherStatus,
  PublisherStatusType,
} from "./publisher";
import SaveButton from "./saveButton";
import JourneyStepper from "./stepper";

export default function JourneyLayout({
  journeyId,
  children,
}: {
  children: React.ReactNode;
  journeyId?: string;
}) {
  const { journeyNodes, journeys, journeyUpdateRequest } = useAppStorePick([
    "journeyNodes",
    "journeys",
    "journeyUpdateRequest",
  ]);
  const journey: SavedJourneyResource | null = useMemo(() => {
    if (journeys.type !== CompletionStatus.Successful) {
      return null;
    }
    return journeys.value.find((j) => j.id === journeyId) ?? null;
  }, [journeyId, journeys]);

  useEffect(() => {
    /* 
      update journey draft if one of the following

      1. journey state does equal draft
      2. journey draft is undefined current state does not equal definition 
    */
  }, [journey]);

  const publisherStatus: PublisherStatus = useMemo(() => {
    if (!journey?.definition) {
      return { type: PublisherStatusType.Unpublished };
    }
    if (!journey.draft) {
      return { type: PublisherStatusType.UpToDate };
    }
    return {
      type: PublisherStatusType.OutOfDate,
      updateRequest: journeyUpdateRequest,
      onPublish: () => {
        console.log("publish");
      },
      onRevert: () => {
        console.log("revert");
      },
    } satisfies PublisherOutOfDateStatus;
  }, [journey, journeyUpdateRequest]);

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
