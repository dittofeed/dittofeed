import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  BroadcastResourceAllVersions,
  BroadcastResourceV2,
  CompletionStatus,
  GetBroadcastsResponse,
  UpdateBroadcastArchiveRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";

// Context type for mutation rollback
interface ArchiveMutationContext {
  previousBroadcastsResponse: GetBroadcastsResponse | null | undefined;
}

// Type for the data passed to the mutation function
interface ArchiveBroadcastPayload {
  archived: boolean;
}

export function useArchiveBroadcastMutation(broadcastId: string) {
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);
  const queryClient = useQueryClient();

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
      `${apiBase}/api/broadcasts/archive`,
      requestData,
    );
    return response.data;
  };

  return useMutation<
    BroadcastResourceV2, // Type of data returned by mutationFn
    Error, // Type of error
    ArchiveBroadcastPayload, // Type of variables passed to mutationFn
    ArchiveMutationContext // Type of context used in onMutate and onError
  >({
    mutationFn,
    onMutate: async (payload: ArchiveBroadcastPayload) => {
      if (workspace.type !== CompletionStatus.Successful) {
        return undefined; // Skip optimistic update if workspace isn't ready
      }
      const workspaceId = workspace.value.id;
      // Query key for the specific broadcast, assuming it's fetched as an array
      const queryKey = ["broadcasts", { ids: [broadcastId], workspaceId }];

      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousBroadcastsResponse =
        queryClient.getQueryData<GetBroadcastsResponse>(queryKey);

      // Optimistically update to the new value
      queryClient.setQueryData<GetBroadcastsResponse>(queryKey, (response) => {
        const oldData = response?.[0] ?? null;
        if (!oldData) {
          // If the broadcast is not in cache, or response is not as expected,
          // return the current response to avoid errors.
          // This scenario should ideally not happen if we are archiving an existing broadcast.
          return response;
        }
        // Create a new object with the updated 'archived' field
        const updatedBroadcast: BroadcastResourceAllVersions = {
          ...oldData,
          archived: payload.archived,
        };
        // Return as an array, consistent with GetBroadcastsResponse
        return [updatedBroadcast];
      });

      // Return context object with the snapshotted value
      return { previousBroadcastsResponse };
    },
    onError: (err, variables, context) => {
      console.error("Archive mutation failed:", err);
      // Rollback cache using the value from onMutate context
      if (
        context?.previousBroadcastsResponse !== undefined &&
        workspace.type === CompletionStatus.Successful
      ) {
        const workspaceId = workspace.value.id;
        const queryKey = ["broadcasts", { ids: [broadcastId], workspaceId }];
        queryClient.setQueryData(queryKey, context.previousBroadcastsResponse);
      }
      // TODO: Add user-facing error feedback (e.g., snackbar)
    },
    // Always refetch after error or success to ensure consistency
    onSettled: () => {
      if (workspace.type !== CompletionStatus.Successful) {
        console.warn(
          "Workspace not available, skipping query invalidation on settle.",
        );
        return;
      }
      const workspaceId = workspace.value.id;
      // Invalidate the query for the specific broadcast
      const singleBroadcastQueryKey = [
        "broadcasts",
        { ids: [broadcastId], workspaceId },
      ];
      queryClient.invalidateQueries({ queryKey: singleBroadcastQueryKey });

      // Also invalidate the general list of broadcasts, as archive status can affect it
      const allBroadcastsQueryKey = ["broadcasts", { workspaceId }];
      queryClient.invalidateQueries({ queryKey: allBroadcastsQueryKey });
    },
  });
}
