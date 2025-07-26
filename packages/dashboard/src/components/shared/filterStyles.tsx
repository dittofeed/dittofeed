import { Divider, Stack, StackProps } from "@mui/material";
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
};

// Shared container for filters that includes the divider and horizontal layout
export function SharedFilterContainer({ 
  children, 
  ...props 
}: StackProps) {
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