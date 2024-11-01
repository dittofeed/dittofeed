// material-ui
import AppBar from "@mui/material/AppBar";
import { useTheme } from "@mui/material/styles";
import React, { ComponentProps } from "react";

// project import
import { drawerWidth } from "../../config";

// ==============================|| HEADER - APP BAR STYLED ||============================== //

function AppBarStyled({
  open,
  sx,
  ...props
}: { open: boolean } & ComponentProps<typeof AppBar>) {
  const theme = useTheme();
  return (
    <AppBar
      sx={{
        zIndex: theme.zIndex.drawer + 1,
        transition: theme.transitions.create(["width", "margin"], {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.leavingScreen,
        }),
        ...(open && {
          marginLeft: drawerWidth,
          width: `calc(100% - ${drawerWidth}px)`,
          transition: theme.transitions.create(["width", "margin"], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }),
        ...sx,
      }}
      {...props}
    />
  );
}

export default AppBarStyled;
