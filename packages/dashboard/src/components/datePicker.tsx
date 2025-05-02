import { CalendarDateTime } from "@internationalized/date";
import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import { Box, Divider, Stack } from "@mui/material";
import React from "react";
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  DateInput,
  DatePicker as AriaDatePicker,
  DatePickerProps as AriaDatePickerProps,
  DateSegment,
  DateValue,
  Dialog,
  Group,
  Heading,
  Label,
  Popover,
  Text,
} from "react-aria-components";

export interface DatePickerProps<T extends DateValue>
  extends AriaDatePickerProps<T> {
  label?: string;
  description?: string;
  errorMessage?: string;
}
// FIXME missing dialog styles
export function DatePicker(props: DatePickerProps<CalendarDateTime>) {
  return (
    <Box className="react-aria">
      <Calendar>
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

export function DatePickerGenerated<T extends DateValue>({
  label,
  description,
  errorMessage,
  ...props
}: DatePickerProps<T>) {
  return (
    <AriaDatePicker {...props} className="react-aria">
      <Label>{label}</Label>
      <Group>
        <DateInput>{(segment) => <DateSegment segment={segment} />}</DateInput>
        <Button>▼</Button>
      </Group>
      {description && <Text slot="description">{description}</Text>}
      {errorMessage && <Text slot="errorMessage">{errorMessage}</Text>}
      <Popover>
        <Dialog>
          <Stack sx={{ p: 1 }}>
            <Calendar>
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
              <CalendarGrid>
                {(date) => <CalendarCell date={date} />}
              </CalendarGrid>
            </Calendar>
          </Stack>
        </Dialog>
      </Popover>
    </AriaDatePicker>
  );
}
