import { LoadingButton } from "@mui/lab";
import {
  Box,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import backendConfig from "backend-lib/src/config";
import { findManyJourneys } from "backend-lib/src/journeys";
import {
  findAllEnrichedSegments,
  segmentHasBroadcast,
} from "backend-lib/src/segments";
import { getSubscribedSegments } from "isomorphic-lib/src/journeys";
import { BroadcastResource, CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useMemo } from "react";

import DashboardContent from "../../../components/dashboardContent";
import InfoBox from "../../../components/infoBox";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../../../lib/apiRequestHandlerFactory";
import { PropsWithInitialState, useAppStore } from "../../../lib/appStore";
import prisma from "../../../lib/prisma";
import { AppState } from "../../../lib/types";

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState
> = async () => {
  // Dynamically import to avoid transitively importing backend config at build time.

  const workspaceId = backendConfig().defaultWorkspaceId;
  const appState: Partial<AppState> = {};
  const [workspace, segmentsResult, journeysResult] = await Promise.all([
    prisma().workspace.findUnique({
      where: {
        id: workspaceId,
      },
    }),
    findAllEnrichedSegments(workspaceId),
    findManyJourneys({ where: { workspaceId } }),
  ]);
  if (segmentsResult.isOk()) {
    const segments = segmentsResult.value;
    const broadcastSegments = segments.filter((s) =>
      segmentHasBroadcast(s.definition)
    );
    appState.segments = {
      type: CompletionStatus.Successful,
      value: broadcastSegments,
    };

    if (journeysResult.isOk()) {
      const journeysWithBroadcast = journeysResult.value.filter((j) => {
        const subscribedSegments = getSubscribedSegments(j.definition);
        for (const broadcastSegment of broadcastSegments) {
          if (subscribedSegments.has(broadcastSegment.id)) {
            return true;
          }
        }

        return false;
      });

      appState.journeys = {
        type: CompletionStatus.Successful,
        value: journeysWithBroadcast,
      };
    }
  }
  if (workspace) {
    appState.workspace = {
      type: CompletionStatus.Successful,
      value: workspace,
    };
  }
  return {
    props: addInitialStateToProps({}, appState),
  };
};

export default function Broadcast() {
  const segmentsResult = useAppStore((store) => store.segments);
  const journeysResult = useAppStore((store) => store.journeys);
  const path = useRouter();
  const broadcastUpdateRequest = useAppStore(
    (store) => store.broadcastUpdateRequest
  );
  const setBroadcastUpdateRequest = useAppStore(
    (store) => store.setBroadcastUpdateRequest
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const upsertBroadcast = useAppStore((store) => store.upsertBroadcast);
  const [segmentId, setSegmentId] = React.useState("");
  const [broadcastName, setBroadcastName] = React.useState("");
  const workspace = useAppStore((store) => store.workspace);
  const id = typeof path.query.id === "string" ? path.query.id : undefined;

  const handleSubmit = useMemo(() => {
    if (
      workspace.type !== CompletionStatus.Successful ||
      !id ||
      !segmentId.length
    ) {
      return;
    }
    const broadcastResource: BroadcastResource = {
      workspaceId: workspace.value.id,
      name: broadcastName,
      segmentId,
      id,
    };

    return apiRequestHandlerFactory({
      request: broadcastUpdateRequest,
      setRequest: setBroadcastUpdateRequest,
      responseSchema: BroadcastResource,
      setResponse: upsertBroadcast,
      // FIXME redirect on completion
      onSuccessNotice: `Submitted broadcast ${broadcastName}`,
      onFailureNoticeHandler: () =>
        `API Error: Failed to submit broadcast ${broadcastName}`,
      requestConfig: {
        method: "PUT",
        url: `${apiBase}/api/segments/broadcast`,
        data: broadcastResource,
        headers: {
          "Content-Type": "application/json",
        },
      },
    });
  }, [
    apiBase,
    broadcastName,
    broadcastUpdateRequest,
    id,
    segmentId,
    setBroadcastUpdateRequest,
    upsertBroadcast,
    workspace,
  ]);

  const segments =
    segmentsResult.type === CompletionStatus.Successful
      ? segmentsResult.value
      : [];

  const journeys = useMemo(
    () =>
      journeysResult.type === CompletionStatus.Successful
        ? journeysResult.value
        : [],
    [journeysResult]
  );

  const receivingJourneys = useMemo(
    () =>
      journeys.filter((j) =>
        getSubscribedSegments(j.definition).has(segmentId)
      ),
    [journeys, segmentId]
  );

  const handleChange = (event: SelectChangeEvent) => {
    setSegmentId(event.target.value as string);
  };

  let receivingJourneysEls;

  if (receivingJourneys.length) {
    receivingJourneysEls = (
      <List sx={{ listStyleType: "disc" }}>
        {receivingJourneys.map((j) => (
          <ListItem
            key={j.id}
            sx={{
              display: "list-item",
            }}
          >
            <ListItemButton
              sx={{
                color: "inherit",
                textDecoration: "none",
              }}
              component={Link}
              href={`/dashboard/journeys/${j.id}`}
            >
              {j.name}
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    );
  } else if (segmentId.length > 0) {
    receivingJourneysEls = (
      <InfoBox>
        There aren&apos;t any journeys which are subscribed to this segment.
        Create a journey with this segment to enable broadcasts.
      </InfoBox>
    );
  } else {
    receivingJourneysEls = null;
  }

  return (
    <DashboardContent>
      <Stack
        direction="column"
        sx={{ width: "100%", height: "100%", padding: 2, alignItems: "start" }}
        spacing={3}
      >
        <Typography variant="h4">Create Broadcast</Typography>
        <InfoBox>
          Broadcast to a Segment. Broadcasts are a way to manually trigger
          journeys which have a given segment as their entry criteria.
        </InfoBox>
        <Stack
          direction="row"
          alignItems="center"
          spacing={4}
          sx={{ width: "100%" }}
        >
          <Box sx={{ minWidth: "30%" }}>
            <FormControl fullWidth>
              <InputLabel>Broadcast Segment</InputLabel>
              <Select
                value={segmentId}
                label="Broadcast Segment"
                onChange={handleChange}
              >
                {segments.map((s) => (
                  <MenuItem value={s.id} key={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <LoadingButton
            onClick={handleSubmit}
            loading={
              broadcastUpdateRequest.type === CompletionStatus.InProgress
            }
            disabled={receivingJourneys.length === 0}
            variant="contained"
          >
            Broadcast
          </LoadingButton>
        </Stack>
        <Box sx={{ pl: 2 }}>
          <Typography variant="h5">Journeys Receiving Broadcast</Typography>
          {receivingJourneysEls}
        </Box>
      </Stack>
    </DashboardContent>
  );
}
