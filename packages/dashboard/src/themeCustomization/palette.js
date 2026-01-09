// material-ui
import { createTheme } from "@mui/material/styles";
// third-party
import { presetPalettes } from "@ant-design/colors";
// project import
import ThemeOption from "./theme";

// ==============================|| DEFAULT THEME - PALETTE  ||============================== //
const Palette = (mode) => {
  const colors = presetPalettes;

  const greyPrimary = [
    "#ffffff",
    "#fafafa",
    "#f5f5f5",
    "#f0f0f0",
    "#d9d9d9",
    "#bfbfbf",
    "#8c8c8c",
    "#595959",
    "#262626",
    "#141414",
    "#000000",
  ];
  const greyAscent = ["#fafafa", "#bfbfbf", "#434343", "#1f1f1f"];
  const greyConstant = ["#fafafb", "#e6ebf1"];

  colors.grey = [...greyPrimary, ...greyAscent, ...greyConstant];

  // IMPORTANT: Pass mode parameter to ThemeOption
  const paletteColor = ThemeOption(colors, mode);

  return createTheme({
    palette: {
      mode,
      common: {
        black: "#000",
        white: "#fff",
      },
      ...paletteColor,
      text: {
        primary: mode === "dark" ? paletteColor.grey[50] : paletteColor.grey[700],
        secondary: paletteColor.grey[500],
        disabled: paletteColor.grey[400],
      },
      action: {
        disabled: paletteColor.grey[300],
      },
      divider: paletteColor.grey[200],
      background: {
        paper: mode === "dark" ? paletteColor.grey[900] : paletteColor.grey[0],
        default: mode === "dark" ? paletteColor.grey[800] : paletteColor.grey.A50,
      },
    },
  });
};

export default Palette;