import backendConfig from "backend-lib/src/config";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useMemo } from "react";
import { v4 as uuid } from "uuid";

import DashboardContent from "../../components/dashboardContent";
import { ResourceList } from "../../components/resourceList";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { PropsWithInitialState } from "../../lib/appStore";
import prisma from "../../lib/prisma";
import { AppState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState
> = async () => {
  // Dynamically import to avoid transitively importing backend config at build time.

  const workspaceId = backendConfig().defaultWorkspaceId;
  const appState: Partial<AppState> = {};
  const workspace = await prisma().workspace.findUnique({
    where: {
      id: workspaceId,
    },
  });
  if (workspace) {
    appState.workspace = {
      type: CompletionStatus.Successful,
      value: workspace,
    };
  }
  return {
    props: addInitialStateToProps({}, {}),
  };
};

export default function Broadcasts() {
  const newItemId = useMemo(() => uuid(), []);
  return (
    <DashboardContent>
      <ResourceList
        title="Broadcasts"
        newItemHref={`/dashboard/broadcasts/${newItemId}`}
      >
        items
      </ResourceList>
    </DashboardContent>
  );
}
