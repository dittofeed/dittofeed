import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CompletionStatus,
  UpsertSubscriptionGroupAssignmentsRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { USERS_COUNT_QUERY_KEY } from "./useUsersCountQuery";
import { USERS_QUERY_KEY } from "./useUsersQuery";

export interface UpdateSubscriptionAssignmentVariables {
  userId: string;
  subscriptionGroupId: string;
  isSubscribed: boolean;
}

export type UseUpdateSubscriptionAssignmentMutationOptions = Omit<
  UseMutationOptions<void, AxiosError, UpdateSubscriptionAssignmentVariables>,
  "mutationFn"
>;

export function useUpdateSubscriptionAssignmentMutation(
  options?: UseUpdateSubscriptionAssignmentMutationOptions,
): UseMutationResult<void, AxiosError, UpdateSubscriptionAssignmentVariables> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (
    variables: UpdateSubscriptionAssignmentVariables,
  ): Promise<void> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for subscription update");
    }
    const workspaceId = workspace.value.id;

    const requestData: UpsertSubscriptionGroupAssignmentsRequest = {
      workspaceId,
      userUpdates: [
        {
          userId: variables.userId,
          changes: {
            [variables.subscriptionGroupId]: variables.isSubscribed,
          },
        },
      ],
    };

    await axios.put(
      `${baseApiUrl}/subscription-groups/assignments`,
      requestData,
      {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      },
    );
  };

  return useMutation<void, AxiosError, UpdateSubscriptionAssignmentVariables>({
    mutationFn,
    ...options,
    onSuccess: (data, variables, context) => {
      // Call user-provided onSuccess first
      options?.onSuccess?.(data, variables, context);

      // Then, invalidate queries after a delay to accommodate the time it takes for the backend to process
      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        setTimeout(() => {
          queryClient.invalidateQueries({
            queryKey: [USERS_QUERY_KEY, workspaceId],
          });
          queryClient.invalidateQueries({
            queryKey: [USERS_COUNT_QUERY_KEY, workspaceId],
          });
        }, 1500);
      }
    },
  });
}
