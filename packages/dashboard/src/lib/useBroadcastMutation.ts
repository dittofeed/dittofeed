import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  BroadcastResourceAllVersions,
  BroadcastResourceV2,
  CompletionStatus,
  GetBroadcastsResponse,
  UpsertBroadcastV2Request,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";

// Context type for mutation rollback
interface MutationContext {
  previousBroadcastData: BroadcastResourceAllVersions | null | undefined;
}

// Mutation hook for updating broadcasts
export function useBroadcastMutation(broadcastId: string) {
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);
  const queryClient = useQueryClient();

  const mutationFn = async (
    updateData: Partial<Omit<UpsertBroadcastV2Request, "workspaceId" | "id">>,
  ) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const workspaceId = workspace.value.id;
    const requestData: UpsertBroadcastV2Request = {
      ...updateData,
      workspaceId,
      id: broadcastId,
    };

    const response = await axios.put<BroadcastResourceV2>(
      `${apiBase}/api/broadcasts/v2`,
      requestData,
    );
    return response.data;
  };

  return useMutation<
    BroadcastResourceV2,
    Error,
    Partial<Omit<UpsertBroadcastV2Request, "workspaceId" | "id">>,
    MutationContext
  >({
    mutationFn,
    onMutate: async (newData) => {
      if (workspace.type !== CompletionStatus.Successful) {
        return; // Skip optimistic update if workspace isn't ready
      }
      const workspaceId = workspace.value.id;
      const queryKey = ["broadcasts", { ids: [broadcastId], workspaceId }];

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousBroadcastData =
        queryClient.getQueryData<BroadcastResourceAllVersions | null>(queryKey);

      // Optimistically update to the new value in the cache
      const optimisticSubscriptionGroupId = newData.subscriptionGroupId;

      queryClient.setQueryData<GetBroadcastsResponse>(queryKey, (response) => {
        const oldData = response?.[0] ?? null;
        if (!oldData || oldData.version !== "V2") {
          return response;
        }
        // Create a new object with the updated field
        return [
          {
            ...oldData,
            subscriptionGroupId:
              optimisticSubscriptionGroupId === undefined
                ? oldData.subscriptionGroupId
                : optimisticSubscriptionGroupId ?? undefined,
            segmentId:
              newData.segmentId === undefined
                ? oldData.segmentId
                : newData.segmentId ?? undefined,
            scheduledAt:
              newData.scheduledAt === undefined
                ? oldData.scheduledAt
                : newData.scheduledAt ?? undefined,
            messageTemplateId:
              newData.messageTemplateId === undefined
                ? oldData.messageTemplateId
                : newData.messageTemplateId ?? undefined,
            config:
              newData.config === undefined
                ? oldData.config
                : newData.config ?? undefined,
          },
        ] satisfies GetBroadcastsResponse;
      });

      // Return context object with the snapshotted value
      return { previousBroadcastData };
    },
    onError: (err, variables, context) => {
      console.error("Mutation failed:", err);
      // Rollback cache using the value from onMutate context
      if (
        context?.previousBroadcastData !== undefined &&
        workspace.type === CompletionStatus.Successful
      ) {
        const workspaceId = workspace.value.id;
        const queryKey = ["broadcasts", { ids: [broadcastId], workspaceId }];
        queryClient.setQueryData(queryKey, context.previousBroadcastData);
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
      const queryKey = [
        "broadcasts",
        {
          ids: [broadcastId],
          workspaceId,
        },
      ];
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
