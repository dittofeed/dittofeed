import backendConfig from "backend-lib/src/config";
import {
  findAllEnrichedSegments,
  segmentHasBroadcast,
} from "backend-lib/src/segments";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";

import DashboardContent from "../../../components/dashboardContent";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { PropsWithInitialState } from "../../../lib/appStore";
import prisma from "../../../lib/prisma";
import { AppState } from "../../../lib/types";

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState
> = async () => {
  // Dynamically import to avoid transitively importing backend config at build time.

  const workspaceId = backendConfig().defaultWorkspaceId;
  const appState: Partial<AppState> = {};
  const [workspace, segments] = await Promise.all([
    prisma().workspace.findUnique({
      where: {
        id: workspaceId,
      },
    }),
    findAllEnrichedSegments(workspaceId),
  ]);
  if (segments.isOk()) {
    appState.segments = {
      type: CompletionStatus.Successful,
      value: segments.value.filter((s) => segmentHasBroadcast(s.definition)),
    };
  }
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

export default function Broadcast() {
  return <DashboardContent>broadcasts</DashboardContent>;
}
