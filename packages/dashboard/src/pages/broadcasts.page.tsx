import { toBroadcastResource } from "backend-lib/src/broadcasts";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { eq } from "drizzle-orm";
import { GetServerSideProps } from "next";

import BroadcastsTable from "../components/broadcastsTable";
import DashboardContent from "../components/dashboardContent";
import { ResourceListContainer } from "../components/resourceList";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { requestContext } from "../lib/requestContext";
import { AppState, PropsWithInitialState } from "../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const { workspace } = dfContext;

    const appState: Partial<AppState> = {};
    const broadcasts = await db().query.broadcast.findMany({
      where: eq(schema.broadcast.workspaceId, workspace.id),
      orderBy: (broadcast, { desc }) => [desc(broadcast.createdAt)],
    });

    appState.broadcasts = broadcasts.map(toBroadcastResource);

    return {
      props: addInitialStateToProps({
        props: {},
        serverInitialState: appState,
        dfContext,
      }),
    };
  });

export default function Broadcasts() {
  return (
    <DashboardContent>
      <ResourceListContainer
        title="Broadcasts"
        titleSingular="Broadcast"
        newItemHref={(newItemId) => `/broadcasts/segment/${newItemId}`}
      >
        <BroadcastsTable />
      </ResourceListContainer>
    </DashboardContent>
  );
}
