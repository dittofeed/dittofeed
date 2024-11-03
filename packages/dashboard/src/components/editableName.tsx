import { BorderColorOutlined } from "@mui/icons-material";
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
  onEscape,
}: {
  name: string;
  disabled?: boolean;
  sx?: SxProps<Theme>;
  variant?: React.ComponentProps<typeof Typography>["variant"];
  onChange: React.ComponentProps<typeof TextField>["onChange"];
  onEscape?: () => void;
}) {
  const [isNameFocused, setIsNamedFocused] = useState(false);

  function handleEscape() {
    setIsNamedFocused(false);
    onEscape?.();
  }

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
      onBlur={() => handleEscape()}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === "Escape") {
          handleEscape();
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
        <BorderColorOutlined />
      </IconButton>
    </Stack>
  );
}
