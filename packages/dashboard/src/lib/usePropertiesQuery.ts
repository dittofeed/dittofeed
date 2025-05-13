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
  GetPropertiesRequest,
  GetPropertiesResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const PROPERTIES_QUERY_KEY = "properties";

/**
 * Custom hook for fetching event properties using the GET /api/events/properties endpoint
 */
export function usePropertiesQuery<TData = GetPropertiesResponse>(
  params?: Omit<GetPropertiesRequest, "workspaceId">,
  options?: Omit<
    UseQueryOptions<GetPropertiesResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for properties query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [PROPERTIES_QUERY_KEY, { ...params, workspaceId }];
  const baseApiUrl = useBaseApiUrl();

  const queryResult = useQuery<GetPropertiesResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<GetPropertiesResponse> => {
      const response = await axios.get(`${baseApiUrl}/events/properties`, {
        params: {
          ...params,
          workspaceId,
        },
        headers: authHeaders,
      });

      return unwrap(
        schemaValidateWithErr(response.data, GetPropertiesResponse),
      );
    },
    ...options,
  });

  return queryResult;
}
