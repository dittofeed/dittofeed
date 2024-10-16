import BrightnessHighIcon from "@mui/icons-material/BrightnessHigh";
import LanguageIcon from "@mui/icons-material/Language";
import NightlightIcon from "@mui/icons-material/Nightlight";
import SettingsIcon from "@mui/icons-material/Settings";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import {
  Autocomplete,
  AutocompleteProps,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import React, { useState } from "react";

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
  const [inputValue, setInputValue] = useState("");

  const handleCommandSelect: AutocompleteProps<
    SettingsCommand,
    false,
    false,
    false
  >["onChange"] = (event, value) => {
    if (value) {
      value.action();
      setInputValue("");
    }
  };

  return (
    <Autocomplete
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      inputValue={inputValue}
      onInputChange={(event, newInputValue) => setInputValue(newInputValue)}
      options={settingsCommands}
      getOptionLabel={(option) => option.label}
      onChange={handleCommandSelect}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Settings"
          variant="outlined"
          InputProps={{
            ...params.InputProps,
            startAdornment: <SettingsIcon />,
          }}
        />
      )}
      renderOption={(props, option) => (
        <Paper component="li" {...props}>
          <Typography
            variant="body2"
            style={{ display: "flex", alignItems: "center" }}
          >
            {option.icon}
            <span style={{ marginLeft: "8px" }}>{option.label}</span>
          </Typography>
        </Paper>
      )}
      style={{ width: 300 }}
    />
  );
}
