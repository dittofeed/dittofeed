import BrightnessHighIcon from "@mui/icons-material/BrightnessHigh";
import LanguageIcon from "@mui/icons-material/Language";
import NightlightIcon from "@mui/icons-material/Nightlight";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import {
  Autocomplete,
  AutocompleteProps,
  Button,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import React, { useState, useRef, useEffect } from "react";
import Popover from "@mui/material/Popover";

interface SettingsCommand {
  label: string;
  icon: React.ReactNode;
  action: () => void;
}

const settingsCommands: SettingsCommand[] = [
  {
    label: "Toggle Light Mode",
    icon: <BrightnessHighIcon />,
    action: () => console.log("Toggling light mode"),
  },
  {
    label: "Toggle Dark Mode",
    icon: <NightlightIcon />,
    action: () => console.log("Toggling dark mode"),
  },
  {
    label: "Adjust Volume",
    icon: <VolumeUpIcon />,
    action: () => console.log("Adjusting volume"),
  },
  {
    label: "Change Language",
    icon: <LanguageIcon />,
    action: () => console.log("Changing language"),
  },
];

export function ResourceSettings() {
  const [open, setOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [inputValue, setInputValue] = useState("");
  const autocompleteRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (open && autocompleteRef.current) {
      autocompleteRef.current.focus();
    }
  }, [open]);

  return (
    <>
      <Button onClick={handleClick}>...</Button>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
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
          autoFocus
          ref={autocompleteRef}
          disablePortal
          open
          ListboxProps={{
            sx: {
              padding: 0,
            },
          }}
          inputValue={inputValue}
          onInputChange={(event, newInputValue) => setInputValue(newInputValue)}
          options={settingsCommands}
          getOptionLabel={(option) => option.label}
          onChange={handleCommandSelect}
          renderInput={(params) => (
            <TextField {...params} label="Settings" variant="outlined" />
          )}
          renderOption={(props, option) => (
            <Paper
              component="li"
              {...props}
              sx={{
                borderRadius: 0,
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
          sx={{ width: 300, padding: "8px", height: "100%" }}
        />
      </Popover>
    </>
  );
}
