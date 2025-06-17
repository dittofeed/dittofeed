import {
  useMutation,
  UseMutationOptions,
  useQueryClient,
} from "@tanstack/react-query";
import axios from "axios";
import {
  CompletionStatus,
  SavedSubscriptionGroupResource,
  SubscriptionGroupType,
  UpsertSubscriptionGroupResource,
  UpsertSubscriptionGroupResourceOther,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { SUBSCRIPTION_GROUPS_QUERY_KEY } from "./useSubscriptionGroupsQuery";

type CreateSubscriptionGroupVariables = {
  name: string;
  type?: SubscriptionGroupType;
} & Omit<UpsertSubscriptionGroupResourceOther, "workspaceId" | "type">;

type CreateSubscriptionGroupHookOptions = Omit<
  UseMutationOptions<
    SavedSubscriptionGroupResource,
    Error,
    CreateSubscriptionGroupVariables
  >,
  "mutationFn"
>;

export function useCreateSubscriptionGroupMutation(
  hookOpts?: CreateSubscriptionGroupHookOptions,
) {
  const { workspace } = useAppStorePick(["workspace"]);
  const queryClient = useQueryClient();
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (
    createData: CreateSubscriptionGroupVariables,
  ): Promise<SavedSubscriptionGroupResource> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error(
        "Workspace not available for subscription group creation.",
      );
    }
    const workspaceId = workspace.value.id;

    const requestData: UpsertSubscriptionGroupResource = {
      workspaceId,
      ...createData,
      type: createData.type ?? SubscriptionGroupType.OptOut,
    };

    const response = await axios.put<SavedSubscriptionGroupResource>(
      `${baseApiUrl}/subscription-groups`,
      requestData,
      { headers: authHeaders },
    );
    return response.data;
  };

  const {
    onSuccess: userOnSuccess,
    onSettled: userOnSettled,
    ...restHookOpts
  } = hookOpts ?? {};

  return useMutation<
    SavedSubscriptionGroupResource,
    Error,
    CreateSubscriptionGroupVariables
  >({
    mutationFn,
    onSuccess: (data, variables, context) => {
      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        const queryKey = [SUBSCRIPTION_GROUPS_QUERY_KEY, { workspaceId }];
        queryClient.invalidateQueries({ queryKey });
      }
      userOnSuccess?.(data, variables, context);
    },
    onSettled: (data, error, variables, context) => {
      if (workspace.type !== CompletionStatus.Successful) {
        return;
      }
      const workspaceId = workspace.value.id;
      const listQueryKey = [SUBSCRIPTION_GROUPS_QUERY_KEY, { workspaceId }];
      queryClient.invalidateQueries({ queryKey: listQueryKey });

      userOnSettled?.(data, error, variables, context);
    },
    ...restHookOpts,
  });
}
