import { Stack } from "@mui/material";
import {
  CompletionStatus,
  SavedJourneyResource,
  UpsertJourneyResource,
} from "isomorphic-lib/src/types";
import React, { useEffect, useMemo } from "react";

import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
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
import { journeyStateToDraft, shouldDraftBeUpdated } from "./store";

export default function JourneyLayout({
  journeyId,
  children,
}: {
  children: React.ReactNode;
  journeyId?: string;
}) {
  const {
    apiBase,
    journeyNodes,
    journeys,
    journeyUpdateRequest,
    journeyEdges,
    journeyNodesIndex,
    upsertJourney,
    setJourneyUpdateRequest,
  } = useAppStorePick([
    "apiBase",
    "journeyNodes",
    "journeyEdges",
    "journeyNodesIndex",
    "journeys",
    "journeyUpdateRequest",
    "setJourneyUpdateRequest",
    "upsertJourney",
  ]);
  const journey: SavedJourneyResource | null = useMemo(() => {
    if (journeys.type !== CompletionStatus.Successful) {
      return null;
    }
    return journeys.value.find((j) => j.id === journeyId) ?? null;
  }, [journeyId, journeys]);

  useEffect(() => {
    if (!journey) {
      return;
    }
    if (
      !shouldDraftBeUpdated({
        definition: journey.definition,
        draft: journey.draft,
        journeyEdges,
        journeyNodes,
        journeyNodesIndex,
      })
    ) {
      return;
    }
    apiRequestHandlerFactory({
      request: journeyUpdateRequest,
      setRequest: setJourneyUpdateRequest,
      responseSchema: SavedJourneyResource,
      setResponse: upsertJourney,
      requestConfig: {
        method: "PUT",
        url: `${apiBase}/api/journeys`,
        data: {
          id: journey.id,
          workspaceId: journey.workspaceId,
          draft: journeyStateToDraft({
            journeyEdges,
            journeyNodes,
          }),
        } satisfies UpsertJourneyResource,
        headers: {
          "Content-Type": "application/json",
        },
      },
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey, journeyEdges, journeyNodes, journeyNodesIndex, apiBase]);

  const publisherStatus: PublisherStatus | null = useMemo(() => {
    if (!journey) {
      return null;
    }
    if (journey.status === "NotStarted") {
      return { type: PublisherStatusType.Unpublished };
    }
    if (!journey.draft) {
      return { type: PublisherStatusType.UpToDate };
    }
    const globalJourneyErrors = getGlobalJourneyErrors({ nodes: journeyNodes });
    return {
      type: PublisherStatusType.OutOfDate,
      updateRequest: journeyUpdateRequest,
      disabled: globalJourneyErrors.size > 0,
      onPublish: () => {
        console.log("publish");
      },
      onRevert: () => {
        console.log("revert");
      },
    } satisfies PublisherOutOfDateStatus;
  }, [journey, journeyUpdateRequest, journeyNodes]);

  if (!journey || !publisherStatus) {
    return null;
  }

  const body = journeyId ? (
    <Stack
      direction="column"
      sx={{ width: "100%", height: "100%" }}
      spacing={1}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ padding: 1, alignItems: "center" }}
      >
        <JourneyStepper journeyId={journeyId} />
        <Publisher status={publisherStatus} />
      </Stack>
      <Stack direction="column" sx={{ flex: 1 }}>
        {children}
      </Stack>
    </Stack>
  ) : null;

  return <MainLayout>{body}</MainLayout>;
}
