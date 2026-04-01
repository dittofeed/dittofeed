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
  GetUserIdentityAliasesResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const USER_IDENTITY_ALIASES_QUERY_KEY = "user-identity-aliases";

export function useUserIdentityAliasesQuery(
  profileUserId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetUserIdentityAliasesResponse, Error>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<GetUserIdentityAliasesResponse, Error> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for identity aliases query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [USER_IDENTITY_ALIASES_QUERY_KEY, workspaceId, profileUserId];

  return useQuery<GetUserIdentityAliasesResponse, Error>({
    queryKey,
    queryFn: async (): Promise<GetUserIdentityAliasesResponse> => {
      const response = await axios.get(`${baseApiUrl}/users/identity-aliases`, {
        params: {
          workspaceId,
          profileUserId,
        },
        headers: authHeaders,
      });
      return unwrap(
        schemaValidateWithErr(response.data, GetUserIdentityAliasesResponse),
      );
    },
    enabled: Boolean(profileUserId),
    ...options,
  });
}
