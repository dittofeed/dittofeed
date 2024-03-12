import { SxProps, Theme } from "@mui/material";

export function getWarningStyles(theme: Theme): SxProps<Theme> {
  return {
    borderColor: theme.palette.warning.light,
    backgroundColor: theme.palette.warning.postIt,
    color: theme.palette.warning.postItContrastText,
    borderWidth: 2,
    borderStyle: "solid",
    borderRadius: 1,
  };
}
