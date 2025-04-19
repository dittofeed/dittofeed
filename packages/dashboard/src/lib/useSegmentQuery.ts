import { UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import {
  GetSegmentsRequest,
  GetSegmentsResponse,
  SegmentResource,
} from "isomorphic-lib/src/types";

import { useSegmentsQuery } from "./useSegmentsQuery";

// Define the specific desired output type for the data property
type SelectedData = SegmentResource | null;

// Define the type fetched by the underlying query
type FetchedData = GetSegmentsResponse;

/**
 * Custom hook for fetching a single segment by ID using the underlying
 * useSegmentsQuery hook.
 * Returns the segment resource directly, or null if not found/loading/error.
 */
export function useSegmentQuery(
  // The ID of the segment to fetch (now required)
  segmentId: string,
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
  const params: Omit<GetSegmentsRequest, "workspaceId"> = {
    ids: [segmentId],
  };

  // Call the existing hook, explicitly providing generic types
  // TQueryFnData = FetchedData, TError = Error, TData = SelectedData
  const queryResult = useSegmentsQuery(params, {
    ...options,
    // Use select to pick the single broadcast from the array
    select: (data: FetchedData | undefined): SelectedData => {
      if (!data) {
        return null;
      }
      // Since we queried by ID, we expect at most one result
      const segment = data.segments.find((s) => s.id === segmentId);
      if (!segment) {
        return null;
      }
      return segment;
    },
  });

  // queryResult should now correctly be UseQueryResult<SelectedData, Error>
  return queryResult;
}
