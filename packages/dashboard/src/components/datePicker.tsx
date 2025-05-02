import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import { Box } from "@mui/material";
import React from "react";
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarProps,
  DateValue,
  Heading,
} from "react-aria-components";

// FIXME date and time picker
export function DatePicker<T extends DateValue>(props: CalendarProps<T>) {
  return (
    <Box className="react-aria">
      <Calendar {...props}>
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
      </Calendar>
    </Box>
  );
}
