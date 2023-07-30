import { Box, Stack, TextField } from "@mui/material";
import { ComponentProps, useState } from "react";

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
  onChange,
}: {
  value: number | undefined;
  inputLabel: string;
  description?: string;
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
    e
  ) => {
    const time = parseInt(e.target.value, 10);
    onChange(time * timeUnitConversion[timeUnit]);
  };

  return (
    <>
      <TextField
        label={inputLabel}
        InputProps={{
          type: "number",
        }}
        value={String(timeNonSeconds)}
        onChange={handleTimeChange}
      />
      <TimeUnitSelect value={timeUnit} onChange={handleTimeUnitChange} />
      <Stack direction="row" spacing={1}>
        {description ? <Box>{description}</Box> : null}
        <Box>
          <DurationDescription durationSeconds={value} />
        </Box>
      </Stack>
    </>
  );
}
