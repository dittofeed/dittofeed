import { CircularProgress, Stack, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  BroadcastResourceAllVersions,
  BroadcastResourceV2,
  ChannelType,
  CompletionStatus,
  UpsertBroadcastV2Request,
} from "isomorphic-lib/src/types";
import { useCallback } from "react";

import { useAppStorePick } from "../../lib/appStore";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import {
  SubscriptionGroupAutocompleteV2,
  SubscriptionGroupChangeHandler,
} from "../subscriptionGroupAutocomplete";
import { BroadcastState, BroadcastStateUpdater } from "./broadcastsShared";

// Context type for mutation rollback
interface MutationContext {
  previousBroadcastData: BroadcastResourceAllVersions | null | undefined;
}

// Mutation hook for updating broadcasts
function useBroadcastMutation(broadcastId: string) {
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);
  const queryClient = useQueryClient();

  const mutationFn = async (
    updateData: Partial<Omit<UpsertBroadcastV2Request, "workspaceId" | "id">>,
  ) => {
    console.log("mutationFn", updateData);
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
        console.error("Workspace not ready for optimistic update");
        // Optionally throw or handle differently
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

      queryClient.setQueryData<BroadcastResourceAllVersions | null>(
        queryKey,
        (oldData) => {
          if (!oldData || oldData.version !== "V2") {
            // Don't update if old data doesn't exist or isn't V2
            return oldData;
          }
          // Create a new object with the updated field
          return {
            ...oldData,
            subscriptionGroupId:
              optimisticSubscriptionGroupId === undefined
                ? oldData.subscriptionGroupId
                : optimisticSubscriptionGroupId,
          };
        },
      );

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
    onSettled: (data, error) => {
      console.log("onSettled, data:", data, "error:", error);
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
      console.log("Invalidating queryKey:", queryKey);
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

export default function Recipients({
  state,
  updateState,
}: {
  state: BroadcastState;
  updateState: BroadcastStateUpdater;
}) {
  const broadcastQuery = useBroadcastQuery(state.id);
  const broadcastMutation = useBroadcastMutation(state.id);

  const handleSubscriptionGroupChange: SubscriptionGroupChangeHandler =
    useCallback(
      (sg) => {
        const newSubscriptionGroupId = sg?.id ?? null;

        // Persist the change via mutation
        broadcastMutation.mutate({
          subscriptionGroupId: newSubscriptionGroupId,
        });
      },
      [broadcastMutation],
    );

  // Data is available now, assign to const for type narrowing
  const broadcast = broadcastQuery.data;
  const channel = broadcast?.config.message.type;

  let subscriptionGroupAutocomplete: React.ReactNode = null;
  if (channel) {
    subscriptionGroupAutocomplete = (
      <SubscriptionGroupAutocompleteV2
        channel={channel}
        subscriptionGroupId={
          broadcastQuery.data?.version === "V2"
            ? broadcastQuery.data.subscriptionGroupId ?? undefined
            : undefined
        }
        handler={handleSubscriptionGroupChange}
      />
    );
  }
  return <div>{subscriptionGroupAutocomplete}</div>;
}
