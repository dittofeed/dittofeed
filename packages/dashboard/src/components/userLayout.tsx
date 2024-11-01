import { Stack } from "@mui/material";
import React, { ReactNode } from "react";

import DashboardContent from "./dashboardContent";
import { UserTabs } from "./userTabs";

interface UserLayoutProps {
  userId: string;
  children: ReactNode;
}

export function UserLayout({ userId, children }: UserLayoutProps) {
  return (
    <DashboardContent>
      <Stack spacing={2} sx={{ width: "100%", height: "100%" }}>
        <UserTabs userId={userId} />
        <Stack spacing={2} sx={{ padding: 2, width: "100%", height: "100%" }}>
          {children}
        </Stack>
      </Stack>
    </DashboardContent>
  );
}
