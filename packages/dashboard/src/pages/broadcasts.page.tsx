import { toBroadcastResource } from "backend-lib/src/broadcasts";
import { GetServerSideProps } from "next";

import BroadcastsTable from "../components/broadcastsTable";
import DashboardContent from "../components/dashboardContent";
import { ResourceListContainer } from "../components/resourceList";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import prisma from "../lib/prisma";
import { requestContext } from "../lib/requestContext";
import { AppState, PropsWithInitialState } from "../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const { workspace } = dfContext;

    const appState: Partial<AppState> = {};
    const broadcasts = await prisma().broadcast.findMany({
      where: {
        workspaceId: workspace.id,
      },
      orderBy: {
        createdAt: "desc",
      },
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
