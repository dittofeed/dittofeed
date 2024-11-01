// material-ui
import { Stack } from "@mui/material";
import React from "react";

import Profile from "../header/headerContent/profile";
// project import
import DrawerHeaderStyled from "./drawerHeader/drawerHeaderStyled";

// ==============================|| DRAWER HEADER ||============================== //

function DrawerHeader({ open }: { open: boolean }) {
  return (
    <DrawerHeaderStyled open={open}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Profile />
      </Stack>
    </DrawerHeaderStyled>
  );
}

export default DrawerHeader;
