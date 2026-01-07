import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tabs from "@mui/material/Tabs";

import DashboardContent from "../../components/dashboardContent";
import TabLink from "../../components/tabLink";

export enum SubscriptionGroupTabLabel {
  Configure = "Configure",
  Users = "Users",
  UsersNotInGroup = "Not In Group",
  UsersUnsubscribed = "Unsubscribed",
  Upload = "Upload",
}

const TabToIndex: Record<SubscriptionGroupTabLabel, number> = {
  [SubscriptionGroupTabLabel.Configure]: 0,
  [SubscriptionGroupTabLabel.Users]: 1,
  [SubscriptionGroupTabLabel.UsersNotInGroup]: 2,
  [SubscriptionGroupTabLabel.UsersUnsubscribed]: 3,
  [SubscriptionGroupTabLabel.Upload]: 4,
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
  const tabValue = TabToIndex[tab];

  return (
    <DashboardContent>
      <Stack direction="column" sx={{ width: "100%", padding: 1 }}>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tabValue}>
            <TabLink
              label="Configure"
              href={`/subscription-groups/${id}`}
              index={0}
            />
            <TabLink
              label="Users"
              href={`/subscription-groups/users/${id}`}
              index={1}
            />
            <TabLink
              label="Not In Group"
              href={`/subscription-groups/users-not-in-group/${id}`}
              index={2}
            />
            <TabLink
              label="Unsubscribed"
              href={`/subscription-groups/users-unsubscribed/${id}`}
              index={3}
            />
            <TabLink
              label="Upload"
              href={`/subscription-groups/upload/${id}`}
              index={4}
            />
          </Tabs>
        </Box>
        <Box>{children}</Box>
      </Stack>
    </DashboardContent>
  );
}
