import { Box, TextField } from "@mui/material";
import { ComponentProps } from "react";

import DurationDescription from "./durationDescription";

export default function DurationSelect({
  value,
  inputLabel,
  description,
  onChange,
}: {
  value: number | undefined;
  inputLabel: string;
  description: string;
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
      <Box>
        {description}
        <DurationDescription durationSeconds={value} />
      </Box>
    </>
  );
}
