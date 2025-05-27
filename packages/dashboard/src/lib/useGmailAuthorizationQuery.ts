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
  GetGmailAuthorizationRequest,
  GetGmailAuthorizationResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const GMAIL_AUTHORIZATION_QUERY_KEY = "gmail-authorization";

/**
 * Custom hook for fetching gmail authorization status using the GET /api/broadcasts/gmail-authorization endpoint
 */
export function useGmailAuthorizationQuery<
  TData = GetGmailAuthorizationResponse,
>(
  params?: Omit<GetGmailAuthorizationRequest, "workspaceId">, // Allow optional additional params if needed later
  options?: Omit<
    UseQueryOptions<GetGmailAuthorizationResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for gmail authorization query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [GMAIL_AUTHORIZATION_QUERY_KEY, { ...params, workspaceId }];
  const baseApiUrl = useBaseApiUrl();

  const queryResult = useQuery<GetGmailAuthorizationResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<GetGmailAuthorizationResponse> => {
      try {
        const response = await axios.get(
          `${baseApiUrl}/broadcasts/gmail-authorization`,
          {
            params: {
              ...params,
              workspaceId,
            },
            headers: authHeaders,
          },
        );

        return unwrap(
          schemaValidateWithErr(response.data, GetGmailAuthorizationResponse),
        );
      } catch (error) {
        console.error("Failed to fetch gmail authorization status", error);
        // Re-throw or handle error as appropriate for your application
        throw error;
      }
    },
    ...options,
  });

  return queryResult;
}
