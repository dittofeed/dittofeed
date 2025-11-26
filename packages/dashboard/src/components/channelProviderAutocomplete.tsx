import { Autocomplete, TextField } from "@mui/material";
import { emailProviderLabel } from "isomorphic-lib/src/email";
import {
  ChannelType,
  SmsProviderType,
  WorkspaceWideEmailProviders,
  WorkspaceWideEmailProviderType,
} from "isomorphic-lib/src/types";

function getProviderLabel(
  provider: WorkspaceWideEmailProviders | SmsProviderType,
) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  if (Object.values(SmsProviderType).includes(provider as SmsProviderType)) {
    return provider;
  }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return emailProviderLabel(provider as WorkspaceWideEmailProviders);
}

export type ProviderOverrideChangeHandler = (
  provider: WorkspaceWideEmailProviders | SmsProviderType | null,
) => void;

export default function ChannelProviderAutocomplete({
  channel,
  providerOverride,
  disabled,
  handler,
}: {
  providerOverride?: WorkspaceWideEmailProviders | SmsProviderType | null;
  disabled?: boolean;
  channel: ChannelType;
  handler: ProviderOverrideChangeHandler;
}) {
  let providerOptions: (WorkspaceWideEmailProviders | SmsProviderType)[] = [];
  switch (channel) {
    case ChannelType.Email:
      providerOptions = Object.values(WorkspaceWideEmailProviderType);
      break;
    case ChannelType.Sms:
      providerOptions = Object.values(SmsProviderType);
      break;
    case ChannelType.MobilePush:
      // TODO: Implement mobile push providers when available
      return null;
    case ChannelType.Webhook:
      // Webhooks don't have provider overrides
      return null;
  }

  const provider = providerOverride ?? null;

  return (
    <Autocomplete
      value={provider}
      options={providerOptions}
      disabled={disabled}
      getOptionLabel={getProviderLabel}
      onChange={(_event, p) =>
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        handler(p as WorkspaceWideEmailProviders | SmsProviderType | null)
      }
      renderInput={(params) => (
        <TextField {...params} label="Provider Override" variant="outlined" />
      )}
    />
  );
}
