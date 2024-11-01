// material-ui
import { Box, useTheme } from "@mui/material";
import React, { ComponentProps } from "react";

// ==============================|| DRAWER HEADER - STYLED ||============================== //

interface DrawerComponentProps {
  open: boolean;
}

function DrawerHeaderStyled({
  open,
  sx,
  ...props
}: DrawerComponentProps & ComponentProps<typeof Box>) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        ...theme.mixins.toolbar,
        display: "flex",
        alignItems: "center",
        justifyContent: open ? "flex-start" : "center",
        paddingLeft: theme.spacing(open ? 3 : 0),
        ...sx,
      }}
      {...props}
    />
  );
}

export default DrawerHeaderStyled;
