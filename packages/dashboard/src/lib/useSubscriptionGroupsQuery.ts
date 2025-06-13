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
  SubscriptionGroupResource,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const SUBSCRIPTION_GROUPS_QUERY_KEY = "subscriptionGroups";

// Define response type for subscription groups API
export type GetSubscriptionGroupsResponse = SubscriptionGroupResource[];

/**
 * Custom hook for fetching subscription groups using the GET /api/subscription-groups endpoint
 */
export function useSubscriptionGroupsQuery<
  TData = GetSubscriptionGroupsResponse,
>(
  params?: Record<string, unknown>, // Allow optional additional params if needed later
  options?: Omit<
    UseQueryOptions<GetSubscriptionGroupsResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for subscription groups query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [SUBSCRIPTION_GROUPS_QUERY_KEY, { ...params, workspaceId }];
  const baseApiUrl = useBaseApiUrl();

  const queryResult = useQuery<GetSubscriptionGroupsResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<GetSubscriptionGroupsResponse> => {
      try {
        const response = await axios.get(`${baseApiUrl}/subscription-groups`, {
          params: {
            ...params,
            workspaceId,
          },
          headers: authHeaders,
        });

        return unwrap(
          schemaValidateWithErr(
            response.data,
            Type.Array(SubscriptionGroupResource),
          ),
        );
      } catch (error) {
        console.error("Failed to fetch subscription groups", error);
        // Re-throw or handle error as appropriate for your application
        throw error;
      }
    },
    ...options,
  });

  return queryResult;
}
