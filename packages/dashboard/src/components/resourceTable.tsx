import { Theme } from "@emotion/react";
import { SxProps } from "@mui/material";

export const RESOURCE_TABLE_STYLE: SxProps<Theme> = {
  height: "100%",
  width: "100%",
  ".MuiDataGrid-row:first-child": {
    borderTop: "1px solid lightgray",
  },
  ".MuiDataGrid-row": {
    borderBottom: "1px solid lightgray",
  },
  // disable cell selection style
  ".MuiDataGrid-cell:focus": {
    outline: "none",
  },
  // pointer cursor on ALL rows
  "& .MuiDataGrid-row:hover": {
    cursor: "pointer",
  },
};
