import { Stack } from "@mui/material";
import { GetServerSideProps } from "next";

import CatalogsTable from "../../components/catalogs/catalogsTable";
import DashboardContent from "../../components/dashboardContent";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { requestContext } from "../../lib/requestContext";

export const getServerSideProps: GetServerSideProps = requestContext(
  async (_ctx, dfContext) => {
    return {
      props: addInitialStateToProps({
        props: {},
        dfContext,
      }),
    };
  },
);

function CatalogListContents() {
  return (
    <Stack
      sx={{
        padding: 3,
        width: "100%",
        height: "100%",
      }}
    >
      <CatalogsTable />
    </Stack>
  );
}

export default function CatalogList() {
  return (
    <DashboardContent>
      <CatalogListContents />
    </DashboardContent>
  );
}
