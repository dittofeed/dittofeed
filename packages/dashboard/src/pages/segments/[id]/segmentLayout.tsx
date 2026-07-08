import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tabs from "@mui/material/Tabs";

import DashboardContent from "../../../components/dashboardContent";
import TabLink from "../../../components/tabLink";

export type SegmentTab = "main" | "users" | "journeys";

const TabToIndex: Record<SegmentTab, number> = {
  main: 0,
  users: 1,
  journeys: 2,
};

export default function SegmentLayout({
  children,
  segmentId,
  tab,
}: {
  segmentId: string;
  tab: SegmentTab;
  children?: React.ReactNode;
}) {
  const basePath = `/segments/${segmentId}`;
  const tabValue = TabToIndex[tab];

  return (
    <DashboardContent>
      <Stack direction="column" sx={{ width: "100%", height: "100%" }}>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tabValue}>
            <TabLink label="Main" href={basePath} index={0} />
            <TabLink label="Users" href={`${basePath}/users`} index={1} />
            <TabLink label="Journeys" href={`${basePath}/journeys`} index={2} />
          </Tabs>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0 }}>{children}</Box>
      </Stack>
    </DashboardContent>
  );
}
