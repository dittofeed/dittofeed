import { Box, useTheme } from "@mui/material";
import { GetServerSideProps } from "next";

import DashboardContent from "../../components/dashboardContent";
import TemplatesTable from "../../components/messages/templatesTable";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { requestContext } from "../../lib/requestContext";
import { PropsWithInitialState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    return {
      props: addInitialStateToProps({
        dfContext,
        props: {},
      }),
    };
  });

export default function TemplateList() {
  const theme = useTheme();
  return (
    <DashboardContent>
      <Box sx={{ height: "100%", width: "100%", padding: theme.spacing(3) }}>
        <TemplatesTable />
      </Box>
    </DashboardContent>
  );
}
