import { Box, Stack, TextField } from "@mui/material";
import { ComponentProps, useState } from "react";
import { TimeUnit } from "../lib/types";
import TimeUnitSelect, { isTimeUnit } from "./timeUnitSelect";

import DurationDescription, { nearestTimeUnit } from "./durationDescription";

export default function DurationSelect({
  value,
  inputLabel,
  description,
  onChange,
}: {
  value: number | undefined;
  inputLabel: string;
  description?: string;
  onChange: ComponentProps<typeof TextField>["onChange"];
}) {
  const [timeUnit, setTimeUnit] = useState<TimeUnit>(nearestTimeUnit(value));

  const handleTimeUnitChange: ComponentProps<
    typeof TimeUnitSelect
  >["onChange"] = (e) => {
    if (isTimeUnit(e.target.value)) {
      setTimeUnit(e.target.value);
    }
  };
  return (
    <>
      <TextField
        label={inputLabel}
        InputProps={{
          type: "number",
        }}
        value={String(value)}
        onChange={onChange}
      />
      <TimeUnitSelect value={timeUnit} onChange={handleTimeUnitChange} />
      <Stack direction="row" spacing={1}>
        {description ? <Box>{description}</Box> : null}
        <Box>
          <DurationDescription durationSeconds={value} timeUnit={timeUnit} />
        </Box>
      </Stack>
    </>
  );
}
