import { UseQueryOptions } from "@tanstack/react-query";
import { GetResourcesResponse } from "isomorphic-lib/src/types";

import { useResourcesQuery } from "./useResourcesQuery";

/**
 * Custom hook for fetching subscription groups
 *
 * @param options Any valid useQuery options
 * @returns A query result object containing the subscription groups data
 * @throws Error if workspaceId is not available (handled by useResourcesQuery)
 */
export function useSubscriptionGroupsResourcesQuery(
  options?: Omit<UseQueryOptions<GetResourcesResponse>, "queryKey" | "queryFn">,
) {
  return useResourcesQuery(
    {
      subscriptionGroups: true,
    },
    options,
  );
}
