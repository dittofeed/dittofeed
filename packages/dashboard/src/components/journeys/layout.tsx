import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import ContentCopyTwoTone from "@mui/icons-material/ContentCopyTwoTone";
import { Stack, useTheme } from "@mui/material";
import { deepEquals } from "isomorphic-lib/src/equality";
import {
  CompletionStatus,
  SavedJourneyResource,
  UpsertJourneyResource,
} from "isomorphic-lib/src/types";
import React, { useEffect, useMemo } from "react";

import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../../lib/appStore";
import { copyToClipboard } from "../../lib/copyToClipboard";
import formatCurl from "../../lib/formatCurl";
import MainLayout from "../mainLayout";
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
} from "../publisher";
import { SettingsCommand, SettingsMenu } from "../settingsMenu";
import { getGlobalJourneyErrors } from "./globalJourneyErrors";
import JourneyStepper from "./stepper";
import {
  journeyDefinitionFromState,
  journeyDraftToState,
  journeyStateToDraft,
  journeyToState,
  shouldDraftBeUpdated,
} from "./store";

function formatJourneyCurl(journey: SavedJourneyResource) {
  return formatCurl({
    method: "PUT",
    url: "https://app.dittofeed.com/api/admin/journeys",
    headers: {
      Authorization: "Bearer MY_ADMIN_API_TOKEN",
      "Content-Type": "application/json",
    },
    data: {
      id: journey.id,
      workspaceId: journey.workspaceId,
      name: journey.name,
      canRunMultiple: journey.canRunMultiple,
      definition: journey.definition,
    },
  });
}

export default function JourneyLayout({
  journeyId,
  children,
}: {
  children: React.ReactNode;
  journeyId?: string;
}) {
  const theme = useTheme();
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
    viewDraft,
    setViewDraft,
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
    "viewDraft",
    "setViewDraft",
  ]);
  const journey: SavedJourneyResource | null = useMemo(() => {
    if (journeys.type !== CompletionStatus.Successful) {
      return null;
    }
    return journeys.value.find((j) => j.id === journeyId) ?? null;
  }, [journeyId, journeys]);

  useEffect(() => {
    if (
      !journey ||
      workspace.type !== CompletionStatus.Successful ||
      !viewDraft
    ) {
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
  }, [
    journey,
    journeyEdges,
    journeyNodes,
    journeyNodesIndex,
    apiBase,
    viewDraft,
  ]);

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

    const definitionFromState = journeyDefinitionFromState({
      state: {
        journeyNodes,
        journeyEdges,
        journeyNodesIndex,
      },
    });
    if (
      !journey.draft ||
      (viewDraft &&
        definitionFromState.isOk() &&
        deepEquals(definitionFromState.value, journey.definition))
    ) {
      const publisher: PublisherUpToDateStatus = {
        type: PublisherStatusType.UpToDate,
      };
      return { publisher, draftToggle: publisher };
    }
    const globalJourneyErrors = getGlobalJourneyErrors({ nodes: journeyNodes });
    const publisher: PublisherOutOfDateStatus = {
      type: PublisherStatusType.OutOfDate,
      updateRequest: journeyUpdateRequest,
      disabled:
        globalJourneyErrors.size > 0 ||
        definitionFromState.isErr() ||
        !viewDraft,
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
          onSuccessNotice: "Published new Journey version.",
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
          onSuccessNotice: "Reverted Journey to published version.",
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
      isDraft: viewDraft,
      onToggle: ({ isDraft: newIsDraft }) => {
        setViewDraft(newIsDraft);
        if (newIsDraft && journey.draft) {
          const newState = journeyDraftToState({
            name: journey.name,
            draft: journey.draft,
          });
          resetJourneyState({
            edges: newState.journeyEdges,
            index: newState.journeyNodesIndex,
            nodes: newState.journeyNodes,
          });
        } else {
          const {
            journeyEdges: edges,
            journeyNodes: nodes,
            journeyNodesIndex: index,
          } = journeyToState({
            definition: journey.definition,
            name: journey.name,
          });
          resetJourneyState({
            edges,
            nodes,
            index,
          });
        }
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
    viewDraft,
    setJourneyUpdateRequest,
    apiBase,
    upsertJourney,
    resetJourneyState,
    setViewDraft,
  ]);

  const settingsCommands: SettingsCommand[] = useMemo(() => {
    return [
      {
        label: "Copy journey definition as JSON",
        icon: <ContentCopyOutlined />,
        disabled: !journey?.definition,
        action: () => {
          if (!journey) {
            return;
          }
          copyToClipboard({
            value: JSON.stringify(journey.definition),
            successNotice: "Journey definition copied to clipboard as JSON.",
            failureNotice: "Failed to copy journey definition.",
          });
        },
      },
      {
        label: "Copy journey definition as CURL",
        icon: <ContentCopyTwoTone />,
        disabled: !journey?.definition,
        action: () => {
          if (!journey) {
            return;
          }
          const curl = formatJourneyCurl(journey);
          copyToClipboard({
            value: curl,
            successNotice: "Journey definition copied to clipboard as CURL.",
            failureNotice: "Failed to copy journey CURL.",
          });
        },
      },
    ];
  }, [journey]);

  if (!journey || !publisherStatuses) {
    return null;
  }

  const body = journeyId ? (
    <Stack direction="column" sx={{ width: "100%", height: "100%" }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          padding: 1,
          alignItems: "center",
          height: theme.spacing(8),
          borderBottom: `2px solid ${theme.palette.grey[200]}`,
        }}
      >
        <JourneyStepper journeyId={journeyId} />
        <Stack
          direction="row"
          sx={{
            width: theme.spacing(22),
            alignItems: "center",
            justifyContent: "flex-start",
          }}
        >
          <PublisherDraftToggle status={publisherStatuses.draftToggle} />
        </Stack>
        <Publisher status={publisherStatuses.publisher} title={journey.name} />
        <Stack
          direction="row"
          justifyContent="flex-end"
          sx={{
            flex: 1,
          }}
        >
          <SettingsMenu commands={settingsCommands} />
        </Stack>
      </Stack>
      <Stack direction="column" sx={{ flex: 1 }}>
        {children}
      </Stack>
    </Stack>
  ) : null;

  return <MainLayout>{body}</MainLayout>;
}
