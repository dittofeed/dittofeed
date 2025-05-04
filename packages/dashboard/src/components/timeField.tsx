import { Box } from "@mui/material";
import React from "react";
import {
  DateInput,
  DateSegment,
  TimeField as AriaTimeField,
  TimeFieldProps as AriaTimeFieldProps,
  TimeValue,
} from "react-aria-components";

export function TimeField<T extends TimeValue>(props: AriaTimeFieldProps<T>) {
  return (
    <Box className="react-aria">
      <AriaTimeField {...props}>
        <DateInput>{(segment) => <DateSegment segment={segment} />}</DateInput>
      </AriaTimeField>
    </Box>
  );
}
