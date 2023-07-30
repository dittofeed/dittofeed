import { MenuItem,TextField } from "@mui/material";
import { ComponentProps } from "react";

import { TimeUnit } from "../lib/types";

const timeUnitSet = new Set(["seconds", "minutes", "hours", "days", "weeks"]);

export function isTimeUnit(str: string): str is TimeUnit {
  return timeUnitSet.has(str);
}
export interface TimeUnitSelectProps {
  value: TimeUnit;
  inputLabel?: string;
  onChange: ComponentProps<typeof TextField>["onChange"];
}

export default function TimeUnitSelect({
  value,
  inputLabel = "Time Unit",
  onChange,
}: TimeUnitSelectProps) {
  return (
    <TextField
      label={inputLabel}
      select
      value={value}
      onChange={onChange}
      variant="filled"
    >
      <MenuItem value="seconds">Seconds</MenuItem>
      <MenuItem value="minutes">Minutes</MenuItem>
      <MenuItem value="hours">Hours</MenuItem>
      <MenuItem value="days">Days</MenuItem>
      <MenuItem value="weeks">Weeks</MenuItem>
    </TextField>
  );
}
