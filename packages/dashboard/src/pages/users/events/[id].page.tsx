import { Stack } from "@mui/material";
import { toBroadcastResource } from "backend-lib/src/broadcasts";
import { toJourneyResource } from "backend-lib/src/journeys";
import { findMessageTemplates } from "backend-lib/src/messaging";
import prisma from "backend-lib/src/prisma";
import { toSegmentResource } from "backend-lib/src/segments";
import {
  CompletionStatus,
  SavedSegmentResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";
import React from "react";

import { EventsTable } from "../../../components/eventsTable";
import { SubtleHeader } from "../../../components/headers";
import { UserLayout } from "../../../components/userLayout";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../../lib/types";

interface UserEventsPageProps {
  userId: string;
}

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState<UserEventsPageProps>
> = requestContext(async (ctx, dfContext) => {
  const userId = ctx.query.id;
  if (typeof userId !== "string") {
    return { notFound: true };
  }

  const [messageTemplates, broadcasts, journeys, segments] = await Promise.all([
    findMessageTemplates({
      workspaceId: dfContext.workspace.id,
    }),
    prisma().broadcast.findMany({
      where: {
        workspaceId: dfContext.workspace.id,
      },
    }),
    prisma().journey.findMany({
      where: {
        workspaceId: dfContext.workspace.id,
      },
    }),
    prisma().segment.findMany({
      where: {
        workspaceId: dfContext.workspace.id,
      },
    }),
  ]);

  const segmentResources: SavedSegmentResource[] = segments.flatMap((segment) =>
    toSegmentResource(segment).unwrapOr([]),
  );

  const serverInitialState: PreloadedState = {
    messages: {
      type: CompletionStatus.Successful,
      value: messageTemplates,
    },
    broadcasts: broadcasts.map(toBroadcastResource),
    journeys: {
      type: CompletionStatus.Successful,
      value: journeys.flatMap((j) => toJourneyResource(j).unwrapOr([])),
    },
    segments: {
      type: CompletionStatus.Successful,
      value: segmentResources,
    },
  };

  return {
    props: addInitialStateToProps({
      serverInitialState,
      dfContext,
      props: { userId },
    }),
  };
});

const UserEvents: NextPage<UserEventsPageProps> = function UserEvents({
  userId,
}) {
  return (
    <UserLayout userId={userId}>
      <Stack spacing={2} sx={{ padding: 2, width: "100%", height: "100%" }}>
        <SubtleHeader>Events</SubtleHeader>
        <EventsTable userId={userId} />
      </Stack>
    </UserLayout>
  );
};

export default UserEvents;
