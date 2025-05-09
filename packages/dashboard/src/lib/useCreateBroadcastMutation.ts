import {
  useMutation,
  UseMutationOptions,
  useQueryClient,
} from "@tanstack/react-query";
import axios from "axios";
import {
  BroadcastResourceV2,
  CompletionStatus,
  GetBroadcastsResponse,
  UpsertBroadcastV2Request,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

// Type for the variables passed to the mutation function when creating a broadcast
type CreateBroadcastVariables = { name: string } & Partial<
  Omit<UpsertBroadcastV2Request, "workspaceId" | "id">
>;

// Options for the custom hook, omitting mutationFn as it's handled internally
type CreateBroadcastHookOptions = Omit<
  UseMutationOptions<
    BroadcastResourceV2,
    Error,
    CreateBroadcastVariables,
    unknown // TContext for create mutation
  >,
  "mutationFn"
>;

export function useCreateBroadcastMutation(
  hookOpts?: CreateBroadcastHookOptions,
) {
  const { workspace } = useAppStorePick(["workspace"]);
  const queryClient = useQueryClient();
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (
    createData: CreateBroadcastVariables,
  ): Promise<BroadcastResourceV2> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for broadcast creation.");
    }
    const workspaceId = workspace.value.id;
    // Generate a new UUID for the broadcast ID client-side

    const requestData: UpsertBroadcastV2Request = {
      workspaceId,
      ...createData,
    };

    const response = await axios.put<BroadcastResourceV2>(
      `${baseApiUrl}/broadcasts/v2`,
      requestData,
      { headers: authHeaders },
    );
    return response.data;
  };

  // Destructure user-provided callbacks and the rest of the options
  const {
    onSuccess: userOnSuccess,
    onSettled: userOnSettled,
    ...restHookOpts
  } = hookOpts ?? {};

  return useMutation<
    BroadcastResourceV2, // TData (data returned by mutationFn)
    Error, // TError
    CreateBroadcastVariables, // TVariables (data passed to mutationFn)
    unknown // TContext (not using context here)
  >({
    mutationFn,
    onSuccess: (data, variables, context) => {
      // Internal onSuccess logic: add to cache
      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        const queryKey = ["broadcasts", { ids: [data.id], workspaceId }];
        queryClient.setQueryData<GetBroadcastsResponse>(queryKey, [data]);
      }
      // Call user-provided onSuccess
      userOnSuccess?.(data, variables, context);
    },
    onSettled: (data, error, variables, context) => {
      // Internal onSettled logic: invalidate queries
      if (workspace.type !== CompletionStatus.Successful) {
        return;
      }
      const workspaceId = workspace.value.id;
      if (data?.id) {
        const specificQueryKey = [
          "broadcasts",
          { ids: [data.id], workspaceId },
        ];
        queryClient.invalidateQueries({ queryKey: specificQueryKey });
      }
      const listQueryKey = ["broadcasts", { workspaceId }];
      queryClient.invalidateQueries({ queryKey: listQueryKey });

      // Call user-provided onSettled
      userOnSettled?.(data, error, variables, context);
    },
    ...restHookOpts, // Spread the rest of the options
  });
}
