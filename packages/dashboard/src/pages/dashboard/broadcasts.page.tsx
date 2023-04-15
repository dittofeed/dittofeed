import { ListItem, ListItemButton } from "@mui/material";
import backendConfig from "backend-lib/src/config";
import { BroadcastResource, CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useMemo } from "react";
import { v4 as uuid } from "uuid";

import DashboardContent from "../../components/dashboardContent";
import {
  ResourceList,
  ResourceListContainer,
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

  console.log({ broadcasts });
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
  // xt-dev.js:20 Warning: Prop `href` did not match. Server: "/dashboard/broadcasts/63f6a26e-30e7-4a3a-b463-fc3c7f68b594" Client: "/dashboard/broadcasts/a5c53620-1539-4c87-a063-2fe3d27957e3"

  return (
    <ListItem divider>
      <ListItemButton
        LinkComponent={Link}
        href={`/dashboard/broadcasts/${broadcast.id}`}
      >
        {broadcast.name}
      </ListItemButton>
    </ListItem>
  );
}

export default function Broadcasts() {
  const newItemId = useMemo(() => uuid(), []);
  const broadcastsResult = useAppStore((store) => store.broadcasts);
  const broadcasts =
    broadcastsResult.type === CompletionStatus.Successful
      ? broadcastsResult.value
      : [];

  return (
    <DashboardContent>
      <ResourceListContainer
        title="Broadcasts"
        newItemHref={`/dashboard/broadcasts/${newItemId}`}
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
