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
  GetSegmentsRequest,
  GetSegmentsResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";

export const SEGMENTS_QUERY_KEY = "segments";

/**
 * Custom hook for fetching broadcasts using the GET /api/broadcasts endpoint
 */
export function useSegmentsQuery<TData = GetSegmentsResponse>(
  params?: Omit<GetSegmentsRequest, "workspaceId">, // Allow optional additional params if needed later
  options?: Omit<
    UseQueryOptions<GetSegmentsResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for broadcasts query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = ["broadcasts", { ...params, workspaceId }];

  const queryResult = useQuery<GetSegmentsResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<GetSegmentsResponse> => {
      try {
        const response = await axios.get(`${apiBase}/api/segments`, {
          params: {
            ...params,
            workspaceId,
          },
        });

        return unwrap(
          schemaValidateWithErr(response.data, GetSegmentsResponse),
        );
      } catch (error) {
        console.error("Failed to fetch segments", error);
        // Re-throw or handle error as appropriate for your application
        throw error;
      }
    },
    ...options,
  });

  return queryResult;
}
