import { UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import {
  BroadcastResourceAllVersions,
  BroadcastResourceV2,
  GetBroadcastsV2Request,
} from "isomorphic-lib/src/types";

import { useBroadcastsQuery } from "./useBroadcastsQuery"; // Import the existing hook

// Define the specific desired output type for the data property
type SelectedData = BroadcastResourceV2 | null;

// Define the type fetched by the underlying query
type FetchedData = BroadcastResourceAllVersions[];

/**
 * Custom hook for fetching a single broadcast by ID using the underlying
 * useBroadcastsQuery hook.
 * Returns the broadcast resource directly, or null if not found/loading/error.
 */
export function useBroadcastQuery(
  // The ID of the broadcast to fetch (now required)
  broadcastId: string,
  // Optional query options, excluding queryKey and queryFn.
  // Caller can now control 'enabled' directly.
  options?: Omit<
    // Input type for options remains array
    // but the select function determines the final TData type.
    UseQueryOptions<FetchedData, Error, SelectedData>,
    "queryKey" | "queryFn" | "select" // select is provided internally
  >,
): UseQueryResult<SelectedData> {
  // Prepare the params for the underlying hook
  const params: Omit<GetBroadcastsV2Request, "workspaceId"> = {
    ids: [broadcastId],
  };

  // Call the existing hook, explicitly providing generic types
  // TQueryFnData = FetchedData, TError = Error, TData = SelectedData
  const queryResult = useBroadcastsQuery(params, {
    ...options,
    // Use select to pick the single broadcast from the array
    select: (data: FetchedData | undefined): SelectedData => {
      if (!data) {
        return null;
      }
      // Since we queried by ID, we expect at most one result
      const broadcast = data.find((b) => b.id === broadcastId);
      if (broadcast?.version !== "V2") {
        return null;
      }
      return broadcast;
    },
  });

  // queryResult should now correctly be UseQueryResult<SelectedData, Error>
  return queryResult;
}
