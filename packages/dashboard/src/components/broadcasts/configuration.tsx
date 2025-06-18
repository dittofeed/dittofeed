// External libraries
import { CalendarDateTime, parseDateTime, Time } from "@internationalized/date";
import { LoadingButton } from "@mui/lab";
import {
  Autocomplete,
  Box,
  Popover,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import {
  addDays,
  format,
  setHours,
  setMilliseconds,
  setMinutes,
  setSeconds,
} from "date-fns";
import { isEmailProviderType } from "isomorphic-lib/src/email";
import { isSmsProviderType } from "isomorphic-lib/src/sms";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  BroadcastSmsMessageVariant,
  BroadcastStepKeys,
  BroadcastV2Config,
  ChannelType,
  EmailProviderType,
  EmailProviderTypeSchema,
  SmsProviderType,
} from "isomorphic-lib/src/types";
import { useCallback, useMemo, useState } from "react";

// Internal application imports
import { useBroadcastMutation } from "../../lib/useBroadcastMutation";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import { useStartBroadcastMutation } from "../../lib/useStartBroadcastMutation";
import { getWarningStyles } from "../../lib/warningTheme";
import { AuthorizeGmail } from "../authorizeGmail";
import { Calendar } from "../calendar";
import { GreyButton, greyButtonStyle } from "../greyButtonStyle";
import { TimeField } from "../timeField";
import { TimezoneAutocomplete } from "../timezoneAutocomplete";
import {
  BroadcastState,
  BroadcastStateUpdater,
  useBroadcastSteps,
} from "./broadcastsShared";

// Helper function to convert 'yyyy-MM-dd HH:mm' string to CalendarDateTime
function stringToCalendarDateTime(
  dateString: string | null | undefined,
): CalendarDateTime | null {
  if (!dateString) {
    return null;
  }
  try {
    const parseableString = dateString.replace(" ", "T");
    const secondsIncluded =
      parseableString.length === 16 ? `${parseableString}:00` : parseableString;
    return parseDateTime(secondsIncluded);
  } catch (e) {
    console.error("Failed to parse date string:", dateString, e);
    return null;
  }
}

