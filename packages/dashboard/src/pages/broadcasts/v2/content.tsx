import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { GetServerSideProps } from "next";
import Link from "next/link";
import React from "react";

import DashboardContent from "../../../components/dashboardContent";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { PropsWithInitialState } from "../../../lib/types";
import BroadcastLayout from "./broadcastLayout";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    return {
      props: addInitialStateToProps({
        dfContext,
        props: {},
      }),
    };
  });

export default function BroadcastContentPage() {
  return (
    <DashboardContent>
      <BroadcastLayout activeStepKey="content">
        <Typography>Content Page</Typography>
        {/* TODO: Implement template selection component */}
        <Box sx={{ mt: 2 }}>
          <Link href="/templates/create" passHref legacyBehavior>
            <Button variant="contained" component="a">
              Create New Template
            </Button>
          </Link>
        </Box>
      </BroadcastLayout>
    </DashboardContent>
  );
}
