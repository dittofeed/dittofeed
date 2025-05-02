// External libraries
import { CalendarDateTime, parseDateTime } from "@internationalized/date";
import { LoadingButton } from "@mui/lab";
import {
  Box,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
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
import { useMemo } from "react";

// Internal application imports
import { useBroadcastMutation } from "../../lib/useBroadcastMutation";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import { useStartBroadcastMutation } from "../../lib/useStartBroadcastMutation";
import { getWarningStyles } from "../../lib/warningTheme";
import {
  DatePicker,
  DatePickerGenerated,
  DatePickerProps,
} from "../datePicker";
import { BroadcastState, BroadcastStateUpdater } from "./broadcastsShared";

// Helper function to convert 'yyyy-MM-dd HH:mm' string to CalendarDateTime
function stringToCalendarDateTime(
  dateString: string | null | undefined,
): CalendarDateTime | null {
  if (!dateString) {
    return null;
  }
  try {
    // Replace space with 'T' to fit ISO-like format for parseDateTime
    const parseableString = dateString.replace(" ", "T");
    return parseDateTime(parseableString);
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
  // Format CalendarDateTime manually to 'yyyy-MM-dd HH:mm'
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
  return format(tomorrowAt8AM, "yyyy-MM-dd HH:mm"); // Use original format function
}

export default function Configuration({
  state,
  updateState,
}: {
  state: BroadcastState;
  updateState: BroadcastStateUpdater;
}) {
  const { data: broadcast } = useBroadcastQuery(state.id);
  const { mutate: startBroadcast, isPending } = useStartBroadcastMutation();
  const { mutate: updateBroadcast } = useBroadcastMutation(state.id);
  const theme = useTheme();

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

  if (!broadcast) {
    return null;
  }

  const disabled = broadcast.status !== "Draft" || errors.length !== 0;
  const scheduledStatus: "scheduled" | "immediate" = broadcast.scheduledAt
    ? "scheduled"
    : "immediate";

  const handleDateChange: DatePickerProps<CalendarDateTime>["onChange"] = (
    newDateValue,
  ) => {
    updateBroadcast({ scheduledAt: calendarDateTimeToString(newDateValue) });
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 600 }}>
      {errors.length > 0 && (
        <Box sx={getWarningStyles(theme)}>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Box>
      )}
      <ToggleButtonGroup
        value={scheduledStatus}
        exclusive
        onChange={(_, newValue) => {
          updateBroadcast({
            scheduledAt: newValue === "scheduled" ? getTomorrowAt8AM() : null,
          });
        }}
      >
        <ToggleButton value="immediate">Immediate</ToggleButton>
        <ToggleButton value="scheduled">Scheduled</ToggleButton>
      </ToggleButtonGroup>

      {scheduledStatus === "scheduled" && (
        <DatePicker value={datePickerValue} onChange={handleDateChange} />
      )}

      <LoadingButton
        variant="outlined"
        color="primary"
        loading={isPending}
        disabled={disabled}
        onClick={() => {
          startBroadcast(
            { broadcastId: state.id },
            {
              onSuccess: () => {
                updateState((draft) => {
                  draft.step = "REVIEW";
                });
              },
            },
          );
        }}
      >
        Start Broadcast
      </LoadingButton>
    </Stack>
  );
}
