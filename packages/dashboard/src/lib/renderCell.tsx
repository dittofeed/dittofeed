import { Box, Tooltip } from "@mui/material";
import React from "react";

export default function renderCell(params: any) {
  return (
    <Tooltip title={params.value} placement="right-start">
      <Box sx={{ fontFamily: "monospace" }}>{params.value}</Box>
    </Tooltip>
  );
}
