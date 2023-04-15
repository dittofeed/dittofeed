import { EditFilled } from "@ant-design/icons";
import {
  IconButton,
  Stack,
  SxProps,
  TextField,
  Theme,
  Typography,
} from "@mui/material";
import { useState } from "react";

export default function EditableName({
  name,
  variant,
  disabled = false,
  sx,
  onChange,
}: {
  name: string;
  disabled?: boolean;
  sx?: SxProps<Theme>;
  variant?: React.ComponentProps<typeof Typography>["variant"];
  onChange: React.ComponentProps<typeof TextField>["onChange"];
}) {
  const [isNameFocused, setIsNamedFocused] = useState(false);

  return isNameFocused ? (
    <TextField
      autoFocus
      sx={{
        backgroundColor: "white",
        "& .MuiInputBase-input": {
          pt: 1,
          pb: 1,
        },
        ...sx,
      }}
      disabled={disabled}
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
        sx={sx}
        variant={variant ?? "h4"}
        onClick={() => {
          if (!disabled) {
            setIsNamedFocused(true);
          }
        }}
      >
        {name}
      </Typography>
      <IconButton
        disabled={disabled}
        onClick={() => {
          setIsNamedFocused(true);
        }}
      >
        <EditFilled />
      </IconButton>
    </Stack>
  );
}
