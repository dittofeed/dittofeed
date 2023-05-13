import LoadingButton from "@mui/lab/LoadingButton";
import {
  Box,
  FormControl,
  InputLabel,
  ListItemButton,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { findManyJourneys } from "backend-lib/src/journeys";
import {
  findAllEnrichedSegments,
  segmentHasBroadcast,
  toSegmentResource,
} from "backend-lib/src/segments";
import { format } from "date-fns";
import { getSubscribedSegments } from "isomorphic-lib/src/journeys";
import {
  BroadcastResource,
  CompletionStatus,
  UpsertBroadcastResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useMemo } from "react";
import { validate } from "uuid";

import { BulletList, BulletListItem } from "../../components/bulletList";
import DashboardContent from "../../components/dashboardContent";
import EditableName from "../../components/editableName";
import InfoBox from "../../components/infoBox";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStore } from "../../lib/appStore";
import prisma from "../../lib/prisma";
import { requestContext } from "../../lib/requestContext";
import { AppState, PropsWithInitialState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const appState: Partial<AppState> = {};

    const id = ctx.params?.id;

    if (typeof id !== "string" || !validate(id)) {
      return {
        notFound: true,
      };
    }

    const workspaceId = dfContext.workspace.id;

    const [broadcast, segmentsResult, journeysResult] = await Promise.all([
      prisma().broadcast.findUnique({
        where: {
          id,
        },
      }),
      findAllEnrichedSegments(workspaceId),
      findManyJourneys({ where: { workspaceId } }),
    ]);

    if (broadcast) {
      appState.editedBroadcast = {
        workspaceId,
        id,
        name: broadcast.name,
        segmentId: broadcast.segmentId,
        createdAt: broadcast.createdAt.getTime(),
        triggeredAt: broadcast.triggeredAt?.getTime(),
      };
    } else {
      appState.editedBroadcast = {
        workspaceId,
        id,
        name: `Broadcast - ${id}`,
      };
    }

    if (segmentsResult.isOk()) {
      const segments = segmentsResult.value;
      const broadcastSegments = segments
        .filter((s) => segmentHasBroadcast(s.definition))
        .flatMap((s) => toSegmentResource(s).unwrapOr([]));

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
    return {
      props: addInitialStateToProps({
        serverInitialState: appState,
        props: {},
        dfContext,
      }),
    };
  });

export default function Broadcast() {
  const segmentsResult = useAppStore((store) => store.segments);
  const journeysResult = useAppStore((store) => store.journeys);
  const theme = useTheme();
  const path = useRouter();
  const broadcastUpdateRequest = useAppStore(
    (store) => store.broadcastUpdateRequest
  );
  const updateEditedBroadcast = useAppStore(
    (store) => store.updateEditedBroadcast
  );
  const editedBroadcast = useAppStore((store) => store.editedBroadcast);
  const setBroadcastUpdateRequest = useAppStore(
    (store) => store.setBroadcastUpdateRequest
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const upsertBroadcast = useAppStore((store) => store.upsertBroadcast);
  const id = typeof path.query.id === "string" ? path.query.id : undefined;

  const workspace = useAppStore((store) => store.workspace);
  const wasBroadcastCreated = editedBroadcast?.createdAt !== undefined;

  const handleSubmit = useMemo(() => {
    if (
      workspace.type !== CompletionStatus.Successful ||
      !id ||
      !editedBroadcast ||
      !editedBroadcast.segmentId?.length ||
      wasBroadcastCreated
    ) {
      return;
    }
    const broadcastResource: UpsertBroadcastResource = {
      workspaceId: workspace.value.id,
      name: editedBroadcast.name,
      id,
      segmentId: editedBroadcast.segmentId,
    };

    const broadcastName = editedBroadcast.name;

    return apiRequestHandlerFactory({
      request: broadcastUpdateRequest,
      setRequest: setBroadcastUpdateRequest,
      responseSchema: BroadcastResource,
      setResponse: (broadcast) => {
        upsertBroadcast(broadcast);
        updateEditedBroadcast(broadcast);
      },
      // TODO redirect on completion
      onSuccessNotice: `Submitted broadcast ${broadcastName}`,
      onFailureNoticeHandler: () =>
        `API Error: Failed to submit broadcast ${broadcastName}`,
      requestConfig: {
        method: "PUT",
        url: `${apiBase}/api/segments/broadcasts`,
        data: broadcastResource,
        headers: {
          "Content-Type": "application/json",
        },
      },
    });
  }, [
    apiBase,
    editedBroadcast,
    broadcastUpdateRequest,
    wasBroadcastCreated,
    id,
    updateEditedBroadcast,
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

  const formattedTriggeredAt = useMemo(() => {
    if (!editedBroadcast?.triggeredAt) {
      return null;
    }
    return format(new Date(editedBroadcast.triggeredAt), "EEE MMM d h:mm a");
  }, [editedBroadcast]);

  const receivingJourneys = useMemo(
    () =>
      journeys.filter(
        (j) =>
          editedBroadcast?.segmentId !== undefined &&
          getSubscribedSegments(j.definition).has(editedBroadcast.segmentId)
      ),
    [journeys, editedBroadcast]
  );

  if (!editedBroadcast) {
    return null;
  }

  const handleSegmentIdChange = (event: SelectChangeEvent) => {
    updateEditedBroadcast({ segmentId: event.target.value as string });
  };

  let receivingJourneysEls;

  if (receivingJourneys.length) {
    let title;

    if (editedBroadcast.triggeredAt) {
      title = (
        <Typography variant="h5">
          Journeys Which Received Broadcast At - {formattedTriggeredAt}
        </Typography>
      );
    } else {
      title = (
        <Typography variant="h5">Journeys Receiving Broadcast</Typography>
      );
    }
    receivingJourneysEls = (
      <Box sx={{ pl: 2 }}>
        {title}
        <BulletList>
          {receivingJourneys.map((j) => (
            <BulletListItem
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
                href={`/journeys/${j.id}`}
              >
                {j.name}
              </ListItemButton>
            </BulletListItem>
          ))}
        </BulletList>
      </Box>
    );
  } else if (editedBroadcast.segmentId?.length) {
    if (segments.length > 0) {
      receivingJourneysEls = (
        <InfoBox>
          There aren&apos;t any journeys which are subscribed to this segment.
          Create a journey with this segment to enable broadcasts.
        </InfoBox>
      );
    } else {
      receivingJourneysEls = (
        <InfoBox>
          There aren&apos;t any available segments to broadcast to. Add a
          broadcast node to a new or existing segment.
        </InfoBox>
      );
    }
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
        <Stack
          direction="row"
          sx={{ alignItems: "center", width: "100%" }}
          spacing={2}
        >
          <Typography variant="h4">
            {wasBroadcastCreated ? "Submitted Broadcast" : "Submit a Broadcast"}
          </Typography>
          <EditableName
            variant="h6"
            sx={{ minWidth: theme.spacing(52) }}
            name={editedBroadcast.name}
            disabled={wasBroadcastCreated}
            onChange={(e) => updateEditedBroadcast({ name: e.target.value })}
          />
        </Stack>
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
                value={editedBroadcast.segmentId ?? ""}
                disabled={segments.length === 0 || wasBroadcastCreated}
                label="Broadcast Segment"
                onChange={handleSegmentIdChange}
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
            disabled={receivingJourneys.length === 0 || wasBroadcastCreated}
            variant="contained"
          >
            Broadcast
          </LoadingButton>
        </Stack>
        {receivingJourneysEls}
      </Stack>
    </DashboardContent>
  );
}
