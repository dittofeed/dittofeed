import { UseQueryOptions } from "@tanstack/react-query";
import {
  GetBroadcastsResponse,
  GetBroadcastsV2Request,
} from "isomorphic-lib/src/types";

import { useBroadcastsQuery } from "./useBroadcastsQuery"; // Import the existing hook

/**
 * Custom hook for fetching a single broadcast by ID using the underlying
 * useBroadcastsQuery hook.
 */
export function useBroadcastQuery(
  // The ID of the broadcast to fetch (now required)
  broadcastId: string,
  // Optional query options, excluding queryKey and queryFn.
  // Caller can now control 'enabled' directly.
  options?: Omit<
    UseQueryOptions<GetBroadcastsResponse>,
    "queryKey" | "queryFn"
  >,
) {
  // Prepare the params for the underlying hook
  const params: Omit<GetBroadcastsV2Request, "workspaceId"> = {
    ids: [broadcastId],
  };

  // Call the existing hook with the specific ID filter
  const queryResult = useBroadcastsQuery(params, {
    ...options,
  });

  // Return the raw query result. The component can extract the single broadcast
  // from queryResult.data.broadcasts[0] if needed.
  return queryResult;
}
