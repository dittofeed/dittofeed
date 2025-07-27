import { Box } from "@mui/material";
import { GetServerSideProps } from "next";

import { AnalysisChart } from "../../components/analysisChart";
import DashboardContent from "../../components/dashboardContent";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { requestContext } from "../../lib/requestContext";
import { PropsWithInitialState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    return {
      props: addInitialStateToProps({
        serverInitialState: {},
        props: {},
        dfContext,
      }),
    };
  });

export default function AnalysisOverviewPage() {
  return (
    <DashboardContent>
      <Box sx={{ width: "100%", height: "100%", pl: 4, pr: 4, pt: 2 }}>
        <AnalysisChart />
      </Box>
    </DashboardContent>
  );
}
