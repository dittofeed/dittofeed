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
  GetUsersRequest,
  GetUsersResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const USERS_QUERY_KEY = "users";

// Define a more specific type for the query key
export type UsersQueryKey = readonly [
  typeof USERS_QUERY_KEY,
  string | null, // workspaceId
  Omit<GetUsersRequest, "workspaceId"> | undefined,
];

export type UseUsersQueryOptions = Omit<
  UseQueryOptions<GetUsersResponse, Error, GetUsersResponse, UsersQueryKey>,
  "queryKey" | "queryFn"
>;

export function useUsersQuery(
  params?: Omit<GetUsersRequest, "workspaceId">,
  options?: UseUsersQueryOptions,
): UseQueryResult<GetUsersResponse> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const queryKey: UsersQueryKey = [
    USERS_QUERY_KEY,
    workspace.type === CompletionStatus.Successful ? workspace.value.id : null,
    params,
  ];

  const queryFn = async (): Promise<GetUsersResponse> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const workspaceId = workspace.value.id;

    const requestParams: GetUsersRequest = {
      workspaceId,
      ...params,
    };

    const response = await axios.post<GetUsersResponse>(
      `${baseApiUrl}/users`,
      requestParams,
      {
        headers: authHeaders,
      },
    );

    return unwrap(schemaValidateWithErr(response.data, GetUsersResponse));
  };

  const placeholderData = options?.placeholderData;

  return useQuery<GetUsersResponse, Error, GetUsersResponse, UsersQueryKey>({
    queryKey,
    queryFn,
    ...options,
    placeholderData,
    enabled:
      workspace.type === CompletionStatus.Successful &&
      (options?.enabled === undefined || options.enabled),
  });
}
