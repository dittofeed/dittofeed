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
  JourneyResource,
  JourneyResourceStatus,
  UpsertJourneyResource,
  WorkspaceMemberResource,
} from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import { useState } from "react";

import { DeliveriesTable } from "../../../components/deliveriesTable";
import EditableName from "../../../components/editableName";
import { SubtleHeader } from "../../../components/headers";
import InfoBox from "../../../components/infoBox";
import InfoTooltip from "../../../components/infoTooltip";
import JourneyLayout from "../../../components/journeys/layout";
import apiRequestHandlerFactory from "../../../lib/apiRequestHandlerFactory";
import { useAppStore } from "../../../lib/appStore";
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
  const journeyUpdateRequest = useAppStore(
    (store) => store.journeyUpdateRequest,
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const setJourneyUpdateRequest = useAppStore(
    (store) => store.setJourneyUpdateRequest,
  );
  const upsertJourney = useAppStore((store) => store.upsertJourney);
  const journeyName = useAppStore((store) => store.journeyName);
  const setJourneyName = useAppStore((store) => store.setJourneyName);
  const journeys = useAppStore((store) => store.journeys);
  const workspace = useAppStore((store) => store.workspace);
  const member = useAppStore((store) => store.member);

  const journey =
    journeys.type === CompletionStatus.Successful
      ? journeys.value.find((j) => j.id === id) ?? null
      : null;

  const [canRunMultiple, setCanRunMultiple] = useState(
    !!journey?.canRunMultiple,
  );

  if (journey?.status === "Broadcast") {
    throw new Error("Broadcast journeys cannot be configured.");
  }
  const statusValue: StatusCopy = !journey
    ? {
        label: "Unsaved",
        disabled: true,
        currentDescription: "This journey is both unsaved, and not started.",
        nextStatusLabel: "Disabled",
        nextDescription: "Save this journey in order to progress.",
      }
    : statusValues[journey.status];

  if (!id || workspace.type !== CompletionStatus.Successful) {
    return null;
  }

  const handleChangeStatus = () => {
    const journeyUpdate: UpsertJourneyResource = {
      id,
      workspaceId: workspace.value.id,
      status: statusValue.nextStatus,
    };
    apiRequestHandlerFactory({
      request: journeyUpdateRequest,
      setRequest: setJourneyUpdateRequest,
      responseSchema: JourneyResource,
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
      workspaceId: workspace.value.id,
      canRunMultiple: newValue,
    };
    apiRequestHandlerFactory({
      request: journeyUpdateRequest,
      setRequest: setJourneyUpdateRequest,
      responseSchema: JourneyResource,
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
        <EditableName
          name={journeyName}
          onChange={(e) => setJourneyName(e.target.value)}
        />
        <SubtleHeader>Can Be Run Multiple Times</SubtleHeader>
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
        {journey?.status !== "NotStarted" && (
          <Stack sx={{ flex: 1, width: "100%" }} spacing={1}>
            <SubtleHeader>Deliveries</SubtleHeader>
            <DeliveriesTable journeyId={id} />
          </Stack>
        )}
      </Stack>
    </JourneyLayout>
  );
}
export default JourneyConfigure;
