// material-ui
// assets
import { MenuOpenOutlined, MenuOutlined } from "@mui/icons-material";
import { AppBar, IconButton, Toolbar, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";

// project import
import AppBarStyled from "./header/appBarStyled";
import HeaderContent from "./header/headerContent";
import { useThemeMode } from "../../themeCustomization/ThemeContext";


// ==============================|| MAIN LAYOUT - HEADER ||============================== //

function Header({
  open,
  handleDrawerToggle,
}: {
  open: boolean;
  handleDrawerToggle: () => void;
}) {
  const theme = useTheme();
  const { envTheme } = useThemeMode();
  const matchDownMD = useMediaQuery(theme.breakpoints.down("lg"));

  const iconBackColor = "grey.100";
  const iconBackColorOpen = "grey.200";

  // common header
  const mainHeader = (
    <Toolbar>
      <IconButton
        disableRipple
        aria-label="open drawer"
        onClick={handleDrawerToggle}
        edge="start"
        color="secondary"
        sx={{
          color: "text.primary",
          "&:hover": { bgcolor: "secondary.lighter" },
          ...(envTheme === "light" && {
            bgcolor: open ? iconBackColorOpen : iconBackColor
          }),
          ml: { xs: 0, lg: -2 }
        }}

      >
        {!open ? <MenuOutlined /> : <MenuOpenOutlined />}
      </IconButton>
      <HeaderContent />
    </Toolbar>
  );

  // app-bar params
  const appBar: React.ComponentProps<typeof AppBar> = {
    position: "fixed",
    color: "inherit",
    elevation: 0,
    sx: {
      borderBottom: `1px solid ${theme.palette.divider}`,
      boxShadow: theme.customShadows.z1,
    },
  };

  return (
    <>
      {!matchDownMD ? (
        <AppBarStyled open={open} {...appBar}>
          {mainHeader}
        </AppBarStyled>
      ) : (
        <AppBar {...appBar}>{mainHeader}</AppBar>
      )}
    </>
  );
}
export default Header;
