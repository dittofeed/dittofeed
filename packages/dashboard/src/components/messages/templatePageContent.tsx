import { Box } from "@mui/material";

import DashboardContent from "../dashboardContent";

export default function TemplatePageContent({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardContent>
      <Box sx={{ padding: 1, width: "100%", height: "100%" }}>{children}</Box>
    </DashboardContent>
  );
}
