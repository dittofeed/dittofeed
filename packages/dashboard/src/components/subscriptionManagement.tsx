import {
  Checkbox,
  FormControlLabel,
  FormGroup,
  Stack,
  Typography,
} from "@mui/material";
import { UserSubscriptionResource } from "isomorphic-lib/src/types";
import React from "react";

export interface SubscriptionManagementProps {
  subscriptions: UserSubscriptionResource[];
}

export function SubscriptionManagement({
  subscriptions,
}: SubscriptionManagementProps) {
  const initialSubscriptionManagementState = React.useMemo(
    () =>
      subscriptions.reduce<Record<string, boolean>>((acc, subscription) => {
        acc[subscription.id] = true;
        return acc;
      }, {}),
    [subscriptions]
  );
  const [state, setState] = React.useState(initialSubscriptionManagementState);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setState({
      ...state,
      [event.target.name]: event.target.checked,
    });
  };

  return (
    <Stack>
      <Typography variant="h4">Choose</Typography>
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
    </Stack>
  );
}
