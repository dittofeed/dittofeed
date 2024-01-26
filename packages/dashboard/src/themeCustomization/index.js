import { useMemo } from "react";

// material-ui
import { CssBaseline } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";

// project import
import Palette from "./palette";
import Typography from "./typography";
import CustomShadows from "./shadows";
import componentsOverride from "./overrides";

// ==============================|| DEFAULT THEME - MAIN  ||============================== //

export default function ThemeCustomization({ children }) {
  const theme = Palette("light", "default");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const themeTypography = Typography(
    "Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji",
  );

  const themeCustomShadows = useMemo(() => CustomShadows(theme), [theme]);

  const themeOptions = useMemo(
    () => ({
      breakpoints: {
        values: {
          xs: 0,
          sm: 768,
          md: 1024,
          lg: 1266,
          xl: 1536,
        },
      },
      direction: "ltr",
      mixins: {
        toolbar: {
          minHeight: 60,
          paddingTop: 8,
          paddingBottom: 8,
        },
      },
      palette: theme.palette,
      customShadows: themeCustomShadows,
      typography: themeTypography,
    }),
    [theme, themeTypography, themeCustomShadows],
  );

  const themes = createTheme(themeOptions);
  themes.components = componentsOverride(themes);

  return (
    <ThemeProvider theme={themes}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
