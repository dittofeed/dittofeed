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
  GetUsersCountRequest,
  GetUsersCountResponse, // Assuming the API returns { userCount: number }
  GetUsersRequest, // For Omit to create GetUsersCountRequest type
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const USERS_COUNT_QUERY_KEY = "usersCount";

// Parameters for the count query, omitting cursor, limit, and direction
export type UsersCountQueryParams = Omit<
  GetUsersRequest, // Omit from the full GetUsersRequest for consistency
  "workspaceId" | "cursor" | "limit" | "direction"
>;

// Define a more specific type for the query key
export type UsersCountQueryKey = readonly [
  typeof USERS_COUNT_QUERY_KEY,
  string | null, // workspaceId
  UsersCountQueryParams | undefined,
];

export type UseUsersCountQueryOptions = Omit<
  UseQueryOptions<number, Error, number, UsersCountQueryKey>,
  "queryKey" | "queryFn"
>;

export function useUsersCountQuery(
  params?: UsersCountQueryParams,
  options?: UseUsersCountQueryOptions,
): UseQueryResult<number, Error> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const queryKey: UsersCountQueryKey = [
    USERS_COUNT_QUERY_KEY,
    workspace.type === CompletionStatus.Successful ? workspace.value.id : null,
    params,
  ];

  const queryFn = async (): Promise<number> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const workspaceId = workspace.value.id;

    const requestParams: GetUsersCountRequest = {
      workspaceId,
      ...params,
    };

    const response = await axios.post<GetUsersCountResponse>(
      `${baseApiUrl}/users/count`,
      requestParams,
      {
        headers: authHeaders,
      },
    );
    const validated = unwrap(
      schemaValidateWithErr(response.data, GetUsersCountResponse),
    );
    return validated.userCount;
  };

  return useQuery<number, Error, number, UsersCountQueryKey>({
    queryKey,
    queryFn,
    ...options,
    enabled:
      workspace.type === CompletionStatus.Successful &&
      (options?.enabled === undefined || options.enabled),
  });
}
