import { ChevronRight } from "@mui/icons-material";
import { ChevronLeft } from "@mui/icons-material";
import { Box, Divider, IconButton, Stack } from "@mui/material";
import {
  Button,
  CalendarCell,
  CalendarGrid,
  DateValue,
  Heading,
  RangeCalendar as AriaRangeCalendar,
  RangeCalendarProps as AriaRangeCalendarProps,
  Text,
} from "react-aria-components";

export interface RangeCalendarProps<T extends DateValue>
  extends AriaRangeCalendarProps<T> {
  errorMessage?: string;
}

export function RangeCalendar<T extends DateValue>({
  errorMessage,
  ...props
}: RangeCalendarProps<T>) {
  return (
    <Box className="react-aria" sx={{ p: 1 }}>
      <AriaRangeCalendar {...props} visibleDuration={{ months: 2 }}>
        <header>
          <IconButton slot="previous">
            <ChevronLeft />
          </IconButton>
          <Heading />
          <IconButton slot="next">
            <ChevronRight />
          </IconButton>
        </header>
        <Stack direction="row">
          <CalendarGrid>{(date) => <CalendarCell date={date} />}</CalendarGrid>
          <Divider
            orientation="vertical"
            flexItem
            sx={{ borderColor: "grey.300" }}
          />
          <CalendarGrid offset={{ months: 1 }}>
            {(date) => <CalendarCell date={date} />}
          </CalendarGrid>
        </Stack>
        {errorMessage && <Text slot="errorMessage">{errorMessage}</Text>}
      </AriaRangeCalendar>
    </Box>
  );
}
