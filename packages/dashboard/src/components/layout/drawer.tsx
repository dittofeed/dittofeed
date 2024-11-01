import { Box, Drawer, useMediaQuery } from "@mui/material";
// material-ui
import { useTheme } from "@mui/material/styles";
import React, { useMemo } from "react";

import { drawerWidth } from "../config";
// project import
import DrawerContent from "./drawer/drawerContent";
import MiniDrawerStyled from "./drawer/miniDrawerStyled";

// ==============================|| MAIN LAYOUT - DRAWER ||============================== //

function MainDrawer({
  open,
  handleDrawerToggle,
}: {
  open: boolean;
  handleDrawerToggle: () => void;
}) {
  const theme = useTheme();
  const matchDownMD = useMediaQuery(theme.breakpoints.down("lg"));

  // responsive drawer container

  // header content
  const drawerContent = useMemo(() => <DrawerContent />, []);

  return (
    <Box
      component="nav"
      sx={{ flexShrink: { md: 0 }, zIndex: 1300 }}
      aria-label="mailbox folders"
    >
      {!matchDownMD ? (
        <MiniDrawerStyled variant="permanent" open={open}>
          {drawerContent}
        </MiniDrawerStyled>
      ) : (
        <Drawer
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          container={global?.window.document.body}
          variant="temporary"
          open={open}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", lg: "none" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
              borderRight: `1px solid ${theme.palette.divider}`,
              backgroundImage: "none",
              boxShadow: "inherit",
            },
          }}
        >
          {open && drawerContent}
        </Drawer>
      )}
    </Box>
  );
}

export default MainDrawer;
