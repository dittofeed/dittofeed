import React from "react";

import { useAppStore } from "../lib/appStore";
import { BaseResourceRow, ResourceTable } from "./resourceTable";

interface Row extends BaseResourceRow {
  triggeredAt: string;
}

export default function BroadcastsTable() {
  const broadcasts = useAppStore((store) => store.broadcasts);

  const broadcastsRow: Row[] = [];

  broadcasts.forEach((broadcast) => {
    const row: Row = {
      id: broadcast.id,
      name: broadcast.name,
      updatedAt: new Date(broadcast.updatedAt).toISOString(),
      triggeredAt: broadcast.triggeredAt
        ? new Date(broadcast.triggeredAt).toISOString()
        : "Not Triggered",
    };
    broadcastsRow.push(row);
  });

  return (
    <ResourceTable
      rows={broadcastsRow}
      getHref={(id) => `/broadcasts/segment/${id}`}
      additionalColumns={[
        {
          field: "triggeredAt",
          headerName: "Triggered At",
        },
      ]}
    />
  );
}
