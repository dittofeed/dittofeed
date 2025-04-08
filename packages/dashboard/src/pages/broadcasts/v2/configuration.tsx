import Typography from "@mui/material/Typography";
import React from "react";

import DashboardContent from "../../../components/dashboardContent";
import BroadcastLayout from "./broadcastLayout";

export default function BroadcastConfigurationPage() {
  return (
    <DashboardContent>
      <BroadcastLayout activeStepIndex={2}>
        <Typography>Configuration Page</Typography>
      </BroadcastLayout>
    </DashboardContent>
  );
}
