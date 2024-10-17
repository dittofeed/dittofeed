import {
  Autocomplete,
  AutocompleteProps,
  Button,
  Paper,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import Popover from "@mui/material/Popover";
import React, { useRef, useState } from "react";

export interface SettingsCommand {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  disabled?: boolean;
}

export function SettingsMenu({ commands }: { commands: SettingsCommand[] }) {
  const [open, setOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null); // Updated ref
  const theme = useTheme();

  const handleCommandSelect: AutocompleteProps<
    SettingsCommand,
    false,
    false,
    false
  >["onChange"] = (event, value) => {
    if (value) {
      value.action();
      setInputValue("");
      setOpen(false); // Close dropdown after selection
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    setOpen(true);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setOpen(false);
  };

  return (
    <>
      <Button
        onClick={handleClick}
        size="small"
        sx={{
          color: theme.palette.grey[800],
          fontWeight: 800,
          fontSize: 18,
        }}
      >
        ...
      </Button>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        TransitionProps={{
          onEntered: () => {
            inputRef.current?.focus();
          },
        }}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
        sx={{
          "& .MuiPopover-paper": {
            overflow: "visible",
          },
        }}
      >
        <Autocomplete
          disablePortal
          open
          ListboxProps={{
            sx: {
              padding: 0,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
            },
          }}
          inputValue={inputValue}
          disableClearable
          onInputChange={(event, newInputValue) => setInputValue(newInputValue)}
          options={commands}
          getOptionLabel={(option) => option.label}
          onChange={handleCommandSelect}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Settings"
              variant="filled"
              inputRef={inputRef} // Attached ref to TextField's input
            />
          )}
          renderOption={(props, option) => (
            <Paper
              component="li"
              {...props}
              sx={{
                opacity: option.disabled ? 0.5 : 1,
                pointerEvents: option.disabled ? "none" : "auto",
                borderRadius: 0,
                width: 300,
              }}
            >
              <Typography
                variant="body2"
                style={{ display: "flex", alignItems: "center" }}
              >
                {option.icon}
                <span style={{ marginLeft: "8px" }}>{option.label}</span>
              </Typography>
            </Paper>
          )}
          getOptionDisabled={(option) => option.disabled} // {{ edit_2 }}
          sx={{ width: 300, padding: 0, height: "100%" }}
        />
      </Popover>
    </>
  );
}
