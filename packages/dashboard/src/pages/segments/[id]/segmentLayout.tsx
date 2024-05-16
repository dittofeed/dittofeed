import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tabs from "@mui/material/Tabs";

import DashboardContent from "../../../components/dashboardContent";
import TabLink from "../../../components/tabLink";

export default function SegmentLayout({
  children,
  segmentId,
  tab,
}: {
  segmentId: string;
  tab: "configure" | "users";
  children?: React.ReactNode;
}) {
  const basePath = `/segments/${segmentId}`;
  const tabValue = tab === "configure" ? 0 : 1;

  return (
    <DashboardContent>
      <Stack direction="column" sx={{ width: "100%" }}>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tabValue}>
            <TabLink label="Configure" href={basePath} index={0} />
            <TabLink label="Users" href={`${basePath}/users`} index={1} />
          </Tabs>
        </Box>
        <Box>{children}</Box>
      </Stack>
    </DashboardContent>
  );
}
