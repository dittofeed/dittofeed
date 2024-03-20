import { toBroadcastResource } from "backend-lib/src/broadcasts";
import { toJourneyResource } from "backend-lib/src/journeys";
import { findMessageTemplates } from "backend-lib/src/messaging";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";

import DashboardContent from "../components/dashboardContent";
import { DeliveriesTable } from "../components/deliveriesTable";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import prisma from "../lib/prisma";
import { requestContext } from "../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const [messageTemplates, broadcasts, journeys] = await Promise.all([
      findMessageTemplates({
        workspaceId: dfContext.workspace.id,
      }),
      prisma().broadcast.findMany({
        where: {
          workspaceId: dfContext.workspace.id,
        },
      }),
      prisma().journey.findMany({
        where: {
          workspaceId: dfContext.workspace.id,
        },
      }),
    ]);
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
    };
    return {
      props: addInitialStateToProps({
        serverInitialState,
        props: {},
        dfContext,
      }),
    };
  });

export default function DeliveriesPage() {
  return (
    <DashboardContent>
      <DeliveriesTable />
    </DashboardContent>
  );
}
