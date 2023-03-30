import { Box, Button, Stack, Typography, useTheme } from "@mui/material";
import axios, { AxiosResponse } from "axios";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  JourneyResource,
  JourneyResourceStatus,
  UpsertJourneyResource,
} from "isomorphic-lib/src/types";
import { useRouter } from "next/router";

import EditableName from "../../../../components/editableName";
import InfoTooltip from "../../../../components/infoTooltip";
import JourneyLayout from "../../../../components/journeys/layout";
import apiRequestHandlerFactory from "../../../../lib/apiRequestHandlerFactory";
import { useAppStore } from "../../../../lib/appStore";
import {
  JourneyGetServerSideProps,
  journeyGetServerSideProps,
} from "./getServerSideProps";

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
const statusValues: Record<JourneyResourceStatus, StatusCopy> = {
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

function JourneyConfigure() {
  const path = useRouter();

  const id = typeof path.query.id === "string" ? path.query.id : undefined;
  const journeyUpdateRequest = useAppStore(
    (store) => store.journeyUpdateRequest
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const setJourneyUpdateRequest = useAppStore(
    (store) => store.setJourneyUpdateRequest
  );
  const upsertJourney = useAppStore((store) => store.upsertJourney);
  const journeyName = useAppStore((store) => store.journeyName);
  const setJourneyName = useAppStore((store) => store.setJourneyName);
  const journeys = useAppStore((store) => store.journeys);

  const journey =
    journeys.type === CompletionStatus.Successful
      ? journeys.value.find((j) => j.id === id) ?? null
      : null;

  const workspace = useAppStore((store) => store.workspace);
  const theme = useTheme();
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
  const journeyUpdate: UpsertJourneyResource = {
    id,
    workspaceId: workspace.value.id,
    status: statusValue.nextStatus,
  };

  const handleChangeStatus = apiRequestHandlerFactory({
    request: journeyUpdateRequest,
    setRequest: setJourneyUpdateRequest,
    responseSchema: JourneyResource,
    setResponse: upsertJourney,
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
  });

  return (
    <JourneyLayout journeyId={id}>
      <Stack direction="column" sx={{ padding: 2 }} spacing={3}>
        <EditableName
          name={journeyName}
          onChange={(e) => setJourneyName(e.target.value)}
        />
        <InfoTooltip title={statusValue.currentDescription}>
          <Typography variant="h5">Status: {statusValue.label}</Typography>
        </InfoTooltip>
        <Box sx={{ width: theme.spacing(25) }}>
          <InfoTooltip title={statusValue.nextDescription}>
            <Button
              variant="contained"
              disabled={statusValue.disabled}
              onClick={handleChangeStatus}
            >
              {statusValue.nextStatusLabel}
            </Button>
          </InfoTooltip>
        </Box>
      </Stack>
    </JourneyLayout>
  );
}
export default JourneyConfigure;
