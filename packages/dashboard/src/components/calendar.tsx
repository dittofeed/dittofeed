import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import { Box } from "@mui/material";
import React from "react";
import {
  Button,
  Calendar as AriaCalendar,
  CalendarCell,
  CalendarGrid,
  CalendarProps,
  DateValue,
  Heading,
} from "react-aria-components";

export function Calendar<T extends DateValue>(props: CalendarProps<T>) {
  return (
    <Box className="react-aria">
      <AriaCalendar {...props}>
        <header>
          <Button slot="previous">
            <ChevronLeft />
          </Button>
          <Heading />
          <Button slot="next">
            <ChevronRight />
          </Button>
        </header>
        <CalendarGrid>{(date) => <CalendarCell date={date} />}</CalendarGrid>
      </AriaCalendar>
    </Box>
  );
}
