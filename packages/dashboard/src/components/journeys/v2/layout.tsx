import { DittofeedSdk as sdk } from "@dittofeed/sdk-web";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import ContentCopyTwoTone from "@mui/icons-material/ContentCopyTwoTone";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Snackbar,
  Stack,
  Step,
  StepButton,
  Stepper,
  Tooltip,
  useTheme,
} from "@mui/material";
import { deepEquals } from "isomorphic-lib/src/equality";
import {
  CompletionStatus,
  DuplicateResourceTypeEnum,
  JourneyDefinition,
  JourneyResourceStatus,
  SavedJourneyResource,
  WorkspaceMemberResource,
} from "isomorphic-lib/src/types";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAppStorePick } from "../../../lib/appStore";
import { JOURNEY_STATUS_CHANGE_EVENT } from "../../../lib/constants";
import { copyToClipboard } from "../../../lib/copyToClipboard";
import formatCurl from "../../../lib/formatCurl";
import { useDuplicateResourceMutation } from "../../../lib/useDuplicateResourceMutation";
import { useJourneyMutation } from "../../../lib/useJourneyMutation";
import { useJourneyQuery } from "../../../lib/useJourneyQuery";
import { useSegmentsQuery } from "../../../lib/useSegmentsQuery";
import { EditableTitle } from "../../editableName/v2";
import InfoTooltip from "../../infoTooltip";
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
} from "../../publisher";
import { SettingsCommand, SettingsMenu } from "../../settingsMenu";
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

interface StatusCopy {
  label: string;
  currentDescription: string;
  nextDescription: string;
  nextStatusLabel: string;
  nextStatus?: JourneyResourceStatus;
  disabled?: true;
}

const statusValues: Record<"NotStarted" | "Running" | "Paused", StatusCopy> = {
  NotStarted: {
    label: "Not Started",
    nextStatus: "Running",
    nextStatusLabel: "Start",
    currentDescription:
      "The journey has not been started. Users have not been exposed to the journey.",
    nextDescription: "Start the journey to expose users to it.",
  },
  Running: {
    label: "Running",
    nextStatus: "Paused",
    nextStatusLabel: "Pause",
    currentDescription:
      "The journey is running. Users are being exposed to it.",
    nextDescription:
      "Pause the journey to prevent users from entering it. Users already on the journey will exit if the journey is not restarted before they enter a message node.",
  },
  Paused: {
    label: "Paused",
    nextStatus: "Running",
    nextStatusLabel: "Restart",
    currentDescription:
      "The journey is running. Users are not currently being exposed to the journey, but were prior to it being paused. Users already on the journey will exit if the journey is not restarted before they enter a message node.",
    nextDescription: "Restart the journey to start exposing users to it again.",
  },
};

function trackStatusChange({
  member,
  journeyId,
  status,
}: {
  journeyId: string;
  member: WorkspaceMemberResource;
  status: JourneyResourceStatus;
}) {
  sdk.track({
    event: JOURNEY_STATUS_CHANGE_EVENT,
    userId: member.id,
    properties: {
      journeyId,
      status,
    },
  });
}

