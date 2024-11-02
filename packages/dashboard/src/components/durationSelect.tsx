import { Box, Stack, SxProps, TextField, Theme } from "@mui/material";
import React, { ComponentProps, useState } from "react";

import { TimeUnit } from "../lib/types";
import DurationDescription, {
  nearestTimeUnit,
  timeUnitConversion,
} from "./durationDescription";
import TimeUnitSelect, { isTimeUnit } from "./timeUnitSelect";

export type OnChange = (seconds: number) => void;

export default function DurationSelect({
  value,
  inputLabel,
  description,
  disabled,
  onChange,
  timeFieldSx,
}: {
  // seconds
  value: number | undefined;
  disabled?: boolean;
  inputLabel: string;
  description?: string;
  timeFieldSx?: SxProps<Theme>;
  onChange: OnChange;
}) {
  const [timeUnit, setTimeUnit] = useState<TimeUnit>(nearestTimeUnit(value));
  const timeNonSeconds = (value ?? 0) / timeUnitConversion[timeUnit];

  const handleTimeUnitChange: ComponentProps<
    typeof TimeUnitSelect
  >["onChange"] = (e) => {
    const newTimeUnit = e.target.value;
    if (isTimeUnit(newTimeUnit)) {
      setTimeUnit(newTimeUnit);
      const newSeconds =
        ((value ?? 0) * timeUnitConversion[newTimeUnit]) /
        timeUnitConversion[timeUnit];

      onChange(newSeconds);
    }
  };
  const handleTimeChange: ComponentProps<typeof TextField>["onChange"] = (
    e,
  ) => {
    const time = parseInt(e.target.value, 10);
    onChange(time * timeUnitConversion[timeUnit]);
  };

  return (
    <>
      <TextField
        label={inputLabel}
        disabled={disabled}
        slotProps={{
          input: {
            type: "number",
          },
        }}
        sx={timeFieldSx}
        value={String(timeNonSeconds)}
        onChange={handleTimeChange}
      />
      <TimeUnitSelect
        value={timeUnit}
        onChange={handleTimeUnitChange}
        disabled={disabled}
      />
      {description ? (
        <Stack direction="row" spacing={1}>
          <Box>{description}</Box>
          <Box>
            <DurationDescription durationSeconds={value} />
          </Box>
        </Stack>
      ) : null}
    </>
  );
}
