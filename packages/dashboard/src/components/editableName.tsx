import { EditFilled } from "@ant-design/icons";
import { IconButton, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";

export default function EditableName({
  name,
  variant,
  onChange,
}: {
  name: string;
  variant?: React.ComponentProps<typeof Typography>["variant"];
  onChange: React.ComponentProps<typeof TextField>["onChange"];
}) {
  const [isNameFocused, setIsNamedFocused] = useState(false);

  return isNameFocused ? (
    <TextField
      autoFocus
      sx={{ backgroundColor: "white" }}
      value={name}
      onChange={onChange}
      onBlur={() => setIsNamedFocused(false)}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === "Escape") {
          setIsNamedFocused(false);
        }
      }}
    />
  ) : (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Typography
        variant={variant ?? "h4"}
        onClick={() => {
          setIsNamedFocused(true);
        }}
      >
        {name}
      </Typography>
      <IconButton
        onClick={() => {
          setIsNamedFocused(true);
        }}
      >
        <EditFilled />
      </IconButton>
    </Stack>
  );
}
