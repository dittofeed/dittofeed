import { Box } from "@mui/material";

import DashboardContent from "../dashboardContent";
import { ReturnLink } from "../returnNavigation";

export default function TemplatePageContent({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardContent>
      <Box sx={{ padding: 1, width: "100%", height: "100%" }}>
        <ReturnLink />
        {children}
      </Box>
    </DashboardContent>
  );
}
