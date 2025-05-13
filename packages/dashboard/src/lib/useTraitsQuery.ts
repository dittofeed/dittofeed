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
  GetTraitsRequest,
  GetTraitsResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const TRAITS_QUERY_KEY = "traits";

/**
 * Custom hook for fetching traits using the GET /api/events/traits endpoint
 */
export function useTraitsQuery<TData = GetTraitsResponse>(
  params?: Omit<GetTraitsRequest, "workspaceId">,
  options?: Omit<
    UseQueryOptions<GetTraitsResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for traits query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [TRAITS_QUERY_KEY, { ...params, workspaceId }];
  const baseApiUrl = useBaseApiUrl();

  const queryResult = useQuery<GetTraitsResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<GetTraitsResponse> => {
      const response = await axios.get(`${baseApiUrl}/events/traits`, {
        params: {
          ...params,
          workspaceId,
        },
        headers: authHeaders,
      });

      return unwrap(schemaValidateWithErr(response.data, GetTraitsResponse));
    },
    ...options,
  });

  return queryResult;
}
