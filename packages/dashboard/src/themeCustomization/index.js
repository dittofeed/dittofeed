import { useEffect, useMemo } from "react";

// material-ui
import { CssBaseline } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";

// project import
import Palette from "./palette";
import Typography from "./typography";
import CustomShadows from "./shadows";
import componentsOverride from "./overrides";
import { useThemeMode } from "./ThemeContext";

// ==============================|| THEME CUSTOMIZATION (WITH DARK/LIGHT/SYSTEM) ||============================== //
export default function ThemeCustomization({ children }) {
  // Get mode from context
  const { mode: selectedMode } = useThemeMode();

  // Handle system theme detection
  const isSystemDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  // Resolve final theme considering system mode
  const resolvedMode =
    selectedMode === "system" ? (isSystemDark ? "dark" : "light") : selectedMode;

  // Watch system theme changes in "system" mode
  useEffect(() => {
    if (selectedMode === "system") {
      const listener = () => {
        // Force re-render by updating a dummy state or just let the component re-render
        window.dispatchEvent(new Event("theme-change"));
      };
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", listener);
      return () => {
        mediaQuery.removeEventListener("change", listener);
      };
    }
  }, [selectedMode]);

  // Generate palette based on resolved mode
  const theme = Palette(resolvedMode, "default");
  const themeTypography = Typography(
    "Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji"
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
    [theme, themeTypography, themeCustomShadows]
  );

  const muiTheme = createTheme(themeOptions);
  muiTheme.components = componentsOverride(muiTheme);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}