import Typography from "@mui/material/Typography";
import React from "react";

import DashboardContent from "../../../components/dashboardContent";
import BroadcastLayout from "./broadcastLayout";

export default function BroadcastPreviewPage() {
  return (
    <DashboardContent>
      <BroadcastLayout activeStepIndex={3}>
        <Typography>Preview Page</Typography>
      </BroadcastLayout>
    </DashboardContent>
  );
}
