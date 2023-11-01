import { GetServerSideProps } from "next";

import DashboardContent from "../components/dashboardContent";
import { DeliveriesTable } from "../components/deliveriesTable";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { requestContext } from "../lib/requestContext";
import { PropsWithInitialState } from "../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => ({
    props: addInitialStateToProps({
      serverInitialState: {},
      props: {},
      dfContext,
    }),
  }));

export default function DeliveriesPage() {
  return (
    <DashboardContent>
      <DeliveriesTable />
    </DashboardContent>
  );
}
