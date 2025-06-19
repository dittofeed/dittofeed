import { Stack } from "@mui/material";
import { toBroadcastResource } from "backend-lib/src/broadcasts";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { toJourneyResource } from "backend-lib/src/journeys";
import { findMessageTemplates } from "backend-lib/src/messaging";
import { toSegmentResource } from "backend-lib/src/segments";
import { eq } from "drizzle-orm";
import {
  CompletionStatus,
  SavedSegmentResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";

import { SubtleHeader } from "../../../components/headers";
import { UserEventsTable } from "../../../components/userEventsTable";
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
    db().query.broadcast.findMany({
      where: eq(schema.broadcast.workspaceId, dfContext.workspace.id),
    }),
    db().query.journey.findMany({
      where: eq(schema.journey.workspaceId, dfContext.workspace.id),
    }),
    db().query.segment.findMany({
      where: eq(schema.segment.workspaceId, dfContext.workspace.id),
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
      <UserEventsTable userId={userId} />
    </UserLayout>
  );
};

export default UserEvents;
