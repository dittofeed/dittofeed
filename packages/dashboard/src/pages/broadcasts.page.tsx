import { ListItem, ListItemText } from "@mui/material";
import { toBroadcastResource } from "backend-lib/src/broadcasts";
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

    appState.broadcasts = {
      type: CompletionStatus.Successful,
      value: broadcasts.map(toBroadcastResource),
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
      <ResourceListItemButton
        href={`/dashboard/broadcasts/review/${broadcast.id}`}
      >
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
        newItemHref={(newItemId) => `/broadcasts/segment/${newItemId}`}
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
