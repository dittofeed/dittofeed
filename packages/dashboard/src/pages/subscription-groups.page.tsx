import { useTheme } from "@mui/material";
import { GetServerSideProps } from "next";
import React from "react";

import DashboardContent from "../components/dashboardContent";
import { SubscriptionGroupsTable } from "../components/subscriptionGroups/subscriptionGroupsTable";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { requestContext } from "../lib/requestContext";
import { PropsWithInitialState } from "../lib/types";

type SubscriptionGroupsProps = PropsWithInitialState;

export const getServerSideProps: GetServerSideProps<SubscriptionGroupsProps> =
  requestContext(async (_ctx, dfContext) => {
    return {
      props: addInitialStateToProps({
        props: {},
        dfContext,
      }),
    };
  });

export default function SubscriptionGroups() {
  const theme = useTheme();
  return (
    <DashboardContent>
      <SubscriptionGroupsTable sx={{ padding: theme.spacing(3) }} />
    </DashboardContent>
  );
}
