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
  PublisherDraftToggle,
  PublisherDraftToggleStatus,
  PublisherOutOfDateStatus,
  PublisherOutOfDateToggleStatus,
  PublisherStatus,
  PublisherStatusType,
  PublisherUnpublishedStatus,
  PublisherUpToDateStatus,
} from "./publisher";
import JourneyStepper from "./stepper";
import {
  journeyDefinitionFromState,
  journeyStateToDraft,
  journeyToState,
  shouldDraftBeUpdated,
} from "./store";

export default function JourneyLayout({
  journeyId,
  children,
}: {
  children: React.ReactNode;
  journeyId?: string;
}) {
  const [isDraft, setIsDraft] = React.useState(true);
  const {
    apiBase,
    journeyNodes,
    journeys,
    journeyUpdateRequest,
    journeyEdges,
    journeyNodesIndex,
    upsertJourney,
    setJourneyUpdateRequest,
    workspace,
    resetJourneyState,
  } = useAppStorePick([
    "apiBase",
    "workspace",
    "journeyNodes",
    "journeyEdges",
    "journeyNodesIndex",
    "journeys",
    "journeyUpdateRequest",
    "setJourneyUpdateRequest",
    "upsertJourney",
    "resetJourneyState",
  ]);
  const journey: SavedJourneyResource | null = useMemo(() => {
    if (journeys.type !== CompletionStatus.Successful) {
      return null;
    }
    return journeys.value.find((j) => j.id === journeyId) ?? null;
  }, [journeyId, journeys]);

  useEffect(() => {
    if (!journey || workspace.type !== CompletionStatus.Successful) {
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

  const publisherStatuses: {
    publisher: PublisherStatus;
    draftToggle: PublisherDraftToggleStatus;
  } | null = useMemo(() => {
    if (!journey || workspace.type !== CompletionStatus.Successful) {
      return null;
    }
    if (journey.status === "NotStarted") {
      const publisher: PublisherUnpublishedStatus = {
        type: PublisherStatusType.Unpublished,
      };
      return { publisher, draftToggle: publisher };
    }
    if (!journey.draft) {
      const publisher: PublisherUpToDateStatus = {
        type: PublisherStatusType.UpToDate,
      };
      return { publisher, draftToggle: publisher };
    }
    const globalJourneyErrors = getGlobalJourneyErrors({ nodes: journeyNodes });
    const definitionFromState = journeyDefinitionFromState({
      state: {
        journeyNodes,
        journeyEdges,
        journeyNodesIndex,
      },
    });
    const publisher: PublisherOutOfDateStatus = {
      type: PublisherStatusType.OutOfDate,
      updateRequest: journeyUpdateRequest,
      disabled: globalJourneyErrors.size > 0 || definitionFromState.isErr(),
      onPublish: () => {
        if (definitionFromState.isErr()) {
          return;
        }

        const journeyUpdate: UpsertJourneyResource = {
          id: journey.id,
          workspaceId: workspace.value.id,
          definition: definitionFromState.value,
        };

        apiRequestHandlerFactory({
          request: journeyUpdateRequest,
          setRequest: setJourneyUpdateRequest,
          responseSchema: SavedJourneyResource,
          setResponse: (response) => {
            upsertJourney(response);
          },
          requestConfig: {
            method: "PUT",
            url: `${apiBase}/api/journeys`,
            data: journeyUpdate,
            headers: {
              "Content-Type": "application/json",
            },
          },
        })();
      },
      onRevert: () => {
        const journeyUpdate: UpsertJourneyResource = {
          id: journey.id,
          workspaceId: workspace.value.id,
          draft: null,
        };

        apiRequestHandlerFactory({
          request: journeyUpdateRequest,
          setRequest: setJourneyUpdateRequest,
          responseSchema: SavedJourneyResource,
          setResponse: (response) => {
            upsertJourney(response);
            const { definition, name } = response;

            if (definition) {
              const {
                journeyEdges: edges,
                journeyNodes: nodes,
                journeyNodesIndex: index,
              } = journeyToState({
                definition,
                name,
              });
              resetJourneyState({
                edges,
                nodes,
                index,
              });
            }
          },
          requestConfig: {
            method: "PUT",
            url: `${apiBase}/api/journeys`,
            data: journeyUpdate,
            headers: {
              "Content-Type": "application/json",
            },
          },
        })();
      },
    };
    const draftToggle: PublisherOutOfDateToggleStatus = {
      type: PublisherStatusType.OutOfDate,
      updateRequest: journeyUpdateRequest,
      isDraft,
      onToggle: ({ isDraft: newIsDraft }) => {
        // FIXME
        setIsDraft(newIsDraft);
      },
    };
    return { publisher, draftToggle };
  }, [
    journey,
    workspace,
    journeyNodes,
    journeyEdges,
    journeyNodesIndex,
    journeyUpdateRequest,
    isDraft,
    setJourneyUpdateRequest,
    apiBase,
    upsertJourney,
    resetJourneyState,
  ]);

  if (!journey || !publisherStatuses) {
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
        <Publisher status={publisherStatuses.publisher} />
        <PublisherDraftToggle status={publisherStatuses.draftToggle} />
      </Stack>
      <Stack direction="column" sx={{ flex: 1 }}>
        {children}
      </Stack>
    </Stack>
  ) : null;

  return <MainLayout>{body}</MainLayout>;
}
