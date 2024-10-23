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
import { Draft } from "immer";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import React, { useRef, useState } from "react";
import { Updater, useImmer } from "use-immer";

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

interface DeliveriesState {
  open: boolean;
  anchorEl: HTMLElement | null;
  inputValue: string;
  visibleCommands: DeliveriesFilterCommand[];
  inputRef: React.RefObject<HTMLInputElement>;
}

type SetDeliveriesState = Updater<DeliveriesState>;

function useDeliveriesFilterState(
  commands: DeliveriesFilterCommand[],
): [DeliveriesState, SetDeliveriesState] {
  return useImmer<DeliveriesState>({
    open: false,
    anchorEl: null,
    inputValue: "",
    visibleCommands: commands,
    inputRef: useRef<HTMLInputElement>(null),
  });
}

export function DeliveriesFilter({
  state,
  setState,
}: {
  state: DeliveriesState;
  setState: SetDeliveriesState;
}) {
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
          setState((draft) => {
            draft.inputValue = "";
            draft.open = false;
          });
          value.action();
          break;
        case DeliveriesFilterCommandType.Parent:
          setState((draft) => {
            draft.visibleCommands = value.children;
          });
          break;
        default:
          assertUnreachable(value);
      }
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setState((draft) => {
      draft.anchorEl = event.currentTarget;
      draft.open = true;
    });
  };

  const handleClose = () => {
    setState((draft) => {
      draft.anchorEl = null;
      draft.open = false;
    });
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
        open={state.open}
        anchorEl={state.anchorEl}
        onClose={handleClose}
        TransitionProps={{
          onEntered: () => {
            state.inputRef.current?.focus();
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
          inputValue={state.inputValue}
          disableClearable
          onInputChange={(event, newInputValue) =>
            setState((draft) => {
              draft.inputValue = newInputValue;
            })
          }
          options={state.visibleCommands}
          getOptionLabel={(option) => option.label}
          onChange={handleCommandSelect}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Settings"
              variant="filled"
              inputRef={state.inputRef}
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
