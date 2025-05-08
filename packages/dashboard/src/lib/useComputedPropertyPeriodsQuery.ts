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
  GetComputedPropertyPeriodsRequest,
  GetComputedPropertyPeriodsResponse,
} from "isomorphic-lib/src/types";

import { useAuthHeaders, useBaseApiUrl } from "./apiAuthProvider";
import { useAppStorePick } from "./appStore";

export const COMPUTED_PROPERTY_PERIODS_QUERY_KEY = "computed-property-periods";

/**
 * Custom hook for fetching computed property periods using the GET /api/computed-properties/periods endpoint
 */
export function useComputedPropertyPeriodsQuery<
  TData = GetComputedPropertyPeriodsResponse,
>(
  params: Omit<GetComputedPropertyPeriodsRequest, "workspaceId">,
  options?: Omit<
    UseQueryOptions<GetComputedPropertyPeriodsResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error(
      "Workspace not available for computed property periods query",
    );
  }

  const workspaceId = workspace.value.id;
  const queryKey = [
    COMPUTED_PROPERTY_PERIODS_QUERY_KEY,
    { ...params, workspaceId },
  ];
  const baseApiUrl = useBaseApiUrl();

  const queryResult = useQuery<
    GetComputedPropertyPeriodsResponse,
    Error,
    TData
  >({
    queryKey,
    queryFn: async (): Promise<GetComputedPropertyPeriodsResponse> => {
      try {
        const response = await axios.get(
          `${baseApiUrl}/computed-properties/periods`,
          {
            params: {
              ...params,
              workspaceId,
            },
            headers: authHeaders,
          },
        );

        return unwrap(
          schemaValidateWithErr(
            response.data,
            GetComputedPropertyPeriodsResponse,
          ),
        );
      } catch (error) {
        console.error("Failed to fetch computed property periods", error);
        // Re-throw or handle error as appropriate for your application
        throw error;
      }
    },
    ...options,
  });

  return queryResult;
}
