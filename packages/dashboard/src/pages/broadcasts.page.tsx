import { Box, useTheme } from "@mui/material";
import { GetServerSideProps } from "next";
import React from "react";

import BroadcastsTable from "../components/broadcasts/indexTable";
import DashboardContent from "../components/dashboardContent";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { requestContext } from "../lib/requestContext";
import { PropsWithInitialState } from "../lib/types";

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
  const theme = useTheme();
  return (
    <DashboardContent>
      <Box sx={{ padding: theme.spacing(3), height: "100%", width: "100%" }}>
        <BroadcastsTable />
      </Box>
    </DashboardContent>
  );
}
