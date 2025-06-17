import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CompletionStatus,
  DeleteSubscriptionGroupRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { SUBSCRIPTION_GROUPS_QUERY_KEY } from "./useSubscriptionGroupsQuery";

type DeleteSubscriptionGroupMutationFn = (
  subscriptionGroupId: string,
) => Promise<void>;

export function useDeleteSubscriptionGroupMutation(
  options?: Omit<UseMutationOptions<void, AxiosError, string>, "mutationFn">,
): UseMutationResult<void, AxiosError, string> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: DeleteSubscriptionGroupMutationFn = async (id) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error(
        "Workspace not available for subscription group deletion",
      );
    }
    const workspaceId = workspace.value.id;

    await axios.delete(`${baseApiUrl}/subscription-groups`, {
      data: {
        workspaceId,
        id,
      } satisfies DeleteSubscriptionGroupRequest,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
    });
  };

  const mutation = useMutation<void, AxiosError, string>({
    mutationFn,
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);

      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        queryClient.invalidateQueries({
          queryKey: [SUBSCRIPTION_GROUPS_QUERY_KEY, { workspaceId }],
        });
      }
    },
  });

  return mutation;
}
