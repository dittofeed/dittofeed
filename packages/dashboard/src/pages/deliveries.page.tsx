import { Box } from "@mui/material";
import { GetServerSideProps } from "next";

import DashboardContent from "../components/dashboardContent";
import {
  DEFAULT_DELIVERIES_TABLE_V2_PROPS,
  DeliveriesTableV2,
} from "../components/deliveriesTableV2";
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
      <Box sx={{ width: "100%", pr: 2, pl: 2, pt: 1, height: "100%" }}>
        <DeliveriesTableV2 {...DEFAULT_DELIVERIES_TABLE_V2_PROPS} />
      </Box>
    </DashboardContent>
  );
}
