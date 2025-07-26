import { ViewList } from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  Paper,
  SxProps,
  TextField,
  Theme,
  Typography,
} from "@mui/material";
import Popover from "@mui/material/Popover";
import React, { HTMLAttributes, useCallback, useRef, useState } from "react";
import { omit } from "remeda";

import { greyTextFieldStyles } from "../greyScaleStyles";
import { sharedFilterButtonProps } from "../shared/filterStyles";
import { SquarePaper } from "../squarePaper";

export type GroupByOption =
  | "journey"
  | "broadcast"
  | "channel"
  | "provider"
  | "messageState"
  | null;

interface GroupByCommand {
  label: string;
  value: GroupByOption;
  icon?: React.ReactNode;
}

const groupByCommands: GroupByCommand[] = [
  { label: "None", value: null },
  { label: "Journey", value: "journey" },
  { label: "Broadcast", value: "broadcast" },
  { label: "Channel", value: "channel" },
  { label: "Provider", value: "provider" },
  { label: "Message State", value: "messageState" },
];

interface AnalysisChartGroupByProps {
  value: GroupByOption;
  onChange: (value: GroupByOption) => void;
  greyScale?: boolean;
}

export function AnalysisChartGroupBy({
  value,
  onChange,
  greyScale = false,
}: AnalysisChartGroupByProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorEl = useRef<HTMLElement | null>(null);

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    anchorEl.current = event.currentTarget;
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    anchorEl.current = null;
    setOpen(false);
    setInputValue("");
  }, []);

  const handleCommandSelect = useCallback(
    (_event: any, selectedValue: GroupByCommand | null) => {
      if (selectedValue) {
        onChange(selectedValue.value);
        setOpen(false);
        setInputValue("");
      }
    },
    [onChange],
  );

  const displayValue = value ? groupByCommands.find(cmd => cmd.value === value)?.label || "None" : "None";

  const popoverBody = (
    <Autocomplete<GroupByCommand>
      disablePortal
      open
      ListboxProps={{
        sx: {
          padding: 0,
        },
      }}
      PaperComponent={SquarePaper}
      value={null}
      inputValue={inputValue}
      onInputChange={(_event, newInputValue) => setInputValue(newInputValue)}
      options={groupByCommands}
      getOptionLabel={(option) => option.label}
      onChange={handleCommandSelect}
      renderInput={(params) => (
        <TextField
          {...params}
          autoFocus
          label="Group By"
          variant="filled"
          sx={greyScale ? greyTextFieldStyles : undefined}
          inputRef={inputRef}
        />
      )}
      renderOption={(props, option) => {
        const propsWithKey = props as HTMLAttributes<HTMLLIElement> & {
          key: string;
        };
        return (
          <Paper
            component="li"
            square
            key={option.label}
            {...omit(propsWithKey, ["key"])}
            sx={{
              borderRadius: 0,
              width: 300,
            }}
          >
            <Typography
              variant="body2"
              style={{
                display: "flex",
                alignItems: "center",
              }}
            >
              {option.icon}
              <span style={{ marginLeft: "8px" }}>{option.label}</span>
            </Typography>
          </Paper>
        );
      }}
      sx={{
        width: 300,
        padding: 0,
        height: "100%",
      }}
    />
  );

  return (
    <>
      <Button
        startIcon={<ViewList />}
        variant="contained"
        color="info"
        {...sharedFilterButtonProps}
        sx={{
          ...sharedFilterButtonProps.sx,
          textTransform: "none",
          height: "100%",
        }}
        onClick={handleClick}
      >
        Group By: {displayValue}
      </Button>
      <Popover
        open={open}
        anchorEl={anchorEl.current}
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
        <Box sx={{ opacity: open ? 1 : 0 }}>{popoverBody}</Box>
      </Popover>
    </>
  );
}
