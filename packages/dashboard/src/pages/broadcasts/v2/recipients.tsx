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

export default function BroadcastRecipientsPage() {
  return (
    <DashboardContent>
      <BroadcastLayout activeStepKey="recipients">
        <Typography>Recipients Page</Typography>
        {/* TODO: Implement segment selection component */}
        <Box sx={{ mt: 2 }}>
          <Link href="/segments/create" passHref legacyBehavior>
            <Button variant="contained" component="a">
              Create New Segment
            </Button>
          </Link>
        </Box>
      </BroadcastLayout>
    </DashboardContent>
  );
}
