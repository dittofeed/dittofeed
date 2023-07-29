import { Box, Stack, TextField } from "@mui/material";
import { ComponentProps } from "react";
import { TimeUnit } from "../lib/types";

import DurationDescription from "./durationDescription";

export default function DurationSelect({
  value,
  inputLabel,
  description,
  timeUnit,
  onChange,
}: {
  value: number | undefined;
  inputLabel: string;
  description?: string;
  timeUnit: TimeUnit;
  onChange: ComponentProps<typeof TextField>["onChange"];
}) {
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
      <Stack direction="row" spacing={1}>
        {description ? <Box>{description}</Box> : null}
        <Box>
          <DurationDescription durationSeconds={value} timeUnit={timeUnit} />
        </Box>
      </Stack>
    </>
  );
}
