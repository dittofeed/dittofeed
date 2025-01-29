import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import { Box, Divider, Stack } from "@mui/material";
import React from "react";
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
  footer,
  ...props
}: RangeCalendarProps<T> & { footer?: React.ReactNode }) {
  return (
    <Stack className="react-aria" sx={{ p: 1 }}>
      <AriaRangeCalendar {...props} visibleDuration={{ months: 2 }}>
        <header>
          <Button slot="previous">
            <ChevronLeft />
          </Button>
          <Heading />
          <Button slot="next">
            <ChevronRight />
          </Button>
        </header>
        <Divider sx={{ borderColor: "grey.300", mt: 1, mb: 1 }} />
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
      {footer && (
        <Box
          sx={{
            borderTop: "1px solid",
            borderColor: "grey.300",
            pt: 1,
            mt: 1,
          }}
        >
          {footer}
        </Box>
      )}
    </Stack>
  );
}
