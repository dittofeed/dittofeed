import { ViewList } from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import Popover from "@mui/material/Popover";
import { AnalysisGroupByKey } from "isomorphic-lib/src/types";
import React, {
  HTMLAttributes,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { omit } from "remeda";

import { greyTextFieldStyles } from "../greyScaleStyles";
import { sharedFilterButtonProps } from "../shared/filterStyles";
import { SquarePaper } from "../squarePaper";

export type GroupByOption =
  | "journey"
  | "broadcast"
  | "messageTemplate"
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
  { label: "Message Template", value: "messageTemplate" },
  { label: "Channel", value: "channel" },
  { label: "Provider", value: "provider" },
  { label: "Message State", value: "messageState" },
];

// Options that are always available regardless of configuration
const alwaysAvailableOptions: GroupByOption[] = ["channel", "messageState"];

interface AnalysisChartGroupByProps {
  value: GroupByOption;
  onChange: (value: GroupByOption) => void;
  greyScale?: boolean;
  allowedGroupBy?: AnalysisGroupByKey[];
}

export function AnalysisChartGroupBy({
  value,
  onChange,
  greyScale = false,
  allowedGroupBy,
}: AnalysisChartGroupByProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorEl = useRef<HTMLElement | null>(null);

  // Filter group by commands based on allowedGroupBy configuration
  // "None", "channel", and "messageState" are always available
  const filteredGroupByCommands = useMemo(() => {
    if (!allowedGroupBy) {
      return groupByCommands;
    }
    return groupByCommands.filter(
      (cmd) =>
        cmd.value === null ||
        alwaysAvailableOptions.includes(cmd.value) ||
        allowedGroupBy.includes(cmd.value as AnalysisGroupByKey),
    );
  }, [allowedGroupBy]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      anchorEl.current = event.currentTarget;
      setOpen(true);
    },
    [],
  );

  const handleClose = useCallback(() => {
    anchorEl.current = null;
    setOpen(false);
    setInputValue("");
  }, []);

  const handleCommandSelect = useCallback(
    (_event: unknown, selectedValue: GroupByCommand | null) => {
      if (selectedValue) {
        onChange(selectedValue.value);
        setOpen(false);
        setInputValue("");
      }
    },
    [onChange],
  );

  const displayValue = value
    ? groupByCommands.find((cmd) => cmd.value === value)?.label ?? "None"
    : "None";

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
      options={filteredGroupByCommands}
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
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
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
