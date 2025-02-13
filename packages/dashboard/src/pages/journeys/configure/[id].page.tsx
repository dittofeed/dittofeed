import { DittofeedSdk as sdk } from "@dittofeed/sdk-web";
import {
  Box,
  Button,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import {
  CompletionStatus,
  JourneyDefinition,
  JourneyResourceStatus,
  SavedJourneyResource,
  UpsertJourneyResource,
  WorkspaceMemberResource,
} from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import {
  DEFAULT_ALLOWED_COLUMNS,
  DEFAULT_DELIVERIES_TABLE_V2_PROPS,
  DeliveriesTableV2,
} from "../../../components/deliveriesTableV2";
import { EditableTitle } from "../../../components/editableName/v2";
import { SubtleHeader } from "../../../components/headers";
import InfoBox from "../../../components/infoBox";
import InfoTooltip from "../../../components/infoTooltip";
import { getGlobalJourneyErrors } from "../../../components/journeys/globalJourneyErrors";
import JourneyLayout from "../../../components/journeys/layout";
import { journeyDefinitionFromState } from "../../../components/journeys/store";
import apiRequestHandlerFactory from "../../../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../../../lib/appStore";
import { JOURNEY_STATUS_CHANGE_EVENT } from "../../../lib/constants";
import {
  JourneyGetServerSideProps,
  journeyGetServerSideProps,
} from "../getServerSideProps";

export const getServerSideProps: JourneyGetServerSideProps = (ctx) =>
  journeyGetServerSideProps(ctx);

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

function JourneyConfigure() {
  const path = useRouter();

  const id = typeof path.query.id === "string" ? path.query.id : undefined;
  const {
    journeyUpdateRequest,
    apiBase,
    setJourneyUpdateRequest,
    upsertJourney,
    journeyName,
    setJourneyName,
    journeys,
    workspace,
    member,
    journeyNodes,
    journeyEdges,
    journeyNodesIndex,
    segments: segmentsResult,
  } = useAppStorePick([
    "journeyUpdateRequest",
    "apiBase",
    "segments",
    "setJourneyUpdateRequest",
    "upsertJourney",
    "journeyName",
    "setJourneyName",
    "journeys",
    "workspace",
    "member",
    "journeyNodes",
    "journeyEdges",
    "journeyNodesIndex",
  ]);

  const segments = useMemo(
    () =>
      segmentsResult.type === CompletionStatus.Successful
        ? segmentsResult.value
        : [],
    [segmentsResult],
  );

  const journey =
    journeys.type === CompletionStatus.Successful
      ? journeys.value.find((j) => j.id === id) ?? null
      : null;

  const [canRunMultiple, setCanRunMultiple] = useState(
    !!journey?.canRunMultiple,
  );

  if (!journey) {
    throw new Error("Journey not found.");
  }

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

  if (!id || workspace.type !== CompletionStatus.Successful) {
    return null;
  }

  const handleChangeStatus = () => {
    const definition =
      definitionFromState && statusValue.nextStatus === "Running"
        ? definitionFromState
        : undefined;

    const journeyUpdate: UpsertJourneyResource = {
      id,
      workspaceId: workspace.value.id,
      name: journeyName,
      definition,
      status: statusValue.nextStatus,
    };
    apiRequestHandlerFactory({
      request: journeyUpdateRequest,
      setRequest: setJourneyUpdateRequest,
      responseSchema: SavedJourneyResource,
      setResponse: (response) => {
        upsertJourney(response);
        if (member) {
          trackStatusChange({
            journeyId: id,
            member,
            status: response.status,
          });
        }
      },
      onSuccessNotice: `Updated status for journey ${journeyName} to ${statusValue.nextStatus}.`,
      onFailureNoticeHandler: () =>
        `API Error: Failed to update status for journey ${journeyName} to ${statusValue.nextStatus}.`,
      requestConfig: {
        method: "PUT",
        url: `${apiBase}/api/journeys`,
        data: journeyUpdate,
        headers: {
          "Content-Type": "application/json",
        },
      },
    })();
  };
  const handleChangeRunMultiple = (newValue: boolean) => {
    const previousValue = canRunMultiple;
    setCanRunMultiple(newValue);

    const journeyUpdate: UpsertJourneyResource = {
      id,
      name: journeyName,
      workspaceId: workspace.value.id,
      canRunMultiple: newValue,
    };
    apiRequestHandlerFactory({
      request: journeyUpdateRequest,
      setRequest: setJourneyUpdateRequest,
      responseSchema: SavedJourneyResource,
      setResponse: upsertJourney,
      onFailure: () => {
        setCanRunMultiple(previousValue);
      },
      onSuccessNotice: newValue
        ? `Journey ${journeyName} can now run multiple times.`
        : `Journey ${journeyName} can now only run once.`,
      onFailureNoticeHandler: () =>
        `API Error: Failed to update journey ${journeyName} to ${statusValue.nextStatus}.`,
      requestConfig: {
        method: "PUT",
        url: `${apiBase}/api/journeys`,
        data: journeyUpdate,
        headers: {
          "Content-Type": "application/json",
        },
      },
    })();
  };

  return (
    <JourneyLayout journeyId={id}>
      <Stack
        direction="column"
        sx={{ padding: 2, height: "100%", width: "100%" }}
        id="journey-configure"
        spacing={3}
      >
        <EditableTitle
          text={journeyName}
          onSubmit={(val) => {
            apiRequestHandlerFactory({
              request: journeyUpdateRequest,
              setRequest: setJourneyUpdateRequest,
              responseSchema: SavedJourneyResource,
              setResponse: upsertJourney,
              onSuccessNotice: "Journey name updated.",
              onFailureNoticeHandler: () =>
                "API Error: Failed to update journey name",
              requestConfig: {
                method: "PUT",
                url: `${apiBase}/api/journeys`,
                data: {
                  id,
                  workspaceId: workspace.value.id,
                  name: val,
                } satisfies UpsertJourneyResource,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            })();
            setJourneyName(val);
          }}
        />
        <SubtleHeader>Can Be Run Multiple Times</SubtleHeader>
        <Box>
          <FormControlLabel
            control={
              <Switch
                checked={canRunMultiple}
                onChange={(e) => handleChangeRunMultiple(e.target.checked)}
              />
            }
            label={
              canRunMultiple
                ? "Journey can run multiple times per user."
                : "Journey can only run once per user."
            }
          />
        </Box>
        <SubtleHeader>Journey Status</SubtleHeader>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h5">{statusValue.label}</Typography>
          <InfoTooltip title={statusValue.nextDescription}>
            <Button
              variant="contained"
              disabled={statusValue.disabled}
              onClick={handleChangeStatus}
            >
              {statusValue.nextStatusLabel}
            </Button>
          </InfoTooltip>
        </Stack>
        <Box sx={{ width: "fit-content" }}>
          <InfoBox>{statusValue.currentDescription}</InfoBox>
        </Box>
        {journey.status !== "NotStarted" && (
          <Stack sx={{ flex: 1, width: "100%" }} spacing={1}>
            <SubtleHeader>Deliveries</SubtleHeader>
            <DeliveriesTableV2
              {...DEFAULT_DELIVERIES_TABLE_V2_PROPS}
              columnAllowList={DEFAULT_ALLOWED_COLUMNS.filter(
                (c) => c !== "origin",
              )}
              journeyId={id}
            />
          </Stack>
        )}
      </Stack>
    </JourneyLayout>
  );
}
export default JourneyConfigure;
