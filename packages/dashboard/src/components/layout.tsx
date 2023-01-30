// material-ui
import { Box, Toolbar } from "@mui/material";
import React, { useMemo } from "react";

import { useAppStore } from "../lib/appStore";
import { LayoutContext } from "./layout/context";
// project import
import Drawer from "./layout/drawer";
import Header from "./layout/header";
import { MenuItemGroup } from "./menuItems/types";

function Layout({
  items,
  children,
}: {
  children?: React.ReactElement | null;
  items: MenuItemGroup[];
}) {
  const drawerOpen = useAppStore((state) => state.drawerOpen);
  const toggleDrawer = useAppStore((state) => state.toggleDrawer);
  const layoutProps = useMemo(() => ({ items }), [items]);

  return (
    <LayoutContext.Provider value={layoutProps}>
      <Box sx={{ display: "flex", width: "100%", height: "100vh" }}>
        <Header open={drawerOpen} handleDrawerToggle={toggleDrawer} />
        <Drawer open={drawerOpen} handleDrawerToggle={toggleDrawer} />
        <Box
          component="main"
          sx={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            flexGrow: 1,
            height: "100%",
          }}
        >
          <Toolbar />
          <Box
            id="layout-contents"
            sx={{ display: "flex", alignItems: "stretch", flex: 1 }}
          >
            {children}
          </Box>
        </Box>
      </Box>
    </LayoutContext.Provider>
  );
}

export default Layout;
