import { CircularProgress, Stack, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ChannelType } from "isomorphic-lib/src/types";
import {
  BroadcastResourceV2,
  CompletionStatus,
  UpsertBroadcastV2Request,
} from "isomorphic-lib/src/types";
import { useCallback } from "react";
import { useEffect, useState } from "react";

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
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const workspaceId = workspace.value.id;
    const requestData: UpsertBroadcastV2Request = {
      ...updateData,
      workspaceId,
      id: broadcastId,
    };

    // We need to send the full config, so we'll fetch the current one first
    // Alternatively, the backend could support partial updates
    const currentBroadcast = await queryClient.fetchQuery<
      BroadcastResourceV2 | undefined | null
    >({
      queryKey: ["broadcast", broadcastId],
    });

    if (!currentBroadcast?.config) {
      throw new Error("Could not fetch current broadcast config to update.");
    }

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
      queryClient.invalidateQueries({ queryKey: ["broadcast", broadcastId] });
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
    if (broadcastQuery?.data) {
      const subId = broadcastQuery.data.subscriptionGroupId ?? null;
      setSelectedSubscriptionGroupId(subId);
    } else {
      // Set to undefined if data is null or undefined initially
      setSelectedSubscriptionGroupId(undefined);
    }
  }, [broadcastQuery.data?.subscriptionGroupId]); // Depend on the specific field

  const handleSubscriptionGroupChange: SubscriptionGroupChangeHandler =
    useCallback(
      (sg) => {
        const newSubscriptionGroupId = sg?.id ?? null;
        // Optimistically update local state
        setSelectedSubscriptionGroupId(newSubscriptionGroupId);

        // Persist the change via mutation
        broadcastMutation.mutate({
          subscriptionGroupId: newSubscriptionGroupId,
        });

        // Also update the shared state if necessary (depends on usage)
        // updateState((draft) => {
        //   if (!draft) return;
        //   draft.subscriptionGroupId = newSubscriptionGroupId;
        // });
      },
      [broadcastMutation /*, updateState */], // Remove updateState if not used here
    );

  // --- Loading and Error States ---
  if (broadcastQuery.isLoading || broadcastQuery.isFetching) {
    return (
      <Stack spacing={1} alignItems="center" sx={{ padding: 2 }}>
        <CircularProgress />
        <Typography>Loading broadcast details...</Typography>
      </Stack>
    );
  }

  if (broadcastQuery.isError) {
    return (
      <Typography sx={{ padding: 2 }} color="error">
        Failed to load broadcast details.
      </Typography>
    );
  }

  if (!broadcastQuery.data) {
    return (
      <Typography sx={{ padding: 2 }} color="error">
        Broadcast not found.
      </Typography>
    );
  }

  // --- End Loading and Error States ---

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

  return (
    <div>
      {channel ? (
        <SubscriptionGroupAutocompleteV2
          channel={channel}
          // Use local state for the value, handle undefined loading state
          subscriptionGroupId={selectedSubscriptionGroupId ?? undefined}
          handler={handleSubscriptionGroupChange}
        />
      ) : (
        <Typography color="error">
          Could not determine broadcast channel.
        </Typography>
      )}
    </div>
  );
}
