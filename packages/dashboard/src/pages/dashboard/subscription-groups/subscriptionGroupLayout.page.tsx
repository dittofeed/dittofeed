import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tabs from "@mui/material/Tabs";

import DashboardContent from "../../../components/dashboardContent";
import TabLink from "../../../components/tabLink";

export enum SubscriptionGroupTabLabel {
  Configure = "Configure",
  Users = "Users",
  Upload = "Upload",
}

const TabToIndex: Record<SubscriptionGroupTabLabel, number> = {
  [SubscriptionGroupTabLabel.Configure]: 0,
  [SubscriptionGroupTabLabel.Users]: 1,
  [SubscriptionGroupTabLabel.Upload]: 2,
};

export default function SubscriptionGroupLayout({
  children,
  id,
  tab,
}: {
  id: string;
  tab: SubscriptionGroupTabLabel;
  children?: React.ReactNode;
}) {
  const basePath = `/dashboard/subscription-groups/${id}`;
  const tabValue = TabToIndex[tab];

  return (
    <DashboardContent>
      <Stack direction="column" sx={{ width: "100%" }}>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tabValue}>
            <TabLink label="Configure" href={basePath} index={0} />
            <TabLink label="Users" href={`${basePath}/users`} index={1} />
            <TabLink label="Upload" href={`${basePath}/upload`} index={2} />
          </Tabs>
        </Box>
        <Box>{children}</Box>
      </Stack>
    </DashboardContent>
  );
}
