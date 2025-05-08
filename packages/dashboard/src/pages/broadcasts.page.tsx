import React from "react";

import DashboardContent from "../components/dashboardContent";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { requestContext } from "../lib/requestContext";
import { PropsWithInitialState } from "../lib/types";
import BroadcastsTable from "../components/broadcasts/indexTable";
import { GetServerSideProps } from "next";

// Remove specific props, data will be loaded by the hook
type BroadcastsProps = PropsWithInitialState;

export const getServerSideProps: GetServerSideProps<BroadcastsProps> =
  requestContext(async (_ctx, dfContext) => {
    return {
      props: addInitialStateToProps({
        // Minimal props, no initial server state needed for broadcasts
        props: {},
        dfContext,
      }),
    };
  });

export default function Broadcasts() {
  return (
    <DashboardContent>
      <BroadcastsTable />
    </DashboardContent>
  );
}
