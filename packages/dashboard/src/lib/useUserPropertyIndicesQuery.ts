import { Type } from "@sinclair/typebox";
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
  GetUserPropertyIndicesResponse,
  UserPropertyIndexResource,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const USER_PROPERTY_INDICES_QUERY_KEY = "userPropertyIndices";

/**
 * Custom hook for fetching user property indices using the GET /api/user-property-indices endpoint
 */
export function useUserPropertyIndicesQuery<
  TData = GetUserPropertyIndicesResponse,
>(
  options?: Omit<
    UseQueryOptions<GetUserPropertyIndicesResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for user property indices query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [USER_PROPERTY_INDICES_QUERY_KEY, { workspaceId }];

  const queryResult = useQuery<GetUserPropertyIndicesResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<GetUserPropertyIndicesResponse> => {
      const response = await axios.get(`${baseApiUrl}/user-property-indices`, {
        params: { workspaceId },
        headers: authHeaders,
      });

      // API returns array directly, wrap in response object
      const indices = unwrap(
        schemaValidateWithErr(
          response.data,
          Type.Array(UserPropertyIndexResource),
        ),
      );

      return { indices };
    },
    ...options,
  });

  return queryResult;
}
