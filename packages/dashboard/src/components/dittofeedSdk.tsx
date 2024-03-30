import { DittofeedSdk } from "@dittofeed/sdk-web";
import React from "react";
import { pick } from "remeda";

import { apiBase } from "../lib/apiBase";
import { useAppStore } from "../lib/appStore";

export function SdkInitializer({ children }: { children: React.ReactNode }) {
  const { dashboardWriteKey, trackDashboard } = useAppStore((store) =>
    pick(store, ["dashboardWriteKey", "trackDashboard"]),
  );
  React.useEffect(() => {
    if (trackDashboard && dashboardWriteKey) {
      DittofeedSdk.init({
        writeKey: dashboardWriteKey,
        host: apiBase(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
