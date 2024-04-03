// material-ui
import { Box, Toolbar } from "@mui/material";
import React, { useMemo } from "react";

import { useAppStore } from "../lib/appStore";
import { LayoutContext, LayoutContextValues } from "./layout/context";
// project import
import Drawer from "./layout/drawer";
import Header from "./layout/header";

function Layout({
  items,
  children,
  navigationRenderer,
  backLink,
  pageTitle,
}: {
  children?: React.ReactElement | null;
} & LayoutContextValues) {
  const drawerOpen = useAppStore((state) => state.drawerOpen);
  const toggleDrawer = useAppStore((state) => state.toggleDrawer);
  const layoutProps = useMemo(
    () => ({
      items,
      navigationRenderer,
      backLink,
      pageTitle,
    }),
    [items, navigationRenderer, backLink, pageTitle],
  );

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
            sx={{
              display: "flex",
              alignItems: "stretch",
              flex: 1,
              minHeight: 0,
            }}
          >
            {children}
          </Box>
        </Box>
      </Box>
    </LayoutContext.Provider>
  );
}

export default Layout;