// Helper function to convert CalendarDateTime to 'yyyy-MM-dd HH:mm' string
function calendarDateTimeToString(
  dateValue: CalendarDateTime | null,
): string | null {
  if (!dateValue) {
    return null;
  }
  const year = dateValue.year.toString().padStart(4, "0");
  const month = dateValue.month.toString().padStart(2, "0");
  const day = dateValue.day.toString().padStart(2, "0");
  const hour = dateValue.hour.toString().padStart(2, "0");
  const minute = dateValue.minute.toString().padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function getTomorrowAt8AM(currentDate: Date = new Date()): string {
  const tomorrow = addDays(currentDate, 1);
  let tomorrowAt8AM = setHours(tomorrow, 8);
  tomorrowAt8AM = setMinutes(tomorrowAt8AM, 0);
  tomorrowAt8AM = setSeconds(tomorrowAt8AM, 0);
  tomorrowAt8AM = setMilliseconds(tomorrowAt8AM, 0);
  // Return original 'yyyy-MM-dd HH:mm' format
  return format(tomorrowAt8AM, "yyyy-MM-dd HH:mm");
}

interface ProviderOverrideOption {
  id: EmailProviderTypeSchema | SmsProviderType;
  label: string;
}

// TODO provide state configuration to disable or hardcode email providers
export default function Configuration({
  state,
  updateState,
}: {
  state: BroadcastState;
  updateState: BroadcastStateUpdater;
}) {
  const { data: broadcast } = useBroadcastQuery(state.id);
  const [isGmailAuthorized, setIsGmailAuthorized] = useState(false);
  const { mutate: startBroadcast, isPending } = useStartBroadcastMutation();
  const { mutate: updateBroadcast } = useBroadcastMutation(state.id);
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const channel = useMemo(() => {
    return broadcast?.config.message.type;
  }, [broadcast?.config.message.type]);
  const steps = useBroadcastSteps(state.configuration?.stepsAllowList);

  const availableProviderOverrides: ProviderOverrideOption[] = useMemo(() => {
    if (!channel) {
      return [];
    }
    switch (channel) {
      case ChannelType.Email: {
        const options = [
          { id: EmailProviderType.Test, label: "Test" },
          { id: EmailProviderType.AmazonSes, label: "Amazon SES" },
          { id: EmailProviderType.Resend, label: "Resend" },
          { id: EmailProviderType.SendGrid, label: "SendGrid" },
          { id: EmailProviderType.Smtp, label: "SMTP" },
          { id: EmailProviderType.PostMark, label: "PostMark" },
          { id: EmailProviderType.MailChimp, label: "MailChimp" },
          { id: EmailProviderType.Gmail, label: "Gmail" },
        ];
        if (!state.configuration?.emailProviderOverrideAllowList) {
          return options;
        }
        const allowedSet = new Set(
          state.configuration.emailProviderOverrideAllowList,
        );
        return options.filter((option) => allowedSet.has(option.id));
      }
      case ChannelType.Sms:
        return [
          { id: SmsProviderType.Twilio, label: "Twilio" },
          { id: SmsProviderType.Test, label: "Test" },
        ];
      case ChannelType.Webhook:
        return [];
      default:
        assertUnreachable(channel);
    }
  }, [channel]);

  const providerOverride = useMemo<ProviderOverrideOption | null>(() => {
    if (!broadcast) {
      return null;
    }
    const { message } = broadcast.config;
    let override: EmailProviderTypeSchema | SmsProviderType | null = null;
    switch (message.type) {
      case ChannelType.Email:
        override = message.providerOverride ?? null;
        break;
      case ChannelType.Sms:
        override = message.providerOverride ?? null;
        break;
      case ChannelType.Webhook:
        return null;
      default:
        assertUnreachable(message);
    }
    return (
      availableProviderOverrides.find((option) => option.id === override) ??
      null
    );
  }, [broadcast, availableProviderOverrides]);
  const errors = useMemo(() => {
    const e: string[] = [];
    if (!broadcast?.messageTemplateId) {
      e.push("You must select a message template.");
    }
    if (!broadcast?.subscriptionGroupId) {
      e.push("You must select a subscription group.");
    }
    return e;
  }, [broadcast]);

  const datePickerValue = useMemo(
    () => stringToCalendarDateTime(broadcast?.scheduledAt),
    [broadcast?.scheduledAt],
  );

  const scheduledAtDateString = useMemo(() => {
    return datePickerValue
      ? datePickerValue.toString().split("T")[0]
      : "Set Date";
  }, [datePickerValue]);

  const handleTimezoneChange = useCallback(
    (timezone: string | null) => {
      if (!broadcast) {
        return;
      }
      updateBroadcast({
        config: {
          ...broadcast.config,
          defaultTimezone: timezone ?? undefined,
        },
      });
    },
    [broadcast, updateBroadcast],
  );

  const handleDateChange = useCallback(
    (newDateValue: CalendarDateTime | null) => {
      if (!newDateValue) {
        updateBroadcast({ scheduledAt: null });
        setAnchorEl(null);
        return;
      }
      const currentTime = datePickerValue
        ? new Time(datePickerValue.hour, datePickerValue.minute)
        : new Time(0, 0);
      const combinedDateTime = newDateValue.set(currentTime);
      updateBroadcast({
        scheduledAt: calendarDateTimeToString(combinedDateTime),
      });
      setAnchorEl(null);
    },
    [datePickerValue, updateBroadcast],
  );

  const handleTimeChange = useCallback(
    (newCalDateTimeValue: CalendarDateTime | null) => {
      if (!newCalDateTimeValue || !datePickerValue) {
        return;
      }
      const newTime = new Time(
        newCalDateTimeValue.hour,
        newCalDateTimeValue.minute,
      );
      const combinedDateTime = datePickerValue.set(newTime);
      updateBroadcast({
        scheduledAt: calendarDateTimeToString(combinedDateTime),
      });
    },
    [datePickerValue, updateBroadcast],
  );

  const handleOpenPopover = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setAnchorEl(event.currentTarget);
    },
    [],
  );

  const handleClosePopover = useCallback(() => {
    setAnchorEl(null);
  }, []);

  if (!broadcast) {
    return null;
  }

  const disabled = broadcast.status !== "Draft";
  const scheduledStatus: "scheduled" | "immediate" = broadcast.scheduledAt
    ? "scheduled"
    : "immediate";

  const open = Boolean(anchorEl);
  const id = open ? "date-picker-popover" : undefined;

  return (
    <Stack spacing={2} sx={{ maxWidth: 600 }}>
      {errors.length > 0 && (
        <Box sx={{ ...getWarningStyles(theme) }}>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Box>
      )}
      {!state.configuration?.hideScheduledSelect && (
        <ToggleButtonGroup
          value={scheduledStatus}
          exclusive
          disabled={disabled}
          onChange={(_, newValue) => {
            updateBroadcast({
              scheduledAt: newValue === "scheduled" ? getTomorrowAt8AM() : null,
            });
          }}
        >
          <ToggleButton value="immediate">Immediate</ToggleButton>
          <ToggleButton value="scheduled">Scheduled</ToggleButton>
        </ToggleButtonGroup>
      )}
      {scheduledStatus === "scheduled" && (
        <>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="subtitle1">Scheduled at</Typography>
            <GreyButton
              aria-describedby={id}
              disabled={disabled}
              onClick={handleOpenPopover}
              sx={{
                justifyContent: "flex-start",
                borderColor: "grey.400",
                borderStyle: "solid",
                borderWidth: "1px",
              }}
            >
              {scheduledAtDateString}
            </GreyButton>
            <TimeField<CalendarDateTime>
              aria-label="Scheduled time"
              value={datePickerValue}
              onChange={handleTimeChange}
              granularity="minute"
              isDisabled={!datePickerValue || disabled}
            />
          </Stack>
          <Popover
            id={id}
            open={open}
            anchorEl={anchorEl}
            onClose={handleClosePopover}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
          >
            <Calendar<CalendarDateTime>
              value={datePickerValue}
              onChange={handleDateChange}
              style={{ padding: 8 }}
            />
          </Popover>
          <TimezoneAutocomplete
            defaultToLocal
            value={broadcast.config.defaultTimezone}
            handler={handleTimezoneChange}
            disabled={broadcast.status !== "Draft"}
          />
        </>
      )}
      {!state.configuration?.hideOverrideSelect && (
        <Autocomplete
          options={availableProviderOverrides}
          disabled={disabled}
          getOptionLabel={(option) => option.label}
          value={providerOverride ?? null}
          renderInput={(params) => (
            <TextField {...params} label="Provider Override" />
          )}
          onChange={(_, newValue) => {
            if (!broadcast) {
              return;
            }
            const { message } = broadcast.config;
            let newMessage: BroadcastV2Config["message"];
            if (message.type === ChannelType.Webhook) {
              return;
            }
            switch (message.type) {
              case ChannelType.Email: {
                let newProviderOverride: EmailProviderTypeSchema | undefined;
                if (!newValue) {
                  newProviderOverride = undefined;
                } else if (isEmailProviderType(newValue.id)) {
                  newProviderOverride = newValue.id;
                } else {
                  newProviderOverride = undefined;
                }
                newMessage = {
                  ...message,
                  providerOverride: newProviderOverride,
                };
                break;
              }
              case ChannelType.Sms: {
                let newProviderOverride: SmsProviderType | undefined;
                if (!newValue) {
                  newProviderOverride = undefined;
                } else if (isSmsProviderType(newValue.id)) {
                  newProviderOverride = newValue.id;
                } else {
                  newProviderOverride = undefined;
                }
                const newSmsMessage: BroadcastSmsMessageVariant = {
                  type: message.type,
                  providerOverride: newProviderOverride ?? null,
                };
                newMessage = newSmsMessage;
                break;
              }
              default:
                assertUnreachable(message);
            }
            updateBroadcast({
              config: {
                ...broadcast.config,
                message: newMessage,
              },
            });
          }}
        />
      )}
      {!state.configuration?.hideRateLimit && (
        <Stack direction="row" spacing={2}>
          <TextField
            label="Rate Limit (messages / second)"
            type="number"
            inputProps={{
              min: 1,
            }}
            disabled={disabled}
            value={broadcast.config.rateLimit ?? ""}
            onChange={(e) => {
              if (!broadcast) {
                return;
              }
              const { value } = e.target;
              const intValue = parseInt(value, 10);
              updateBroadcast({
                config: {
                  ...broadcast.config,
                  rateLimit:
                    !value || Number.isNaN(intValue) ? undefined : intValue,
                },
              });
            }}
          />
          <TextField
            label="Batch Size"
            type="number"
            inputProps={{
              min: 1,
              max: 1000,
            }}
            disabled={disabled}
            value={broadcast.config.batchSize ?? ""}
            onChange={(e) => {
              if (!broadcast) {
                return;
              }
              const { value } = e.target;
              const intValue = parseInt(value, 10);
              updateBroadcast({
                config: {
                  ...broadcast.config,
                  batchSize:
                    !value || Number.isNaN(intValue) ? undefined : intValue,
                },
              });
            }}
          />
        </Stack>
      )}

      {providerOverride?.id === EmailProviderType.Gmail && (
        <AuthorizeGmail
          disabled={disabled}
          onAuthorize={() => setIsGmailAuthorized(true)}
        />
      )}

      <LoadingButton
        variant="outlined"
        color="primary"
        loading={isPending}
        disabled={
          disabled ||
          errors.length !== 0 ||
          (!isGmailAuthorized &&
            providerOverride?.id === EmailProviderType.Gmail)
        }
        sx={{
          ...greyButtonStyle,
          borderColor: "grey.400",
          "&:hover": {
            backgroundColor: "grey.300",
            borderColor: "grey.400",
          },
        }}
        onClick={() => {
          startBroadcast(
            { broadcastId: state.id },
            {
              onSuccess: () => {
                updateState((draft) => {
                  if (
                    steps.find(
                      (step) => step.key === BroadcastStepKeys.DELIVERIES,
                    )
                  ) {
                    draft.step = BroadcastStepKeys.DELIVERIES;
                  }
                });
              },
            },
          );
        }}
      >
        {scheduledStatus === "scheduled" ? "Schedule" : "Start"} Broadcast
      </LoadingButton>
    </Stack>
  );
}
