import { ListItem, ListItemText } from "@mui/material";
import { BroadcastResource, CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";

import DashboardContent from "../components/dashboardContent";
import {
  ResourceList,
  ResourceListContainer,
  ResourceListItemButton,
} from "../components/resourceList";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { useAppStore } from "../lib/appStore";
import prisma from "../lib/prisma";
import { requestContext } from "../lib/requestContext";
import { AppState, PropsWithInitialState } from "../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    // Dynamically import to avoid transitively importing backend config at build time.
    const { workspace } = dfContext;

    const appState: Partial<AppState> = {};
    const broadcasts = await prisma().broadcast.findMany({
      where: {
        workspaceId: workspace.id,
      },
    });

    appState.broadcasts = {
      type: CompletionStatus.Successful,
      value: broadcasts.map((b) => ({
        id: b.id,
        name: b.name,
        workspaceId: b.workspaceId,
        triggeredAt: b.triggeredAt?.getTime(),
        createdAt: b.createdAt.getTime(),
        segmentId: b.segmentId,
      })),
    };
    return {
      props: addInitialStateToProps({
        props: {},
        serverInitialState: appState,
        dfContext,
      }),
    };
  });

function BroadcastItem({ broadcast }: { broadcast: BroadcastResource }) {
  return (
    <ListItem>
      <ResourceListItemButton href={`/broadcasts/${broadcast.id}`}>
        <ListItemText>{broadcast.name}</ListItemText>
      </ResourceListItemButton>
    </ListItem>
  );
}

export default function Broadcasts() {
  const broadcastsResult = useAppStore((store) => store.broadcasts);
  const broadcasts =
    broadcastsResult.type === CompletionStatus.Successful
      ? broadcastsResult.value
      : [];

  return (
    <DashboardContent>
      <ResourceListContainer
        title="Broadcasts"
        newItemHref={(newItemId) => `/broadcasts/${newItemId}`}
      >
        {broadcasts.length ? (
          <ResourceList>
            {broadcasts.map((broadcast) => (
              <BroadcastItem key={broadcast.id} broadcast={broadcast} />
            ))}
          </ResourceList>
        ) : null}
      </ResourceListContainer>
    </DashboardContent>
  );
}
