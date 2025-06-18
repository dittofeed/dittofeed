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
  GetEventsRequest,
  GetEventsResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const EVENTS_QUERY_KEY = "events";

/**
 * Custom hook for fetching events using the GET /api/events endpoint
 */
export function useEventsQuery<TData = GetEventsResponse>(
  params?: Omit<GetEventsRequest, "workspaceId">,
  options?: Omit<
    UseQueryOptions<GetEventsResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for events query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [EVENTS_QUERY_KEY, { ...params, workspaceId }];
  const baseApiUrl = useBaseApiUrl();

  const queryResult = useQuery<GetEventsResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<GetEventsResponse> => {
      try {
        const response = await axios.get(`${baseApiUrl}/events`, {
          params: {
            ...params,
            workspaceId,
          },
          headers: authHeaders,
        });

        return unwrap(
          schemaValidateWithErr(response.data, GetEventsResponse),
        );
      } catch (error) {
        console.error("Failed to fetch events", error);
        throw error;
      }
    },
    ...options,
  });

  return queryResult;
}