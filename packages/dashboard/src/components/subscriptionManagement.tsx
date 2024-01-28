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
  UserSubscriptionResource,
  UserSubscriptionsUpdate,
} from "isomorphic-lib/src/types";
import { enqueueSnackbar } from "notistack";
import React, { useMemo } from "react";

import { noticeAnchorOrigin } from "../lib/notices";

export type SubscriptionState = Record<string, boolean>;
export interface SubscriptionManagementProps {
  subscriptions: UserSubscriptionResource[];
  changedSubscription?: string;
  subscriptionChange?: SubscriptionChange;
  hash: string;
  identifier: string;
  identifierKey: string;
  workspaceId: string;
  onSubscriptionUpdate: (update: UserSubscriptionsUpdate) => Promise<void>;
  workspaceName: string;
}

export function SubscriptionManagement({
  subscriptions,
  changedSubscription,
  subscriptionChange,
  workspaceId,
  hash,
  identifier,
  identifierKey,
  workspaceName,
  onSubscriptionUpdate,
}: SubscriptionManagementProps) {
  const initialSubscriptionManagementState = React.useMemo(
    () =>
      subscriptions.reduce<SubscriptionState>((acc, subscription) => {
        acc[subscription.id] = subscription.isSubscribed;
        return acc;
      }, {}),
    [subscriptions],
  );

  const theme = useTheme();
  const [loading, setLoading] = React.useState(false);
  const [state, setState] = React.useState<SubscriptionState>(
    initialSubscriptionManagementState,
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setState({
      ...state,
      [event.target.name]: event.target.checked,
    });
  };
  const changedSubscriptionName = useMemo(
    () =>
      changedSubscription &&
      subscriptions.find((s) => s.id === changedSubscription)?.name,
    [subscriptions, changedSubscription],
  );

  let subscriptionChangeSection = null;
  if (subscriptionChange && changedSubscription) {
    const verb =
      subscriptionChange === SubscriptionChange.Subscribe
        ? "subscribed to"
        : "unsubscribed from";

    subscriptionChangeSection = (
      <Alert severity="info">
        You have {verb} {changedSubscriptionName}
      </Alert>
    );
  }

  const handleUpdate = async () => {
    try {
      setLoading(true);
      await onSubscriptionUpdate({
        workspaceId,
        hash,
        identifier,
        identifierKey,
        changes: state,
      });
      enqueueSnackbar("Updated subscription preferences.", {
        variant: "success",
        autoHideDuration: 3000,
        anchorOrigin: noticeAnchorOrigin,
      });
    } catch (e) {
      console.error(e);
      enqueueSnackbar("API Error: failed to update subscription preferences.", {
        variant: "error",
        autoHideDuration: 3000,
        anchorOrigin: noticeAnchorOrigin,
      });
    }
    setLoading(false);
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
        {subscriptions.map((subscription) => (
          <FormControlLabel
            key={subscription.id}
            control={
              <Checkbox
                checked={state[subscription.id] === true}
                onChange={handleChange}
                name={subscription.id}
              />
            }
            label={subscription.name}
          />
        ))}
      </FormGroup>
      <Box>
        <LoadingButton
          loading={loading}
          variant="contained"
          onClick={handleUpdate}
        >
          Save Preferences
        </LoadingButton>
      </Box>
    </Stack>
  );
}