function JourneyStepper() {
  const { state, setState } = useJourneyV2Context();
  const activeStep = useMemo(
    () => STEPS.findIndex((s) => s.step === state.step),
    [state.step],
  );

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

function JourneyStatusControl() {
  const { state } = useJourneyV2Context();
  const { data: journey } = useJourneyQuery(state.id);
  const { mutate: updateJourney, isPending: isUpdating } = useJourneyMutation(
    state.id,
  );
  const { data: segmentsResponse } = useSegmentsQuery();
  const { workspace, journeyNodes, journeyEdges, journeyNodesIndex, member } =
    useAppStorePick([
      "workspace",
      "journeyNodes",
      "journeyEdges",
      "journeyNodesIndex",
      "member",
    ]);

  const segments = useMemo(
    () => segmentsResponse?.segments ?? [],
    [segmentsResponse],
  );

  const definitionFromState: JourneyDefinition | null = useMemo(() => {
    const globalJourneyErrors = getGlobalJourneyErrors({
      nodes: journeyNodes,
      segments,
    });
    if (globalJourneyErrors.size > 0) {
      return null;
    }
    return journeyDefinitionFromState({
      state: {
        journeyNodes,
        journeyEdges,
        journeyNodesIndex,
      },
    }).unwrapOr(null);
  }, [journeyNodes, journeyEdges, journeyNodesIndex, segments]);

  const statusValue: StatusCopy = useMemo(() => {
    if (!journey) {
      return {
        label: "Loading...",
        disabled: true,
        currentDescription: "Loading journey status...",
        nextStatusLabel: "Loading",
        nextDescription: "Please wait...",
      };
    }

    if (journey.status === "NotStarted" && !definitionFromState) {
      return {
        label: "Unfinished",
        disabled: true,
        currentDescription:
          "This journey has not been finished and can't be started.",
        nextStatusLabel: "Disabled",
        nextDescription: "Finish configuring this journey to progress",
      };
    }
    if (journey.status === "Broadcast") {
      throw new Error("Broadcast journeys cannot be configured.");
    }
    return statusValues[journey.status];
  }, [journey, definitionFromState]);

  const handleChangeStatus = useCallback(() => {
    if (
      !journey ||
      workspace.type !== CompletionStatus.Successful ||
      !statusValue.nextStatus
    ) {
      return;
    }

    const definition =
      definitionFromState && statusValue.nextStatus === "Running"
        ? definitionFromState
        : undefined;

    updateJourney(
      {
        name: journey.name,
        definition,
        status: statusValue.nextStatus as "Running" | "Paused" | "Broadcast",
      },
      {
        onSuccess: (response) => {
          if (member) {
            trackStatusChange({
              journeyId: state.id,
              member,
              status: response.status,
            });
          }
        },
      },
    );
  }, [
    journey,
    workspace,
    definitionFromState,
    statusValue,
    updateJourney,
    member,
    state.id,
  ]);

  if (!journey) {
    return null;
  }

  return (
    <InfoTooltip title={statusValue.nextDescription}>
      <Tooltip title={`Current status: ${statusValue.label}`}>
        <Button
          variant="outlined"
          size="small"
          disabled={statusValue.disabled || isUpdating}
          onClick={handleChangeStatus}
        >
          {statusValue.nextStatusLabel}
        </Button>
      </Tooltip>
    </InfoTooltip>
  );
}

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

export default function JourneyV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const { state } = useJourneyV2Context();
  const { id } = state;
  const { isPending: isJourneyQueryPending, data: journey } =
    useJourneyQuery(id);
  const { mutate: updateJourney, isPending: isJourneyMutationPending } =
    useJourneyMutation(state.id);

  const [optionsDialogOpen, setOptionsDialogOpen] = useState(false);
  const [canRunMultiple, setCanRunMultiple] = useState(
    !!journey?.canRunMultiple,
  );
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  const duplicateJourneyMutation = useDuplicateResourceMutation({
    onSuccess: (data) => {
      setSnackbarOpen(true);
      setSnackbarMessage(`Journey duplicated as "${data.name}"!`);
    },
    onError: () => {
      setSnackbarOpen(true);
      setSnackbarMessage("Failed to duplicate journey.");
    },
  });
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

  useEffect(() => {
    if (journey) {
      setCanRunMultiple(!!journey.canRunMultiple);
    }
  }, [journey]);

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

  const handleDuplicate = useCallback(() => {
    if (!journey || duplicateJourneyMutation.isPending) {
      return;
    }
    duplicateJourneyMutation.mutate({
      name: journey.name,
      resourceType: DuplicateResourceTypeEnum.Journey,
    });
  }, [journey, duplicateJourneyMutation]);

  const settingsCommands: SettingsCommand[] = useMemo(() => {
    return [
      {
        label: "Duplicate journey",
        icon: <ContentCopyOutlined />,
        disabled: !journey,
        action: handleDuplicate,
      },
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
          const curl = formatJourneyCurl(journey as SavedJourneyResource);
          copyToClipboard({
            value: curl,
            successNotice: "Journey definition copied to clipboard as CURL.",
            failureNotice: "Failed to copy journey CURL.",
          });
        },
      },
    ];
  }, [journey, handleDuplicate]);

  const handleOptionsDialogClose = useCallback(() => {
    setOptionsDialogOpen(false);
  }, []);

  const handleOptionsDialogOpen = useCallback(() => {
    setOptionsDialogOpen(true);
  }, []);

  const handleChangeRunMultiple = useCallback(
    (newValue: boolean) => {
      if (!journey || workspace.type !== CompletionStatus.Successful) {
        return;
      }

      const previousValue = canRunMultiple;
      setCanRunMultiple(newValue);

      updateJourney(
        {
          name: journey.name,
          canRunMultiple: newValue,
        },
        {
          onError: () => {
            setCanRunMultiple(previousValue);
          },
        },
      );
    },
    [journey, workspace, canRunMultiple, updateJourney],
  );

  const handleSnackbarClose = useCallback(() => {
    setSnackbarOpen(false);
  }, []);

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
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="flex-start"
        >
          <JourneyStepper />
          <Divider orientation="vertical" flexItem />
          <JourneyStatusControl />
          <Divider orientation="vertical" flexItem />
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              opacity: publisherStatuses ? 1 : 0,
              transition: "opacity 0.3s ease-in-out",
            }}
          >
            {publisherStatuses && journey && (
              <>
                <PublisherDraftToggle status={publisherStatuses.draftToggle} />
                <Divider orientation="vertical" flexItem />
                <Publisher
                  status={publisherStatuses.publisher}
                  title={journey.name}
                />
              </>
            )}
          </Stack>
          <Divider orientation="vertical" flexItem />
          {journey && (
            <EditableTitle
              text={journey.name}
              onSubmit={(val) => {
                updateJourney({
                  name: val,
                });
              }}
            />
          )}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            variant="outlined"
            size="small"
            onClick={handleOptionsDialogOpen}
          >
            Options
          </Button>
          <Divider orientation="vertical" flexItem />
          <SettingsMenu commands={settingsCommands} />
        </Stack>
      </Stack>
      <Box
        sx={{
          width: "100%",
          flex: 1,
          opacity: isJourneyQueryPending ? 0 : 1,
          transition: "opacity 0.3s ease-in-out",
        }}
      >
        {children}
      </Box>

      <Dialog
        open={optionsDialogOpen}
        onClose={handleOptionsDialogClose}
        maxWidth="md"
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          Journey Options
          <IconButton
            onClick={handleOptionsDialogClose}
            size="small"
            sx={{
              color: (t) => t.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={canRunMultiple}
                  onChange={(e) => handleChangeRunMultiple(e.target.checked)}
                  disabled={isJourneyMutationPending}
                />
              }
              label="Allow journey to run multiple times per user"
            />
          </Stack>
        </DialogContent>
      </Dialog>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        message={snackbarMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Stack>
  );
}
