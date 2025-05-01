import {
  Box,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  getBroadcastSegmentId,
  getBroadcastSegmentName,
} from "isomorphic-lib/src/broadcasts";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  CompletionStatus,
  SegmentDefinition,
  SegmentNode,
  SegmentNodeType,
} from "isomorphic-lib/src/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { useAppStorePick } from "../../lib/appStore";
import { useBroadcastMutation } from "../../lib/useBroadcastMutation";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import { useRecomputeBroadcastSegmentMutation } from "../../lib/useRecomputeBroadcastSegmentMutation";
import { useUpdateSegmentsMutation } from "../../lib/useUpdateSegmentsMutation";
import SegmentEditor, { SegmentEditorProps } from "../segmentEditor";
import {
  SegmentChangeHandler,
  SegmentsAutocomplete,
} from "../segmentsAutocomplete";
import {
  SubscriptionGroupAutocompleteV2,
  SubscriptionGroupChangeHandler,
} from "../subscriptionGroupAutocomplete";
import { BroadcastState } from "./broadcastsShared";

function BroadcastSegmentEditor({
  broadcastId,
  disabled,
}: {
  broadcastId: string;
  disabled?: boolean;
}) {
  const { workspace } = useAppStorePick(["workspace"]);
  const recomputeBroadcastSegmentMutation =
    useRecomputeBroadcastSegmentMutation();
  const updateSegmentsMutation = useUpdateSegmentsMutation();
  const broadcastMutation = useBroadcastMutation(broadcastId);
  const { data: broadcast } = useBroadcastQuery(broadcastId);
  const segmentId = useMemo<string | undefined>(
    () => broadcast?.segmentId,
    [broadcast?.segmentId],
  );
  const isInternalSegment = useMemo(() => {
    if (workspace.type !== CompletionStatus.Successful) {
      return false;
    }
    const workspaceId = workspace.value.id;
    return segmentId === getBroadcastSegmentId({ broadcastId, workspaceId });
  }, [segmentId, broadcastId, workspace]);

  useEffect(() => {
    if (isInternalSegment || workspace.type !== CompletionStatus.Successful) {
      return;
    }
    const workspaceId = workspace.value.id;
    const newSegmentId = getBroadcastSegmentId({ broadcastId, workspaceId });
    const newSegmentName = getBroadcastSegmentName({
      broadcastId,
    });

    const entryNode: SegmentNode = {
      id: "1",
      type: SegmentNodeType.Everyone,
    };
    const definition: SegmentDefinition = {
      entryNode,
      nodes: [],
    };

    updateSegmentsMutation.mutate(
      {
        id: newSegmentId,
        name: newSegmentName,
        definition,
        resourceType: "Internal",
        status: "NotStarted",
        createOnly: true,
      },
      {
        onSuccess: () => {
          broadcastMutation.mutate({ segmentId: newSegmentId });
          recomputeBroadcastSegmentMutation.mutate({
            broadcastId,
          });
        },
      },
    );
  }, [workspace, segmentId, broadcastId]);

  const segmentsUpdateMutation = useUpdateSegmentsMutation();

  const updateSegmentCallback: SegmentEditorProps["onSegmentChange"] =
    useDebouncedCallback((s) => {
      segmentsUpdateMutation.mutate(
        {
          id: s.id,
          definition: s.definition,
          name: s.name,
        },
        {
          onSuccess: () => {
            recomputeBroadcastSegmentMutation.mutate({
              broadcastId,
            });
          },
        },
      );
    }, 1500);

  if (segmentId === undefined || !isInternalSegment) {
    return null;
  }
  return (
    <SegmentEditor
      disabled={disabled}
      segmentId={segmentId}
      onSegmentChange={updateSegmentCallback}
    />
  );
}

export default function Recipients({ state }: { state: BroadcastState }) {
  const { workspace } = useAppStorePick(["workspace"]);
  const broadcastQuery = useBroadcastQuery(state.id);
  const broadcastMutation = useBroadcastMutation(state.id);
  const [selectExistingSegment, setSelectExistingSegment] = useState<
    "existing" | "new" | null
  >(null);

  useEffect(() => {
    if (
      !broadcastQuery.data ||
      workspace.type !== CompletionStatus.Successful ||
      selectExistingSegment !== null
    ) {
      return;
    }
    if (
      broadcastQuery.data.segmentId &&
      broadcastQuery.data.segmentId ===
        getBroadcastSegmentId({
          broadcastId: state.id,
          workspaceId: workspace.value.id,
        })
    ) {
      setSelectExistingSegment("new");
      return;
    }
    setSelectExistingSegment("existing");
  }, [broadcastQuery.data, state.id, workspace, selectExistingSegment]);

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
    (segment: { id: string } | null) => {
      const newSegmentId = segment?.id ?? null;

      // Persist the change via mutation
      broadcastMutation.mutate({
        segmentId: newSegmentId,
      });
    },
    [broadcastMutation],
  );

  // Data is available now, assign to const for type narrowing
  const broadcast = broadcastQuery.data;
  const disabled = broadcast?.status !== "Draft";
  const channel = broadcast?.config.message.type;

  if (broadcastQuery.isLoading) {
    return null;
  }

  if (!broadcast || broadcast.version !== "V2") {
    return null;
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
  let segmentSelect: React.ReactNode;
  switch (selectExistingSegment) {
    case "existing":
      segmentSelect = (
        <Box sx={{ maxWidth: 600 }}>
          <SegmentsAutocomplete
            segmentId={currentSegmentId}
            handler={handleSegmentChange}
            disabled={disabled}
          />
        </Box>
      );
      break;
    case "new":
      segmentSelect = (
        <BroadcastSegmentEditor broadcastId={state.id} disabled={disabled} />
      );
      break;
    case null:
      segmentSelect = null;
      break;
    default:
      assertUnreachable(selectExistingSegment);
  }
  return (
    <Stack spacing={2}>
      <Typography variant="caption" sx={{ mb: -1 }}>
        Subscription Group (Required)
      </Typography>
      <Box sx={{ maxWidth: 600 }}>{subscriptionGroupAutocomplete}</Box>
      <Typography variant="body2" sx={{ mt: 1, maxWidth: 600 }}>
        Select a Subscription Group (required). Optionally, you can select an
        additional segment which will further restrict the set of messaged users
        to those both in the selected subscription group and the segment.
      </Typography>
      <Typography variant="caption" sx={{ mb: -1 }}>
        Segment (Optional)
      </Typography>
      <ToggleButtonGroup
        value={selectExistingSegment}
        exclusive
        disabled={disabled || selectExistingSegment === null}
        onChange={(_, newValue) => {
          if (newValue !== null) {
            setSelectExistingSegment(newValue);
            if (newValue === "existing") {
              broadcastMutation.mutate({ segmentId: null });
            }
          }
        }}
      >
        <ToggleButton value="existing">Existing Segment</ToggleButton>
        <ToggleButton value="new">New Segment</ToggleButton>
      </ToggleButtonGroup>
      {segmentSelect}
    </Stack>
  );
}
