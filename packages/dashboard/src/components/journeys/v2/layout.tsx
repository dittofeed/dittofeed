import { Box, Stack, Step, StepButton, Stepper, useTheme } from "@mui/material";
import { deepEquals } from "isomorphic-lib/src/equality";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { useCallback, useMemo } from "react";

import { useAppStorePick } from "../../../lib/appStore";
import { useJourneyMutation } from "../../../lib/useJourneyMutation";
import { useJourneyQuery } from "../../../lib/useJourneyQuery";
import { useSegmentsQuery } from "../../../lib/useSegmentsQuery";
import {
  PublisherDraftToggle,
  PublisherDraftToggleStatus,
  PublisherOutOfDateStatus,
  PublisherOutOfDateToggleStatus,
  PublisherStatus,
  PublisherStatusType,
  PublisherUnpublishedStatus,
  PublisherUpToDateStatus,
} from "../../publisher";
import { getGlobalJourneyErrors } from "../globalJourneyErrors";
import {
  journeyDefinitionFromState,
  journeyDraftToState,
  journeyToState,
} from "../store";
import {
  JourneyV2StepKey,
  JourneyV2StepKeys,
  useJourneyV2Context,
} from "./shared";

const STEPS = [
  {
    label: "Editor",
    step: JourneyV2StepKeys.EDITOR,
  },
  {
    label: "Summary",
    step: JourneyV2StepKeys.SUMMARY,
  },
] as const;
function JourneyStepper() {
  const { state, setState } = useJourneyV2Context();
  const activeStep = useMemo(
    () => STEPS.findIndex((s) => s.step === state.step),
    [state.step],
  );
  const { mutate: updateJourney } = useJourneyMutation(state.id);
  const { data: journey, isPending: isJourneyMutationPending } =
    useJourneyQuery(state.id);
  const {
    workspace,
    journeyNodes,
    journeyEdges,
    journeyNodesIndex,
    viewDraft,
    resetJourneyState,
    setViewDraft,
  } = useAppStorePick([
    "workspace",
    "journeyNodes",
    "journeyEdges",
    "journeyNodesIndex",
    "viewDraft",
    "resetJourneyState",
    "setViewDraft",
  ]);

  const { data: segmentsResponse } = useSegmentsQuery();

  const publisherStatuses: {
    publisher: PublisherStatus;
    draftToggle: PublisherDraftToggleStatus;
  } | null = useMemo(() => {
    if (
      !journey ||
      workspace.type !== CompletionStatus.Successful ||
      !segmentsResponse
    ) {
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

    const globalJourneyErrors = getGlobalJourneyErrors({
      nodes: journeyNodes,
      segments: segmentsResponse.segments,
    });

    const publisher: PublisherOutOfDateStatus = {
      type: PublisherStatusType.OutOfDate,
      isUpdating: isJourneyMutationPending,
      disabled:
        globalJourneyErrors.size > 0 ||
        definitionFromState.isErr() ||
        !viewDraft,
      onPublish: () => {
        if (definitionFromState.isErr()) {
          return;
        }
        updateJourney({
          definition: definitionFromState.value,
        });
      },
      onRevert: () => {
        updateJourney(
          {
            draft: null,
          },
          {
            onSuccess: (response) => {
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
          },
        );
      },
    };
    const draftToggle: PublisherOutOfDateToggleStatus = {
      type: PublisherStatusType.OutOfDate,
      isUpdating: isJourneyMutationPending,
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
        } else if (journey.definition) {
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
    isJourneyMutationPending,
    journey,
    journeyEdges,
    journeyNodes,
    journeyNodesIndex,
    segmentsResponse,
    updateJourney,
    viewDraft,
    workspace.type,
    resetJourneyState,
    setViewDraft,
  ]);

  const handleStepClick = useCallback(
    (step: JourneyV2StepKey) => {
      setState((draft) => {
        draft.step = step;
      });
    },
    [setState],
  );

  return (
    <Stack direction="row" spacing={1}>
      <Stepper
        sx={{
          minWidth: "240px",
          "& .MuiStepIcon-root.Mui-active": {
            color: "grey.600",
          },
        }}
        nonLinear
        activeStep={activeStep}
      >
        {STEPS.map((step) => (
          <Step key={step.label}>
            <StepButton
              color="inherit"
              onClick={() => handleStepClick(step.step)}
            >
              {step.label}
            </StepButton>
          </Step>
        ))}
      </Stepper>
    </Stack>
  );
}

export default function JourneyV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const { state } = useJourneyV2Context();
  const { id } = state;
  const { isPending } = useJourneyQuery(id);
  return (
    <Stack
      sx={{
        height: "100%",
        width: "100%",
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        spacing={1}
        sx={{
          padding: 1,
          alignItems: "center",
          height: theme.spacing(8),
          borderBottom: `2px solid ${theme.palette.grey[200]}`,
        }}
      >
        <JourneyStepper />
      </Stack>
      <Box
        sx={{
          width: "100%",
          flex: 1,
          opacity: isPending ? 0 : 1,
          transition: "opacity 0.3s ease-in-out",
        }}
      >
        {children}
      </Box>
    </Stack>
  );
}
