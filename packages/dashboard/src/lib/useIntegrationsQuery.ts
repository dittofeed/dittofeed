import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  IntegrationResource,
  ListIntegrationsRequest,
  ListIntegrationsResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const INTEGRATIONS_QUERY_KEY = "integrations";

export type IntegrationsQueryKey = [
  typeof INTEGRATIONS_QUERY_KEY,
  { workspaceId: string; id?: string },
];

export function useIntegrationsQuery(
  params: Omit<ListIntegrationsRequest, "workspaceId">,
  options?: Omit<
    UseQueryOptions<
      IntegrationResource[],
      AxiosError,
      IntegrationResource[],
      IntegrationsQueryKey
    >,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<IntegrationResource[], AxiosError> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for integrations query");
  }
  const { id: workspaceId } = workspace.value;

  const queryKey: IntegrationsQueryKey = [
    INTEGRATIONS_QUERY_KEY,
    { workspaceId, ...params },
  ];

  const queryFn = async () => {
    const response = await axios.get(`${baseApiUrl}/integrations`, {
      headers: authHeaders,
      params: {
        workspaceId,
        ...params,
      } satisfies ListIntegrationsRequest,
    });

    const validated = unwrap(
      schemaValidateWithErr(response.data, ListIntegrationsResponse),
    );
    return validated;
  };

  const result = useQuery({
    queryKey,
    queryFn,
    ...options,
  });

  return result;
}
