import { CalendarDate } from "@internationalized/date";
import {
  FormControl,
  MenuItem,
  Popover,
  Select,
  Stack,
  SxProps,
  Theme,
} from "@mui/material";
import { subDays, subMinutes } from "date-fns";
import {
  MouseEvent,
  SyntheticEvent,
  TouchEvent,
  useCallback,
  useRef,
  useState,
} from "react";

import { JOURNEY_EDITOR_CLICKAWAY_EXEMPT_CLASS } from "../lib/constants";
import { toCalendarDate } from "../lib/dates";
import { GreyButton } from "./greyButtonStyle";
import { greyMenuItemStyles, greySelectStyles } from "./greyScaleStyles";
import { RangeCalendar } from "./rangeCalendar";

const stopPropagation = (e: MouseEvent | TouchEvent | SyntheticEvent) => {
  e.stopPropagation();
};

export const TimeOptionId = {
  LastSevenDays: "last-7-days",
  LastThirtyDays: "last-30-days",
  LastNinetyDays: "last-90-days",
  LastHour: "last-hour",
  Last24Hours: "last-24-hours",
  Custom: "custom",
} as const;

export type TimeOptionId = (typeof TimeOptionId)[keyof typeof TimeOptionId];

interface MinuteTimeOption {
  type: "minutes";
  id: TimeOptionId;
  minutes: number;
  label: string;
}

interface CustomTimeOption {
  type: "custom";
  id: typeof TimeOptionId.Custom;
  label: string;
}

type TimeOption = MinuteTimeOption | CustomTimeOption;

const timeOptions: TimeOption[] = [
  {
    type: "minutes",
    id: TimeOptionId.LastHour,
    minutes: 60,
    label: "Last hour",
  },
  {
    type: "minutes",
    id: TimeOptionId.Last24Hours,
    minutes: 24 * 60,
    label: "Last 24 hours",
  },
  {
    type: "minutes",
    id: TimeOptionId.LastSevenDays,
    minutes: 7 * 24 * 60,
    label: "Last 7 days",
  },
  {
    type: "minutes",
    id: TimeOptionId.LastThirtyDays,
    minutes: 30 * 24 * 60,
    label: "Last 30 days",
  },
  {
    type: "minutes",
    id: TimeOptionId.LastNinetyDays,
    minutes: 90 * 24 * 60,
    label: "Last 90 days",
  },
  { type: "custom", id: TimeOptionId.Custom, label: "Custom Date Range" },
];

export interface DateRangeValue {
  startDate: Date;
  endDate: Date;
  selectedTimeOption: TimeOptionId;
}

export interface DateRangeSelectorProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  referenceDate?: Date;
  sx?: SxProps<Theme>;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatCalendarDate(date: CalendarDate) {
  return formatDate(
    date.toDate(Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
}

export function DateRangeSelector({
  value,
  onChange,
  referenceDate = new Date(),
  sx,
}: DateRangeSelectorProps) {
  const customDateRef = useRef<HTMLInputElement | null>(null);
  const [customDateRange, setCustomDateRange] = useState<{
    start: CalendarDate;
    end: CalendarDate;
  } | null>(null);
  const [selectOpen, setSelectOpen] = useState(false);

  const customOnClickHandler = useCallback(() => {
    if (value.selectedTimeOption === "custom") {
      setCustomDateRange({
        start: toCalendarDate(referenceDate),
        end: toCalendarDate(referenceDate),
      });
    }
  }, [value.selectedTimeOption, referenceDate]);

  const handleTimeOptionChange = useCallback(
    (selectedOption: TimeOptionId) => {
      if (selectedOption === "custom") {
        const dayBefore = subDays(referenceDate, 1);
        setCustomDateRange({
          start: toCalendarDate(dayBefore),
          end: toCalendarDate(referenceDate),
        });
        return;
      }

      const option = timeOptions.find((o) => o.id === selectedOption);
      if (option === undefined || option.type !== "minutes") {
        return;
      }

      const startDate = subMinutes(referenceDate, option.minutes);
      const endDate = referenceDate;

      onChange({
        startDate,
        endDate,
        selectedTimeOption: option.id,
      });
    },
    [onChange, referenceDate],
  );

  const handleCustomDateApply = useCallback(() => {
    if (customDateRange) {
      const startDate = customDateRange.start.toDate(
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
      const endDate = customDateRange.end.toDate(
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );

      onChange({
        startDate,
        endDate,
        selectedTimeOption: "custom",
      });

      setCustomDateRange(null);
    }
  }, [customDateRange, onChange]);

  const handleCustomDateCancel = useCallback(() => {
    setCustomDateRange(null);
  }, []);

  const handleSelectOpen = useCallback((e: SyntheticEvent) => {
    stopPropagation(e);
    setSelectOpen(true);
  }, []);

  const handleSelectClose = useCallback((e: SyntheticEvent) => {
    stopPropagation(e);
    setSelectOpen(false);
  }, []);

  return (
    <>
      <FormControl sx={sx}>
        <Select
          value={value.selectedTimeOption}
          open={selectOpen}
          onClick={handleSelectOpen}
          onOpen={handleSelectOpen}
          onClose={handleSelectClose}
          renderValue={(selectedValue) => {
            const option = timeOptions.find((o) => o.id === selectedValue);
            if (option?.type === "custom") {
              return `${formatDate(value.startDate)} - ${formatDate(value.endDate)}`;
            }
            return option?.label;
          }}
          ref={customDateRef}
          onMouseDownCapture={stopPropagation}
          onTouchStartCapture={stopPropagation}
          onPointerDownCapture={stopPropagation}
          MenuProps={{
            className: JOURNEY_EDITOR_CLICKAWAY_EXEMPT_CLASS,
            anchorOrigin: {
              vertical: "bottom",
              horizontal: "left",
            },
            transformOrigin: {
              vertical: "top",
              horizontal: "left",
            },
            sx: greyMenuItemStyles,
            PaperProps: {
              onMouseDownCapture: stopPropagation,
              onTouchStartCapture: stopPropagation,
              onPointerDownCapture: stopPropagation,
            },
          }}
          sx={greySelectStyles}
          onChange={(e) =>
            handleTimeOptionChange(e.target.value as TimeOptionId)
          }
          size="small"
        >
          {timeOptions.map((option) => (
            <MenuItem
              key={option.id}
              value={option.id}
              onClick={
                option.id === "custom" ? customOnClickHandler : undefined
              }
            >
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Popover
        open={Boolean(customDateRange)}
        anchorEl={customDateRef.current}
        onClose={handleCustomDateCancel}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
      >
        <RangeCalendar
          value={customDateRange}
          visibleDuration={{ months: 2 }}
          onChange={(newValue) => {
            setCustomDateRange(newValue);
          }}
          footer={
            <Stack direction="row" justifyContent="space-between">
              <Stack justifyContent="center" alignItems="center" flex={1}>
                {customDateRange?.start &&
                  formatCalendarDate(customDateRange.start)}
                {" - "}
                {customDateRange?.end &&
                  formatCalendarDate(customDateRange.end)}
              </Stack>
              <Stack direction="row" spacing={1}>
                <GreyButton onClick={handleCustomDateCancel}>Cancel</GreyButton>
                <GreyButton
                  onClick={handleCustomDateApply}
                  sx={{
                    borderColor: "grey.400",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    fontWeight: "bold",
                  }}
                >
                  Apply
                </GreyButton>
              </Stack>
            </Stack>
          }
        />
      </Popover>
    </>
  );
}
