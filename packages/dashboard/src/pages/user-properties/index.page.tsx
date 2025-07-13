import { Stack } from "@mui/material";

import DashboardContent from "../../components/dashboardContent";
import UserPropertiesTable from "../../components/userPropertiesTable";

function UserPropertyListContents() {
  return (
    <Stack
      sx={{
        padding: 1,
        width: "100%",
        bgcolor: "background.paper",
        borderRadius: 1,
        margin: "1rem",
      }}
      spacing={2}
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
