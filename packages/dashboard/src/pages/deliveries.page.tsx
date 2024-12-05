import { GetServerSideProps } from "next";

import DashboardContent from "../components/dashboardContent";
import { DeliveriesTable } from "../components/deliveriesTable";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { requestContext } from "../lib/requestContext";
import { PropsWithInitialState } from "../lib/types";
import { getDeliveriesData } from "./deliveries/getDeliveriesData";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    return {
      props: addInitialStateToProps({
        serverInitialState: await getDeliveriesData({
          workspaceId: dfContext.workspace.id,
        }),
        props: {},
        dfContext,
      }),
    };
  });

export default function DeliveriesPage() {
  return (
    <DashboardContent>
      <DeliveriesTable disableUserId />
    </DashboardContent>
  );
}
