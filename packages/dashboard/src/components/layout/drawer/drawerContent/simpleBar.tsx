// material-ui
import { Box, SxProps, Theme } from "@mui/material";
import { alpha, styled } from "@mui/material/styles";
import React from "react";
import { BrowserView, MobileView } from "react-device-detect";
// third-party
import SimpleBar from "simplebar-react";

// root style
const RootStyle = styled(BrowserView)({
  flexGrow: 1,
  height: "100%",
  overflow: "hidden",
});

// scroll bar wrapper
const SimpleBarStyle = styled(SimpleBar)(({ theme }) => ({
  maxHeight: "100%",
  "& .simplebar-scrollbar": {
    "&:before": {
      backgroundColor: alpha(theme.palette.grey[500], 0.48),
    },
    "&.simplebar-visible:before": {
      opacity: 1,
    },
  },
  "& .simplebar-track.simplebar-vertical": {
    width: 10,
  },
  "& .simplebar-track.simplebar-horizontal .simplebar-scrollbar": {
    height: 6,
  },
  "& .simplebar-mask": {
    zIndex: "inherit",
  },
}));

// ==============================|| SIMPLE SCROLL BAR  ||============================== //

export default function SimpleBarScroll({
  children,
  sx,
}: {
  children?: React.ReactElement;
  sx?: SxProps<Theme>;
}) {
  return (
    <>
      <RootStyle>
        <SimpleBarStyle timeout={500} clickOnTrack={false} sx={sx}>
          {children}
        </SimpleBarStyle>
      </RootStyle>
      <MobileView>
        <Box sx={{ overflowX: "auto", ...sx }}>{children}</Box>
      </MobileView>
    </>
  );
}
