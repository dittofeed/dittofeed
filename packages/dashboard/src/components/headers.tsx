import { Typography } from "@mui/material";
import React from "react";

export function SubtleHeader({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      fontWeight={300}
      variant="h2"
      sx={{ fontSize: 16, marginBottom: 0.5 }}
    >
      {children}
    </Typography>
  );
}
