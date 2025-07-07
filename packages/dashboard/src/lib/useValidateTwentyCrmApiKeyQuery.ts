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
  ValidateTwentyCrmApiKeyRequest,
  ValidateTwentyCrmApiKeyResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const VALIDATE_TWENTY_CRM_API_KEY_QUERY_KEY = "ValidateTwentyCrmApiKey";

export function useValidateTwentyCrmApiKeyQuery<
  TData = ValidateTwentyCrmApiKeyResponse,
>(
  params: Omit<ValidateTwentyCrmApiKeyRequest, "workspaceId">,
  options?: Omit<
    UseQueryOptions<ValidateTwentyCrmApiKeyResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [
    VALIDATE_TWENTY_CRM_API_KEY_QUERY_KEY,
    { ...params, workspaceId },
  ];

  const queryResult = useQuery<ValidateTwentyCrmApiKeyResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<ValidateTwentyCrmApiKeyResponse> => {
      const { apiKey } = params;

      const response = await axios.post(
        `${baseApiUrl}/integrations/twentycrm/validate-api-key`,
        {
          workspaceId,
          apiKey,
        },
        {
          headers: authHeaders,
        },
      );

      return unwrap(
        schemaValidateWithErr(response.data, ValidateTwentyCrmApiKeyResponse),
      );
    },
    ...options,
  });

  return queryResult;
}
