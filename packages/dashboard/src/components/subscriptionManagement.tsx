import LoadingButton from "@mui/lab/LoadingButton";
import {
  Alert,
  Box,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { SubscriptionChange } from "backend-lib/src/types";
import {
  ChannelType,
  UserSubscriptionResource,
  UserSubscriptionsUpdate,
} from "isomorphic-lib/src/types";
import { enqueueSnackbar } from "notistack";
import React, { useMemo } from "react";
import { useImmer } from "use-immer";

import { noticeAnchorOrigin } from "../lib/notices";
import { useUpdateSubscriptionsMutation } from "../lib/useUpdateSubscriptionsMutation";

export type SubscriptionState = Record<string, boolean>;
export type ChannelState = Record<string, boolean>;
export interface SubscriptionManagementProps {
  subscriptions: UserSubscriptionResource[];
  changedSubscription?: string;
  subscriptionChange?: SubscriptionChange;
  changedSubscriptionChannel?: string;
  hash: string;
  identifier: string;
  identifierKey: string;
  workspaceId: string;
  workspaceName: string;
  apiBase: string;
}

export function SubscriptionManagement({
  subscriptions,
  changedSubscription,
  subscriptionChange,
  changedSubscriptionChannel,
  workspaceId,
  hash,
  identifier,
  identifierKey,
  workspaceName,
  apiBase,
}: SubscriptionManagementProps) {
  const initialSubscriptionManagementState = React.useMemo(
    () =>
      subscriptions.reduce<SubscriptionState>((acc, subscription) => {
        acc[subscription.id] = subscription.isSubscribed;
        return acc;
      }, {}),
    [subscriptions],
  );

  // Group subscriptions by channel
  const subscriptionsByChannel = React.useMemo(() => {
    const grouped = subscriptions.reduce<Record<string, UserSubscriptionResource[]>>((acc, subscription) => {
      const existingChannelSubs = acc[subscription.channel];
      if (existingChannelSubs) {
        existingChannelSubs.push(subscription);
      } else {
        acc[subscription.channel] = [subscription];
      }
      return acc;
    }, {});
    return grouped;
  }, [subscriptions]);

  // Calculate initial channel state based on subscription states
  const initialChannelState = React.useMemo(() => {
    const channelState: ChannelState = {};
    Object.entries(subscriptionsByChannel).forEach(([channel, channelSubscriptions]) => {
      if (channelSubscriptions && channelSubscriptions.length > 0) {
        // Channel is checked if ANY subscription in that channel is checked
        const anySubscribed = channelSubscriptions.some(sub => initialSubscriptionManagementState[sub.id]);
        channelState[channel] = anySubscribed;
      }
    });
    return channelState;
  }, [subscriptionsByChannel, initialSubscriptionManagementState]);

  const theme = useTheme();
  const [state, updateState] = useImmer<SubscriptionState>(
    initialSubscriptionManagementState,
  );
  const [channelState, updateChannelState] = useImmer<ChannelState>(
    initialChannelState,
  );

  const updateSubscriptionsMutation = useUpdateSubscriptionsMutation(apiBase, {
    onSuccess: () => {
      enqueueSnackbar("Updated subscription preferences.", {
        variant: "success",
        autoHideDuration: 3000,
        anchorOrigin: noticeAnchorOrigin,
      });
    },
    onError: (error) => {
      console.error(error);
      enqueueSnackbar("API Error: failed to update subscription preferences.", {
        variant: "error",
        autoHideDuration: 3000,
        anchorOrigin: noticeAnchorOrigin,
      });
    },
  });

  const handleSubscriptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const subscriptionId = event.target.name;
    const isChecked = event.target.checked;
    
    updateState((draft) => {
      draft[subscriptionId] = isChecked;
    });

    // Update channel state based on subscription changes
    const subscription = subscriptions.find(sub => sub.id === subscriptionId);
    if (subscription) {
      const channelSubscriptions = subscriptionsByChannel[subscription.channel];
      if (channelSubscriptions) {
        // Check if ANY subscription in the channel will be checked after this change
        const anyChannelSubscriptionChecked = channelSubscriptions.some(sub => 
          sub.id === subscriptionId ? isChecked : state[sub.id]
        );
        
        updateChannelState((draft) => {
          draft[subscription.channel] = anyChannelSubscriptionChecked;
        });
      }
    }
  };

  const handleChannelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const channel = event.target.name;
    const isChecked = event.target.checked;
    
    updateChannelState((draft) => {
      draft[channel] = isChecked;
    });

    // Update all subscription states for this channel
    const channelSubscriptions = subscriptionsByChannel[channel] || [];
    updateState((draft) => {
      channelSubscriptions.forEach((subscription) => {
        draft[subscription.id] = isChecked;
      });
    });
  };
  const changedSubscriptionName = useMemo(
    () =>
      changedSubscription &&
      subscriptions.find((s) => s.id === changedSubscription)?.name,
    [subscriptions, changedSubscription],
  );

  let subscriptionChangeSection = null;
  if (subscriptionChange && (changedSubscription || changedSubscriptionChannel)) {
    let message: string;
    
    if (subscriptionChange === SubscriptionChange.Subscribe) {
      message = `You have subscribed to ${changedSubscriptionName}`;
    } else {
      // For unsubscribe, show channel-wide message
      if (changedSubscriptionChannel) {
        message = `You have unsubscribed from all ${changedSubscriptionChannel} messages`;
      } else {
        message = `You have unsubscribed from ${changedSubscriptionName}`;
      }
    }

    subscriptionChangeSection = (
      <Alert severity="info">
        {message}
      </Alert>
    );
  }

  const handleUpdate = () => {
    updateSubscriptionsMutation.mutate({
      workspaceId,
      hash,
      identifier,
      identifierKey,
      changes: state,
    });
  };
  return (
    <Stack
      spacing={2}
      sx={{
        padding: 2,
        borderWidth: 1,
        display: "inline-block",
        borderStyle: "solid",
        borderRadius: 1,
        boxShadow: theme.shadows[2],
        borderColor: theme.palette.grey[200],
      }}
    >
      <Typography variant="h4">
        Choose what messages you would like to receive from {workspaceName}
      </Typography>
      {subscriptionChangeSection}
      <FormGroup>
        {Object.entries(subscriptionsByChannel).map(([channel, channelSubscriptions]) => (
          <Box key={channel}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={channelState[channel] === true}
                  onChange={handleChannelChange}
                  name={channel}
                />
              }
              label={channel}
              sx={{ fontWeight: "bold" }}
            />
            <Stack sx={{ ml: 3 }}>
              {channelSubscriptions.map((subscription) => (
                <FormControlLabel
                  key={subscription.id}
                  control={
                    <Checkbox
                      checked={state[subscription.id] === true}
                      onChange={handleSubscriptionChange}
                      name={subscription.id}
                    />
                  }
                  label={subscription.name}
                />
              ))}
            </Stack>
          </Box>
        ))}
      </FormGroup>
      <Box>
        <LoadingButton
          loading={updateSubscriptionsMutation.isPending}
          variant="contained"
          onClick={handleUpdate}
        >
          Save Preferences
        </LoadingButton>
      </Box>
    </Stack>
  );
}
