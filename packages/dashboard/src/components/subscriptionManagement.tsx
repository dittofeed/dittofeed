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
import React, { useMemo } from "react";

export type SubscriptionState = Record<string, boolean>;
export interface SubscriptionManagementProps {
  subscriptions: UserSubscriptionResource[];
  changedSubscription?: string;
  subscriptionChange?: SubscriptionChange;
  hash: string;
  identifier: string;
  identifierKey: string;
  workspaceId: string;
  onSubmit: (update: UserSubscriptionsUpdate) => void;
}

export function SubscriptionManagement({
  subscriptions,
  changedSubscription,
  subscriptionChange,
  workspaceId,
  hash,
  identifier,
  identifierKey,
  onSubmit,
}: SubscriptionManagementProps) {
  const initialSubscriptionManagementState = React.useMemo(
    () =>
      subscriptions.reduce<SubscriptionState>((acc, subscription) => {
        acc[subscription.id] = subscription.isSubscribed;
        return acc;
      }, {}),
    [subscriptions]
  );

  const theme = useTheme();
  const [state, setState] = React.useState<SubscriptionState>(
    initialSubscriptionManagementState
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
    [subscriptions, changedSubscription]
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
  return (
    <Stack
      spacing={2}
      sx={{
        padding: 2,
        borderWidth: 1,
        borderStyle: "solid",
        borderRadius: 1,
        borderColor: theme.palette.grey[200],
      }}
    >
      <Typography variant="h4">
        Choose what messages you would like to receive
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
        <LoadingButton variant="contained">Save Preferences</LoadingButton>
      </Box>
    </Stack>
  );
}
