import backendConfig from "backend-lib/src/config";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";

import DashboardContent from "../../components/dashboardContent";
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
  return <DashboardContent>broadcasts</DashboardContent>;
}
