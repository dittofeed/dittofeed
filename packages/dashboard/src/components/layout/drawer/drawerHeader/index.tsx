// material-ui
import { Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import Profile from "../../header/headerContent/profile";
// project import
import DrawerHeaderStyled from "./drawerHeaderStyled";

// ==============================|| DRAWER HEADER ||============================== //

function DrawerHeader({ open }: { open: boolean }) {
  const theme = useTheme();

  return (
    <DrawerHeaderStyled theme={theme} open={open}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Profile />
      </Stack>
    </DrawerHeaderStyled>
  );
}

export default DrawerHeader;
