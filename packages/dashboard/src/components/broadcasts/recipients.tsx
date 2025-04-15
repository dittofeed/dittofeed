import { CircularProgress, Stack, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  BroadcastResourceV2,
  ChannelType,
  CompletionStatus,
  UpsertBroadcastV2Request,
} from "isomorphic-lib/src/types";
import { useCallback, useEffect, useState } from "react";

import { useAppStorePick } from "../../lib/appStore";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import {
  SubscriptionGroupAutocompleteV2,
  SubscriptionGroupChangeHandler,
} from "../subscriptionGroupAutocomplete";
import { BroadcastState, BroadcastStateUpdater } from "./broadcastsShared";

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

  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      // Invalidate and refetch the specific broadcast query
      const queryKey = [
        "broadcasts",
        { ids: [broadcastId], workspaceId: data.workspaceId },
      ];
      queryClient.invalidateQueries({ queryKey });
      // Optionally update the list query if relevant
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });

      // Optionally update the query cache directly for faster UI updates
      queryClient.setQueryData(["broadcast", broadcastId], data);

      // TODO: Add snackbar feedback
      console.log("Broadcast updated successfully:", data);
    },
    onError: (error) => {
      // TODO: Add snackbar feedback
      console.error("Failed to update broadcast:", error);
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
  // Local state for optimistic UI updates
  const [selectedSubscriptionGroupId, setSelectedSubscriptionGroupId] =
    useState<string | null | undefined>(undefined); // undefined means loading

  // Initialize local state when broadcast data loads or changes
  useEffect(() => {
    if (!broadcastQuery.data || broadcastQuery.data.version !== "V2") {
      return;
    }
    const subId = broadcastQuery.data.subscriptionGroupId ?? null;
    setSelectedSubscriptionGroupId(subId);
  }, [broadcastQuery.data]);

  const handleSubscriptionGroupChange: SubscriptionGroupChangeHandler =
    useCallback(
      (sg) => {
        console.log("handleSubscriptionGroupChange", sg);
        const newSubscriptionGroupId = sg?.id ?? null;
        // Optimistically update local state
        setSelectedSubscriptionGroupId(newSubscriptionGroupId);

        // Persist the change via mutation
        broadcastMutation.mutate({
          subscriptionGroupId: newSubscriptionGroupId ?? undefined,
        });
      },
      [broadcastMutation],
    );

  // Data is available now, assign to const for type narrowing
  const broadcast = broadcastQuery.data;

  let channel: ChannelType | undefined;
  // Use local state for currentSubscriptionGroupId
  // let currentSubscriptionGroupId: string | undefined;

  if (broadcast && "config" in broadcast) {
    const messageType = broadcast.config.message.type;
    if (
      messageType &&
      Object.values(ChannelType).includes(messageType as ChannelType)
    ) {
      channel = messageType as ChannelType;
    }
    // No longer needed, use local state selectedSubscriptionGroupId
    // currentSubscriptionGroupId = broadcastQuery.data.subscriptionGroupId ?? undefined;
  }

  let subscriptionGroupAutocomplete: React.ReactNode = null;
  if (channel) {
    subscriptionGroupAutocomplete = (
      <SubscriptionGroupAutocompleteV2
        channel={channel}
        subscriptionGroupId={selectedSubscriptionGroupId ?? undefined}
        handler={handleSubscriptionGroupChange}
      />
    );
  }
  return <div>{subscriptionGroupAutocomplete}</div>;
}
