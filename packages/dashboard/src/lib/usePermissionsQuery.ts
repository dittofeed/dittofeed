import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CompletionStatus,
  GetWorkspaceMemberRolesRequest,
  GetWorkspaceMemberRolesResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { PERMISSIONS_QUERY_KEY } from "./usePermissionsMutations";

export function usePermissionsQuery(
  options?: Omit<
    UseQueryOptions<
      GetWorkspaceMemberRolesResponse,
      AxiosError,
      GetWorkspaceMemberRolesResponse,
      readonly [string, { workspaceId: string }]
    >,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<GetWorkspaceMemberRolesResponse, AxiosError> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const workspaceId =
    workspace.type === CompletionStatus.Successful ? workspace.value.id : null;

  const queryFn = async (): Promise<GetWorkspaceMemberRolesResponse> => {
    if (!workspaceId) {
      throw new Error("Workspace not available");
    }

    const response = await axios.get(`${baseApiUrl}/permissions`, {
      params: {
        workspaceId,
      } satisfies GetWorkspaceMemberRolesRequest,
      headers: {
        ...authHeaders,
      },
    });

    return response.data;
  };

  return useQuery({
    queryKey: [
      PERMISSIONS_QUERY_KEY,
      { workspaceId: workspaceId ?? "" },
    ] as const,
    queryFn,
    enabled: !!workspaceId,
    ...options,
  });
}
