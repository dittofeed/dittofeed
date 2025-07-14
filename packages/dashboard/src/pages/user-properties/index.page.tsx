import { Stack } from "@mui/material";
import { GetServerSideProps } from "next";

import DashboardContent from "../../components/dashboardContent";
import UserPropertiesTable from "../../components/userPropertiesTable";
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

function UserPropertyListContents() {
  return (
    <Stack
      sx={{
        padding: 3,
        width: "100%",
        height: "100%",
      }}
    >
      <UserPropertiesTable />
    </Stack>
  );
}

export default function UserPropertyList() {
  return (
    <DashboardContent>
      <UserPropertyListContents />
    </DashboardContent>
  );
}
