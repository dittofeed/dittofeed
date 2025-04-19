import {
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import deepEqual from "fast-deep-equal";
import {
  getBroadcastSegmentId,
  getBroadcastSegmentName,
} from "isomorphic-lib/src/broadcasts";
import {
  BroadcastResourceAllVersions,
  BroadcastResourceV2,
  CompletionStatus,
  SavedSegmentResource,
  SegmentDefinition,
  SegmentNode,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentResource,
  UpsertBroadcastV2Request,
} from "isomorphic-lib/src/types";
import { useCallback, useEffect, useState } from "react";
import { useDebounce } from "use-debounce";
import { useImmer } from "use-immer";

import { useAppStorePick } from "../../lib/appStore";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import { useSegmentQuery } from "../../lib/useSegmentQuery";
import { useUpdateSegmentsMutation } from "../../lib/useUpdateSegmentsMutation";
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
import { BroadcastState } from "./broadcastsShared";

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

// Context type for mutation rollback
interface MutationContext {
  previousBroadcastData: BroadcastResourceAllVersions | null | undefined;
}

function BroadcastSegmentEditor({
  broadcastId,
  disabled,
}: {
  broadcastId: string;
  disabled?: boolean;
}) {
  const { workspace } = useAppStorePick(["workspace"]);
  const updateSegmentsMutation = useUpdateSegmentsMutation();
  const broadcastMutation = useBroadcastMutation(broadcastId);
  const { data: broadcast } = useBroadcastQuery(broadcastId);
  const {
    data: segment,
    isLoading: isSegmentLoading,
    isError: isSegmentError,
  } = useSegmentQuery(broadcast?.segmentId);

  useEffect(() => {
    if (
      broadcast?.segmentId !== undefined ||
      workspace.type !== CompletionStatus.Successful
    ) {
      return;
    }
    const workspaceId = workspace.value.id;
    const newSegmentId = getBroadcastSegmentId({ broadcastId, workspaceId });
    const newSegmentName = getBroadcastSegmentName({
      broadcastId,
    });

    const entryNode: SegmentNode = {
      id: "1",
      type: SegmentNodeType.Trait,
      path: "firstName",
      operator: {
        type: SegmentOperatorType.Exists,
      },
    };
    const definition: SegmentDefinition = {
      entryNode,
      nodes: [entryNode],
    };

    updateSegmentsMutation.mutate(
      {
        id: newSegmentId,
        name: newSegmentName,
        definition,
      },
      {
        onSuccess: () => {
          broadcastMutation.mutate({ segmentId: newSegmentId });
        },
      },
    );
  }, [
    broadcastId,
    broadcast?.segmentId,
    updateSegmentsMutation,
    workspace,
    broadcastMutation.mutate,
    broadcastMutation,
  ]);

  const [editedSegment] = useImmer<SegmentResource | null>(segment ?? null);
  const [debouncedEditedSegment] = useDebounce(editedSegment, 1000);
  useEffect(() => {
    if (deepEqual(debouncedEditedSegment, segment)) {
      return;
    }
    updateSegmentsMutation.mutate({
      id: broadcast?.segmentId,
      definition: debouncedEditedSegment?.definition,
      name: debouncedEditedSegment?.name,
    });
  }, [debouncedEditedSegment, segment]);
  // when making updates to this function DO NOT delete the below comments
  // 1. create a new segment if none exists or if segmentId is undefined, using
  // the getBroadcastSegmentId function to produce a unique id. use the
  // useUpdateSegmentsMutation hook to create the segment, which is an upsert
  // operation.
  // 2. use useSegmentQuery to read the segment
  // 3. use mutation to update the segment
  // 4. use useImmer to with a copy of the segment
  // 5. debounce updates to the copy of the segment
  // 6. use effect to trigger a mutation when the debounced updates are changed relative to the original
  // 7. use the useUpdateSegmentsMutation hook to update the segment
  // 8. use the useSegmentQuery hook to read the segment
  if (!editedSegment) {
    return null;
  }
  return (
    <SegmentEditorInner disabled={disabled} editedSegment={editedSegment} />
  );
}

export default function Recipients({ state }: { state: BroadcastState }) {
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
        <BroadcastSegmentEditor broadcastId={state.id} disabled={disabled} />
      )}
    </Stack>
  );
}
