import {
  useMutation,
  UseMutationOptions,
  useQueryClient,
} from "@tanstack/react-query";
import axios from "axios";
import {
  BroadcastResourceAllVersions,
  BroadcastResourceV2,
  CompletionStatus,
  GetBroadcastsResponse,
  UpdateBroadcastArchiveRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

// Context type for mutation rollback
interface ArchiveMutationContext {
  previousBroadcastsResponse: GetBroadcastsResponse | null | undefined;
}

// Type for the data passed to the mutation function
interface ArchiveBroadcastPayload {
  archived: boolean;
}

// Options for the custom hook
type ArchiveBroadcastHookOptions = Omit<
  UseMutationOptions<
    BroadcastResourceV2,
    Error,
    ArchiveBroadcastPayload,
    ArchiveMutationContext // TContext for archive mutation
  >,
  "mutationFn" | "onMutate"
>;

export function useArchiveBroadcastMutation(
  broadcastId: string,
  hookOpts?: ArchiveBroadcastHookOptions,
) {
  const { workspace } = useAppStorePick(["workspace"]);
  const queryClient = useQueryClient();
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (payload: ArchiveBroadcastPayload) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const workspaceId = workspace.value.id;
    const requestData: UpdateBroadcastArchiveRequest = {
      workspaceId,
      broadcastId,
      archived: payload.archived,
    };

    // API endpoint for archiving broadcasts
    const response = await axios.put<BroadcastResourceV2>(
      `${baseApiUrl}/broadcasts/archive`,
      requestData,
      { headers: authHeaders },
    );
    return response.data;
  };

  // Destructure user-provided callbacks and the rest of the options
  const {
    onError: userOnError,
    onSettled: userOnSettled,
    ...restHookOpts
  } = hookOpts ?? {};

  return useMutation<
    BroadcastResourceV2, // Type of data returned by mutationFn
    Error, // Type of error
    ArchiveBroadcastPayload, // Type of variables passed to mutationFn
    ArchiveMutationContext // Type of context used in onMutate and onError
  >({
    mutationFn,
    onMutate: async (payload: ArchiveBroadcastPayload) => {
      // Internal onMutate logic for optimistic update
      if (workspace.type !== CompletionStatus.Successful) {
        return undefined;
      }
      const workspaceId = workspace.value.id;
      const queryKey = ["broadcasts", { ids: [broadcastId], workspaceId }];

      await queryClient.cancelQueries({ queryKey });

      const previousBroadcastsResponse =
        queryClient.getQueryData<GetBroadcastsResponse>(queryKey);

      queryClient.setQueryData<GetBroadcastsResponse>(queryKey, (response) => {
        const oldData = response?.[0] ?? null;
        if (!oldData) {
          return response;
        }
        const updatedBroadcast: BroadcastResourceAllVersions = {
          ...oldData,
          archived: payload.archived,
        };
        return [updatedBroadcast];
      });

      return { previousBroadcastsResponse };
    },
    onError: (error, variables, context) => {
      // Internal onError logic: Rollback cache
      if (
        context?.previousBroadcastsResponse !== undefined &&
        workspace.type === CompletionStatus.Successful
      ) {
        const workspaceId = workspace.value.id;
        const queryKey = ["broadcasts", { ids: [broadcastId], workspaceId }];
        queryClient.setQueryData(queryKey, context.previousBroadcastsResponse);
      }
      userOnError?.(error, variables, context);
    },
    onSettled: (data, error, variables, context) => {
      // Internal onSettled logic: invalidate queries
      if (workspace.type !== CompletionStatus.Successful) {
        return;
      }
      const workspaceId = workspace.value.id;
      const singleBroadcastQueryKey = [
        "broadcasts",
        { ids: [broadcastId], workspaceId },
      ];
      queryClient.invalidateQueries({ queryKey: singleBroadcastQueryKey });

      const allBroadcastsQueryKey = ["broadcasts", { workspaceId }];
      queryClient.invalidateQueries({ queryKey: allBroadcastsQueryKey });

      userOnSettled?.(data, error, variables, context);
    },
    ...restHookOpts,
  });
}
