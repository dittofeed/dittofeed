import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { CompletionStatus, DeleteUsersRequest } from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { USERS_COUNT_QUERY_KEY } from "./useUsersCountQuery";
import { USERS_QUERY_KEY } from "./useUsersQuery";

export type DeleteUserVariables = string[]; // Array of user IDs

export type UseDeleteUserMutationOptions = Omit<
  UseMutationOptions<void, AxiosError, DeleteUserVariables>,
  "mutationFn"
>;

export function useDeleteUserMutation(
  options?: UseDeleteUserMutationOptions,
): UseMutationResult<void, AxiosError, DeleteUserVariables> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (userIds: DeleteUserVariables): Promise<void> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for user deletion");
    }
    const workspaceId = workspace.value.id;

    const requestData: DeleteUsersRequest = {
      workspaceId,
      userIds,
    };

    await axios.delete(`${baseApiUrl}/users/v2`, {
      params: requestData,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
    });
  };

  return useMutation<void, AxiosError, DeleteUserVariables>({
    mutationFn,
    ...options,
    onSuccess: (data, variables, context) => {
      // Call user-provided onSuccess first
      options?.onSuccess?.(data, variables, context);

      // Then, invalidate queries after a delay to accommodate the time it takes for the backend to process the deletion
      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        setTimeout(() => {
          // Invalidate all queries starting with USERS_QUERY_KEY for the current workspace
          queryClient.invalidateQueries({
            queryKey: [USERS_QUERY_KEY, workspaceId],
            // consider type: 'all' if you want to remove vs just mark stale
          });
          // Invalidate all queries starting with USERS_COUNT_QUERY_KEY for the current workspace
          queryClient.invalidateQueries({
            queryKey: [USERS_COUNT_QUERY_KEY, workspaceId],
          });
        }, 1500); // 1.5 second delay
      }
    },
  });
}
