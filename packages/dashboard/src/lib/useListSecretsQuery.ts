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
  ListSecretsRequest,
  ListSecretsResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const SECRETS_QUERY_KEY = "secrets";

export function useListSecretsQuery<
  TData = string[], // The data type will be an array of secret names
>(
  params?: Omit<ListSecretsRequest, "workspaceId">,
  options?: Omit<
    UseQueryOptions<
      string[], // Query function returns string[]
      Error,
      TData
    >,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for secrets query");
  }
  const workspaceId = workspace.value.id;
  // Include workspaceId and any other params in the query key
  const queryKey = [SECRETS_QUERY_KEY, { ...params, workspaceId }];

  const queryResult = useQuery<
    string[], // Query function returns string[]
    Error,
    TData
  >({
    queryKey,
    queryFn: async (): Promise<string[]> => {
      const response = await axios.get(`${baseApiUrl}/secrets/v2`, {
        params: {
          ...params,
          workspaceId,
        },
        headers: authHeaders,
      });

      const validatedResponse = unwrap(
        schemaValidateWithErr(response.data, ListSecretsResponse),
      );
      // The endpoint returns { names: [...] }, so we extract the array
      return validatedResponse.names;
    },
    ...options,
  });

  return queryResult;
}
