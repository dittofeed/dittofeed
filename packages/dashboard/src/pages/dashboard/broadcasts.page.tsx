import { ListItem, ListItemButton, ListItemText } from "@mui/material";
import backendConfig from "backend-lib/src/config";
import { BroadcastResource, CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Link from "next/link";

import DashboardContent from "../../components/dashboardContent";
import {
  ResourceList,
  ResourceListContainer,
  ResourceListItemButton,
} from "../../components/resourceList";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { PropsWithInitialState, useAppStore } from "../../lib/appStore";
import prisma from "../../lib/prisma";
import { AppState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState
> = async () => {
  // Dynamically import to avoid transitively importing backend config at build time.

  const workspaceId = backendConfig().defaultWorkspaceId;
  const appState: Partial<AppState> = {};
  const [workspace, broadcasts] = await Promise.all([
    prisma().workspace.findUnique({
      where: {
        id: workspaceId,
      },
    }),
    prisma().broadcast.findMany({
      where: {
        workspaceId,
      },
    }),
  ]);
  if (workspace) {
    appState.workspace = {
      type: CompletionStatus.Successful,
      value: workspace,
    };
  }

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
    props: addInitialStateToProps({}, appState),
  };
};

function BroadcastItem({ broadcast }: { broadcast: BroadcastResource }) {
  return (
    <ListItem>
      <ResourceListItemButton href={`/dashboard/broadcasts/${broadcast.id}`}>
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
        newItemHref={(newItemId) => `/dashboard/broadcasts/${newItemId}`}
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
