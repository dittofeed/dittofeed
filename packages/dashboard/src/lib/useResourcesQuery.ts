import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import axios from "axios";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  GetResourcesRequest,
  GetResourcesResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";

/**
 * Custom hook for fetching resources using the GET /api/resources endpoint
 *
 * @param params The request parameters for fetching resources (without workspaceId)
 * @param options Any valid useQuery options
 * @returns A query result object containing the resources data
 * @throws Error if workspaceId is not available
 */
export function useResourcesQuery(
  params: Omit<GetResourcesRequest, "workspaceId">,
  options?: Omit<UseQueryOptions<GetResourcesResponse>, "queryKey" | "queryFn">,
) {
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for resources query");
  }

  const workspaceId = workspace.value.id;

  return useQuery<GetResourcesResponse>({
    queryKey: ["resources", { ...params, workspaceId }],
    queryFn: async () => {
      try {
        const response = await axios.get(`${apiBase}/api/resources`, {
          params: {
            ...params,
            workspaceId,
          },
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
