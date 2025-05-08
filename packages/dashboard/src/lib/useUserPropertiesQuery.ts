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
  ReadAllUserPropertiesRequest,
  ReadAllUserPropertiesResponse,
} from "isomorphic-lib/src/types";

import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { useAppStorePick } from "./appStore";

export const USER_PROPERTIES_QUERY_KEY = "userProperties";

/**
 * Custom hook for fetching user properties using the GET /api/user-properties endpoint
 */
export function useUserPropertiesQuery<TData = ReadAllUserPropertiesResponse>(
  params?: Omit<ReadAllUserPropertiesRequest, "workspaceId">, // Allow optional additional params if needed later
  options?: Omit<
    UseQueryOptions<ReadAllUserPropertiesResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for user properties query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [USER_PROPERTIES_QUERY_KEY, { ...params, workspaceId }];
  const baseApiUrl = useBaseApiUrl();

  const queryResult = useQuery<ReadAllUserPropertiesResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<ReadAllUserPropertiesResponse> => {
      try {
        const response = await axios.get(`${baseApiUrl}/user-properties`, {
          params: {
            ...params,
            workspaceId,
          },
          headers: authHeaders,
        });

        return unwrap(
          schemaValidateWithErr(response.data, ReadAllUserPropertiesResponse),
        );
      } catch (error) {
        console.error("Failed to fetch user properties", error);
        // Re-throw or handle error as appropriate for your application
        throw error;
      }
    },
    ...options,
  });

  return queryResult;
}
