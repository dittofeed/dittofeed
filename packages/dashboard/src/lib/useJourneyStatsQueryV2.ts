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
  GetJourneyEditorStatsRequest,
  GetJourneyEditorStatsResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const JOURNEY_STATS_QUERY_KEY = "journey-stats";

/**
 * Custom hook for fetching journey editor statistics using the GET /api/analysis/journey-stats endpoint
 */
export function useJourneyStatsQueryV2<TData = GetJourneyEditorStatsResponse>(
  params: Omit<GetJourneyEditorStatsRequest, "workspaceId">,
  options?: Omit<
    UseQueryOptions<GetJourneyEditorStatsResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for journey stats query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [JOURNEY_STATS_QUERY_KEY, { ...params, workspaceId }];
  const baseApiUrl = useBaseApiUrl();

  const queryResult = useQuery<GetJourneyEditorStatsResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<GetJourneyEditorStatsResponse> => {
      try {
        const response = await axios.get(`${baseApiUrl}/analysis/journey-stats`, {
          params: {
            ...params,
            workspaceId,
          },
          headers: authHeaders,
        });

        return unwrap(
          schemaValidateWithErr(response.data, GetJourneyEditorStatsResponse),
        );
      } catch (error) {
        console.error("Failed to fetch journey stats", error);
        // Re-throw or handle error as appropriate for your application
        throw error;
      }
    },
    ...options,
  });

  return queryResult;
}