import { Autocomplete, TextField } from "@mui/material";
import { useEffect, useMemo } from "react";

export type TimezoneChangeHandler = (timezone: string | null) => void;

export function TimezoneAutocomplete({
  value,
  disabled,
  handler,
  disableClearable,
  defaultToLocal,
}: {
  value?: string;
  disabled?: boolean;
  handler: TimezoneChangeHandler;
  disableClearable?: boolean;
  defaultToLocal?: boolean;
}) {
  const timezones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);

  const selectedTimezone = useMemo(() => {
    return timezones.find((tz) => tz === value) ?? null;
  }, [timezones, value]);

  // Default to local timezone if defaultToLocal is true and value is not set
  useEffect(() => {
    if (defaultToLocal && !value) {
      const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezones.includes(localTimezone)) {
        handler(localTimezone);
      }
    }
    // Omit timezones from dependency array to prevent re-running when timezones load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultToLocal, value, handler]);

  return (
    <Autocomplete
      value={selectedTimezone}
      options={timezones}
      disabled={disabled}
      disableClearable={disableClearable}
      getOptionLabel={(option) => option}
      onChange={(_event, tz: string | null) => {
        handler(tz);
      }}
      renderInput={(params) => (
        <TextField {...params} label="Timezone" variant="outlined" />
      )}
    />
  );
}
