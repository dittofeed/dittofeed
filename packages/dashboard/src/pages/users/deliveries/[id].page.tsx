import { Stack } from "@mui/material";
import { toBroadcastResource } from "backend-lib/src/broadcasts";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { toJourneyResource } from "backend-lib/src/journeys";
import logger from "backend-lib/src/logger";
import { findMessageTemplates } from "backend-lib/src/messaging";
import { getUsers } from "backend-lib/src/users";
import { eq } from "drizzle-orm";
import { CompletionStatus, GetUsersResponse } from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";

import { DeliveriesTable } from "../../../components/deliveriesTable";
import { SubtleHeader } from "../../../components/headers";
import { UserLayout } from "../../../components/userLayout";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../../lib/types";

interface UserDeliveriesPageProps {
  user: GetUsersResponse["users"][0];
}

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState<UserDeliveriesPageProps>
> = requestContext(async (ctx, dfContext) => {
  const userId = ctx.query.id;
  if (typeof userId !== "string") {
    return { notFound: true };
  }

  const [usersResult, messageTemplates, broadcasts, journeys] =
    await Promise.all([
      getUsers({
        workspaceId: dfContext.workspace.id,
        userIds: [userId],
      }),
      findMessageTemplates({
        workspaceId: dfContext.workspace.id,
      }),
      db().query.broadcast.findMany({
        where: eq(schema.broadcast.workspaceId, dfContext.workspace.id),
      }),
      db().query.journey.findMany({
        where: eq(schema.journey.workspaceId, dfContext.workspace.id),
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
  };

  return {
    props: addInitialStateToProps({
      serverInitialState,
      dfContext,
      props: { user },
    }),
  };
});

const UserDeliveries: NextPage<UserDeliveriesPageProps> =
  function UserDeliveries(props) {
    const { user } = props;

    return (
      <UserLayout userId={user.id}>
        <Stack spacing={2} sx={{ padding: 2, width: "100%", height: "100%" }}>
          <SubtleHeader>Deliveries</SubtleHeader>
          <DeliveriesTable userId={user.id} />
        </Stack>
      </UserLayout>
    );
  };

export default UserDeliveries;
