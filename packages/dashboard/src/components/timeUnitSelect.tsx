import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import React, { ComponentProps } from "react";

import { TimeUnit } from "../lib/types";

const timeUnitSet = new Set(["seconds", "minutes", "hours", "days", "weeks"]);

export function isTimeUnit(str: unknown): str is TimeUnit {
  return typeof str === "string" && timeUnitSet.has(str);
}
export interface TimeUnitSelectProps {
  value: TimeUnit;
  disabled?: boolean;
  inputLabel?: string;
  onChange: ComponentProps<typeof Select>["onChange"];
}

export default function TimeUnitSelect({
  value,
  inputLabel = "Time Unit",
  disabled,
  onChange,
}: TimeUnitSelectProps) {
  return (
    <FormControl>
      <InputLabel>{inputLabel}</InputLabel>
      <Select
        label={inputLabel}
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        <MenuItem value="seconds">Seconds</MenuItem>
        <MenuItem value="minutes">Minutes</MenuItem>
        <MenuItem value="hours">Hours</MenuItem>
        <MenuItem value="days">Days</MenuItem>
        <MenuItem value="weeks">Weeks</MenuItem>
      </Select>
    </FormControl>
  );
}
