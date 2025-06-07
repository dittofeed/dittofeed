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
  GetJourneysRequest,
  GetJourneysResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { JOURNEYS_QUERY_KEY } from "./constants";

/**
 * Custom hook for fetching journeys using the GET /api/journeys endpoint
 */
export function useJourneysQuery<TData = GetJourneysResponse>(
  params?: Omit<GetJourneysRequest, "workspaceId">,
  options?: Omit<
    UseQueryOptions<GetJourneysResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for journeys query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [JOURNEYS_QUERY_KEY, { ...params, workspaceId }];

  const queryResult = useQuery<GetJourneysResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<GetJourneysResponse> => {
      try {
        const response = await axios.get(`${baseApiUrl}/journeys`, {
          params: {
            ...params,
            workspaceId,
          },
          headers: authHeaders,
        });

        return unwrap(
          schemaValidateWithErr(response.data, GetJourneysResponse),
        );
      } catch (error) {
        console.error("Failed to fetch journeys", error);
        // Re-throw or handle error as appropriate for your application
        throw error;
      }
    },
    ...options,
  });

  return queryResult;
}
