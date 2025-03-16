import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import axios from "axios";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  GetResourcesRequest,
  GetResourcesResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";

/**
 * Custom hook for fetching resources using the GET /api/resources endpoint
 *
 * @param params The request parameters for fetching resources
 * @param options Any valid useQuery options
 * @returns A query result object containing the resources data
 */
export function useResourcesQuery(
  params: GetResourcesRequest,
  options?: Omit<UseQueryOptions<GetResourcesResponse>, "queryKey" | "queryFn">,
) {
  const { apiBase } = useAppStorePick(["apiBase"]);

  return useQuery<GetResourcesResponse>({
    queryKey: ["resources", params],
    queryFn: async () => {
      try {
        const response = await axios.get(`${apiBase}/api/resources`, {
          params,
        });

        // Validate the response data against the expected schema
        return unwrap(
          schemaValidateWithErr(response.data, GetResourcesResponse),
        );
      } catch (error) {
        console.error("Failed to fetch resources", error);
        throw error;
      }
    },
    ...options,
  });
}
