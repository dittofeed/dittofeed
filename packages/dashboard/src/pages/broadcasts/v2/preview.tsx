import Typography from "@mui/material/Typography";
import { GetServerSideProps } from "next";
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

export default function BroadcastPreviewPage() {
  return (
    <DashboardContent>
      <BroadcastLayout activeStepKey="preview">
        <Typography>Preview Page</Typography>
      </BroadcastLayout>
    </DashboardContent>
  );
}
