import {
  Chip,
  ChipProps,
  Divider,
  Stack,
  StackProps,
  Tooltip,
} from "@mui/material";
import React from "react";

import { greyButtonStyle } from "../greyButtonStyle";

// Shared button styling for filter buttons that matches userEventsTable
export const sharedFilterButtonProps = {
  disableRipple: true,
  sx: {
    ...greyButtonStyle,
    fontWeight: "bold",
  },
};

// Shared chip styling for filter chips that matches userEventsTable
export const sharedFilterChipSx = {
  height: "100%",
  maxWidth: "240px",
  "& .MuiChip-label": {
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    overflow: "hidden",
    maxWidth: "100%",
  },
};

// Shared styling for hardcoded (disabled) filter chips
export const hardcodedFilterChipSx = {
  ...sharedFilterChipSx,
  opacity: 0.7,
  "& .MuiChip-deleteIcon": {
    display: "none",
  },
};

export interface HardcodedFilterChipProps {
  label: string;
  chipProps?: Omit<ChipProps, "label" | "disabled">;
}

/**
 * A disabled filter chip for displaying hardcoded/immutable filters.
 * Styled with reduced opacity and no delete icon.
 */
export function HardcodedFilterChip({
  label,
  chipProps,
}: HardcodedFilterChipProps) {
  return (
    <Tooltip title={label} placement="bottom-start">
      <Chip
        sx={{
          ...hardcodedFilterChipSx,
          ...chipProps?.sx,
        }}
        {...chipProps}
        label={label}
        disabled
      />
    </Tooltip>
  );
}

// Shared container for filters that includes the divider and horizontal layout
export function SharedFilterContainer({ children, ...props }: StackProps) {
  return (
    <>
      <Divider
        orientation="vertical"
        flexItem
        sx={{ borderColor: "grey.300" }}
      />
      <Stack
        direction="row"
        spacing={1}
        flex={1}
        sx={{ height: "100%" }}
        {...props}
      >
        {children}
      </Stack>
    </>
  );
}
