// material-ui
import { Box, Typography } from "@mui/material";
import { useContext } from "react";

import { LayoutContext } from "../../../context";
// project import
import NavGroup from "./navGroup";

// ==============================|| DRAWER CONTENT - NAVIGATION ||============================== //

function Navigation() {
  const items = useContext(LayoutContext)?.items;
  if (!items) {
    return null;
  }

  const navGroups = items.map((item) => {
    switch (item.type) {
      case "group":
        return <NavGroup key={item.id} item={item} />;
      default:
        return (
          <Typography key={item.id} variant="h6" color="error" align="center">
            Fix - Navigation Group
          </Typography>
        );
    }
  });

  return <Box sx={{ pt: 2 }}>{navGroups}</Box>;
}

export default Navigation;
