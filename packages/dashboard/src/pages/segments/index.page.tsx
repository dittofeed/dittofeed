import { useTheme } from "@mui/material";
import { GetServerSideProps } from "next";
import React from "react";

import DashboardContent from "../../components/dashboardContent";
import SegmentsList from "../../components/segments/segmentsTable";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { requestContext } from "../../lib/requestContext";
import { PropsWithInitialState } from "../../lib/types";

type SegmentsProps = PropsWithInitialState;

export const getServerSideProps: GetServerSideProps<SegmentsProps> =
  requestContext(async (_ctx, dfContext) => {
    return {
      props: addInitialStateToProps({
        props: {},
        dfContext,
      }),
    };
  });

export default function SegmentList() {
  const theme = useTheme();
  return (
    <DashboardContent>
      <SegmentsList sx={{ padding: theme.spacing(3) }} />
    </DashboardContent>
  );
}
