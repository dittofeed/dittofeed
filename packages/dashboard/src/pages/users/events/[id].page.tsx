import { Stack } from "@mui/material";
import { toBroadcastResource } from "backend-lib/src/broadcasts";
import { toJourneyResource } from "backend-lib/src/journeys";
import logger from "backend-lib/src/logger";
import { findMessageTemplates } from "backend-lib/src/messaging";
import prisma from "backend-lib/src/prisma";
import { getUsers } from "backend-lib/src/users";
import { CompletionStatus, GetUsersResponse } from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";

import DashboardContent from "../../../components/dashboardContent";
import { EventsTable } from "../../../components/eventsTable";
import { SubtleHeader } from "../../../components/headers";
import { UserTabs } from "../../../components/UserTabs";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../../lib/types";

interface UserEventsPageProps {
  user: GetUsersResponse["users"][0];
}

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState<UserEventsPageProps>
> = requestContext(async (ctx, dfContext) => {
  const userId = ctx.query.id;
  if (typeof userId !== "string") {
    return { notFound: true };
  }

  const [usersResult, messageTemplates, broadcasts, journeys, segments] =
    await Promise.all([
      getUsers({
        workspaceId: dfContext.workspace.id,
        userIds: [userId],
      }),
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

  if (usersResult.isErr()) {
    logger().error({ err: usersResult.error }, "Unable to retrieve user");
    throw new Error("Unable to retrieve user");
  }

  const [user] = usersResult.value.users;

  if (!user) {
    return { notFound: true };
  }

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
      value: segments,
    },
  };

  return {
    props: addInitialStateToProps({
      serverInitialState,
      dfContext,
      props: { user },
    }),
  };
});

const UserEvents: NextPage<UserEventsPageProps> = function UserEvents(props) {
  const { user } = props;

  return (
    <DashboardContent>
      <UserTabs userId={user.id} />
      <Stack spacing={2} sx={{ padding: 2, width: "100%" }}>
        <SubtleHeader>Events</SubtleHeader>
        <EventsTable userId={user.id} />
      </Stack>
    </DashboardContent>
  );
};

export default UserEvents;
