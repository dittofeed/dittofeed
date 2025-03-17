import { UseQueryOptions } from "@tanstack/react-query";
import { GetResourcesResponse } from "isomorphic-lib/src/types";

import { useResourcesQuery } from "./useResourcesQuery";

/**
 * Custom hook for fetching user properties
 *
 * @param options Any valid useQuery options
 * @returns A query result object containing the user properties data
 * @throws Error if workspaceId is not available (handled by useResourcesQuery)
 */
export function useUserPropertiesQuery(
  options?: Omit<UseQueryOptions<GetResourcesResponse>, "queryKey" | "queryFn">,
) {
  return useResourcesQuery(
    {
      userProperties: true,
    },
    options,
  );
}
