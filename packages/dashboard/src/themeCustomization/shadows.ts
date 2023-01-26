// material-ui
import { alpha, Theme } from "@mui/material/styles";

// ==============================|| DEFAULT THEME - CUSTOM SHADOWS  ||============================== //

const CustomShadows = (theme: Theme) => ({
  button: `0 2px #0000000b`,
  text: `0 -1px 0 rgb(0 0 0 / 12%)`,
  z1: `0px 2px 8px ${alpha(theme.palette.grey[900], 0.15)}`,
  inset:
    "inset 0px 2px 1px -1px rgb(0 0 0 / 20%), inset 0px 1px 1px 0px rgb(0 0 0 / 14%), inset 0px 1px 3px 0px rgb(0 0 0 / 12%)",
});

export default CustomShadows;
