import { UseQueryOptions } from "@tanstack/react-query";
import { GetResourcesResponse } from "isomorphic-lib/src/types";

import { useResourcesQuery } from "./useResourcesQuery";

/**
 * Custom hook for fetching segments
 *
 * @param options Any valid useQuery options
 * @returns A query result object containing the segments data
 * @throws Error if workspaceId is not available (handled by useResourcesQuery)
 */
export function useSegmentsQuery(
  options?: Omit<UseQueryOptions<GetResourcesResponse>, "queryKey" | "queryFn">,
) {
  return useResourcesQuery(
    {
      segments: true,
    },
    options,
  );
}
