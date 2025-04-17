import {
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  BroadcastResourceAllVersions,
  BroadcastResourceV2,
  CompletionStatus,
  UpsertBroadcastV2Request,
} from "isomorphic-lib/src/types";
import { useCallback, useState } from "react";

import { useAppStorePick } from "../../lib/appStore";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import { SegmentEditorInner } from "../segmentEditor";
import {
  SegmentChangeHandler,
  SegmentsAutocomplete,
  SimpleSegment,
} from "../segmentsAutocomplete";
import {
  SubscriptionGroupAutocompleteV2,
  SubscriptionGroupChangeHandler,
} from "../subscriptionGroupAutocomplete";
import { BroadcastState, BroadcastStateUpdater } from "./broadcastsShared";

// Context type for mutation rollback
interface MutationContext {
  previousBroadcastData: BroadcastResourceAllVersions | null | undefined;
}

function BroadcastSegmentEditor() {
  // use query to read the segment
  // use mutation to update the segment
  // use immer to with a copy of the segment
  // debounce updates to the copy of the segment
  // use effect to trigger a mutation when the debounced updates are changed relative to the original
  // return <SegmentEditorInner />;
  return <>Segment Editor</>;
}

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
                : optimisticSubscriptionGroupId ?? undefined,
            segmentId:
              newData.segmentId === undefined
                ? oldData.segmentId
                : newData.segmentId ?? undefined,
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
  const [selectExistingSegment, setSelectExistingSegment] = useState<
    "existing" | "new"
  >("existing");

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

  // Added handler for segment changes
  const handleSegmentChange: SegmentChangeHandler = useCallback(
    (segment: SimpleSegment | null) => {
      const newSegmentId = segment?.id ?? null;

      // Persist the change via mutation
      broadcastMutation.mutate({
        segmentId: newSegmentId,
      });
    },
    [broadcastMutation],
  );

  if (broadcastQuery.isLoading) {
    return null;
  }

  // Data is available now, assign to const for type narrowing
  const broadcast = broadcastQuery.data;
  const disabled = broadcast?.status !== "Draft";
  const channel = broadcast?.config.message.type;

  if (!broadcast || broadcast.version !== "V2") {
    throw new Error("Broadcast not found");
  }

  const currentSegmentId = broadcast.segmentId ?? undefined;
  const currentSubscriptionGroupId = broadcast.subscriptionGroupId ?? undefined;

  let subscriptionGroupAutocomplete: React.ReactNode = null;
  if (channel) {
    subscriptionGroupAutocomplete = (
      <SubscriptionGroupAutocompleteV2
        channel={channel}
        subscriptionGroupId={currentSubscriptionGroupId}
        handler={handleSubscriptionGroupChange}
        disabled={disabled}
        disableClearable
      />
    );
  }
  return (
    <Stack spacing={2} sx={{ maxWidth: 600 }}>
      <Typography variant="caption" sx={{ mb: -1 }}>
        Subscription Group (Required)
      </Typography>
      {subscriptionGroupAutocomplete}
      <Typography variant="body2" sx={{ mt: 1 }}>
        Select a Subscription Group (required). Optionally, you can select an
        additional segment which will further restrict the set of messaged users
        to those both in the selected subscription group and the segment.
      </Typography>
      <Typography variant="caption" sx={{ mb: -1 }}>
        Segment (Optional)
      </Typography>
      <Stack direction="row" spacing={1}>
        <ToggleButtonGroup
          value={selectExistingSegment}
          exclusive
          disabled={disabled}
          onChange={(_, newValue) => {
            if (newValue !== null) {
              setSelectExistingSegment(newValue);
            }
          }}
        >
          <ToggleButton value="existing">Existing Segment</ToggleButton>
          <ToggleButton value="new">New Segment</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {selectExistingSegment === "existing" ? (
        <SegmentsAutocomplete
          segmentId={currentSegmentId}
          handler={handleSegmentChange}
          disabled={disabled}
        />
      ) : (
        <BroadcastSegmentEditor />
      )}
    </Stack>
  );
}
