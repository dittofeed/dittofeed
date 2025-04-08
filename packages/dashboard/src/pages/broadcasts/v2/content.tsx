import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import React from "react";

import DashboardContent from "../../../components/dashboardContent";
import BroadcastLayout from "./broadcastLayout";

export default function BroadcastContentPage() {
  return (
    <DashboardContent>
      <BroadcastLayout activeStepKey="content">
        <Typography>Content Page</Typography>
        {/* TODO: Implement template selection component */}
        <Box sx={{ mt: 2 }}>
          <Link href="/templates/create" passHref legacyBehavior>
            <Button variant="contained" component="a">
              Create New Template
            </Button>
          </Link>
        </Box>
      </BroadcastLayout>
    </DashboardContent>
  );
}
