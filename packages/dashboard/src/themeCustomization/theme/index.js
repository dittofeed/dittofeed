// ==============================|| PRESET THEME - THEME SELECTOR (DARK/LIGHT READY) ||============================== //

const Theme = (colors, mode = "light") => {
  const { blue, red, gold, cyan, green, grey } = colors;

  const greyColors = {
    0: grey[0],
    50: grey[1],
    100: grey[2],
    200: grey[3],
    300: grey[4],
    400: grey[5],
    500: grey[6],
    600: grey[7],
    700: grey[8],
    800: grey[9],
    900: grey[10],
    A50: grey[15],
    A100: grey[11],
    A200: grey[12],
    A400: grey[13],
    A700: grey[14],
    A800: grey[16],
  };
  const contrastText = "#fff";

  // ------------------------ DARK MODE ADJUSTMENTS ------------------------
  const isDark = mode === "dark";

  const adjust = (lightColor, darkColor) => (isDark ? darkColor : lightColor);

  return {
    primary: {
      lighter: adjust(blue[0], blue[3]),
      100: adjust(blue[1], blue[4]),
      200: adjust(blue[2], blue[5]),
      light: adjust(blue[3], blue[6]),
      400: adjust(blue[4], blue[7]),
      main: adjust(blue[5], blue[8]),
      dark: adjust(blue[6], blue[9]),
      700: adjust(blue[7], blue[9]),
      darker: adjust(blue[8], blue[9]),
      900: blue[9],
      contrastText,
    },
    blue: {
      default: "#0098BA",
      100: "#9AD9E7",
      200: "#6ECCE0",
      300: "#49BBD4",
    },
    secondary: {
      lighter: adjust(greyColors[100], greyColors[800]),
      100: adjust(greyColors[100], greyColors[700]),
      200: adjust(greyColors[200], greyColors[600]),
      light: adjust(greyColors[300], greyColors[500]),
      400: adjust(greyColors[400], greyColors[400]),
      main: adjust(greyColors[500], greyColors[300]),
      600: adjust(greyColors[600], greyColors[200]),
      dark: adjust(greyColors[700], greyColors[100]),
      800: greyColors[800],
      darker: greyColors[900],

      A100: greyColors[0],
      A200: greyColors.A400,
      A300: greyColors.A700,
      contrastText: adjust(greyColors[0], "#ffffff"),
    },

    error: {
      lighter: adjust(red[0], red[2]),
      light: adjust(red[2], red[3]),
      main: adjust(red[4], red[5]),
      dark: adjust(red[7], red[7]),
      darker: red[9],
      contrastText,
    },

    warning: {
      postIt: adjust("#FFFAE5", "#5A4A00"),
      postItContrastText: adjust("#8B6F03", "#F7E48A"),

      lighter: adjust(gold[0], gold[2]),
      light: adjust(gold[3], gold[4]),
      main: adjust(gold[5], gold[6]),
      dark: adjust(gold[7], gold[8]),
      darker: gold[9],

      contrastText: adjust(greyColors[100], greyColors[900]),
    },

    info: {
      lighter: adjust(cyan[0], cyan[2]),
      light: adjust(cyan[3], cyan[4]),
      main: adjust(cyan[5], cyan[6]),
      dark: adjust(cyan[7], cyan[8]),
      darker: cyan[9],
      contrastText,
    },

    success: {
      lighter: adjust(green[0], green[2]),
      light: adjust(green[3], green[4]),
      main: adjust(green[5], green[6]),
      dark: adjust(green[7], green[8]),
      darker: green[9],
      contrastText,
    },
    grey: greyColors,
  };
};

export default Theme;
