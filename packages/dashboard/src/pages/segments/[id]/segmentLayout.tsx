import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tabs from "@mui/material/Tabs";

import DashboardContent from "../../../components/dashboardContent";
import { RecomputeNowButton } from "../../../components/recomputeNowButton";
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
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ borderBottom: 1, borderColor: "divider", pr: 2 }}
        >
          <Tabs value={tabValue}>
            <TabLink label="Configure" href={basePath} index={0} />
            <TabLink label="Users" href={`${basePath}/users`} index={1} />
          </Tabs>
          <RecomputeNowButton segmentId={segmentId} />
        </Stack>
        <Box>{children}</Box>
      </Stack>
    </DashboardContent>
  );
}
