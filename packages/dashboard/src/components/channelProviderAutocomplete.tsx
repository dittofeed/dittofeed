import { Autocomplete, TextField } from "@mui/material";
import {
  ChannelType,
  EmailProviderType,
  SmsProviderType,
} from "isomorphic-lib/src/types";

function getProviderLabel(provider: EmailProviderType | SmsProviderType) {
  return provider;
}

export type ProviderOverrideChangeHandler = (
  provider: EmailProviderType | SmsProviderType | null,
) => void;

export default function ChannelProviderAutocomplete({
  channel,
  providerOverride,
  disabled,
  handler,
}: {
  providerOverride?: EmailProviderType | SmsProviderType | null;
  disabled?: boolean;
  channel: ChannelType;
  handler: ProviderOverrideChangeHandler;
}) {
  let providerOptions: (EmailProviderType | SmsProviderType)[] = [];
  switch (channel) {
    case ChannelType.Email:
      providerOptions = Object.values(EmailProviderType);
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
      onChange={(_event, p) => handler(p)}
      renderInput={(params) => (
        <TextField {...params} label="Provider Override" variant="outlined" />
      )}
    />
  );
}
