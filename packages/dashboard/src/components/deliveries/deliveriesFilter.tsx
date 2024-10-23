import { AddCircleOutline } from "@mui/icons-material";
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
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import React, { useRef, useState } from "react";

export interface BaseDeliveriesFilterCommand {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export enum DeliveriesFilterCommandType {
  Leaf = "Leaf",
  Parent = "Parent",
}

export type LeafDeliveriesFilterCommand = BaseDeliveriesFilterCommand & {
  type: DeliveriesFilterCommandType.Leaf;
  action: () => void;
};

export type ParentDeliveriesFilterCommand = BaseDeliveriesFilterCommand & {
  type: DeliveriesFilterCommandType.Parent;
  children: DeliveriesFilterCommand[];
};

export type DeliveriesFilterCommand =
  | LeafDeliveriesFilterCommand
  | ParentDeliveriesFilterCommand;

export function DeliveriesFilter({
  commands,
}: {
  commands: DeliveriesFilterCommand[];
}) {
  const [open, setOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null); // Updated ref
  const [visibleCommands, setVisibleCommands] = useState(commands);
  const theme = useTheme();

  const handleCommandSelect: AutocompleteProps<
    DeliveriesFilterCommand,
    false,
    false,
    false
  >["onChange"] = (_event, value) => {
    if (value) {
      switch (value.type) {
        case DeliveriesFilterCommandType.Leaf:
          setInputValue("");
          setOpen(false); // Close dropdown after selection
          value.action();
          break;
        case DeliveriesFilterCommandType.Parent:
          setVisibleCommands(value.children);
          break;
        default:
          assertUnreachable(value);
      }
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
        startIcon={<AddCircleOutline />}
        size="small"
        sx={{
          color: theme.palette.grey[800],
          fontWeight: 800,
          fontSize: 18,
        }}
      >
        Add Filter
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
          options={visibleCommands}
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
          getOptionDisabled={(option) => option.disabled ?? false}
          sx={{ width: 300, padding: 0, height: "100%" }}
        />
      </Popover>
    </>
  );
}
