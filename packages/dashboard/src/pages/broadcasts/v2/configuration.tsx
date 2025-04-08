import Typography from "@mui/material/Typography";
import React from "react";

import DashboardContent from "../../../components/dashboardContent";
import BroadcastLayout from "./broadcastLayout";

export default function BroadcastConfigurationPage() {
  return (
    <DashboardContent>
      <BroadcastLayout activeStepKey="configuration">
        <Typography>Configuration Page</Typography>
      </BroadcastLayout>
    </DashboardContent>
  );
}
