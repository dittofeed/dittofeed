import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import axios from "axios";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  GetBroadcastsResponse,
  GetBroadcastsV2Request,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";

/**
 * Custom hook for fetching broadcasts using the GET /api/broadcasts endpoint
 */
export function useBroadcastsQuery<TData = GetBroadcastsResponse>(
  params?: Omit<GetBroadcastsV2Request, "workspaceId">, // Allow optional additional params if needed later
  options?: Omit<
    UseQueryOptions<GetBroadcastsResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for broadcasts query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = ["broadcasts", { ...params, workspaceId }];

  const queryResult = useQuery<GetBroadcastsResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<GetBroadcastsResponse> => {
      try {
        const response = await axios.get(`${apiBase}/api/broadcasts`, {
          params: {
            ...params,
            workspaceId,
          },
        });

        return unwrap(
          schemaValidateWithErr(response.data, GetBroadcastsResponse),
        );
      } catch (error) {
        console.error("Failed to fetch broadcasts", error);
        // Re-throw or handle error as appropriate for your application
        throw error;
      }
    },
    ...options,
  });

  return queryResult;
}
