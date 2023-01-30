// material-ui
import { GithubOutlined } from "@ant-design/icons";
import { Box, IconButton, Link, Theme, useMediaQuery } from "@mui/material";

import MobileSection from "./headerContent/mobileSection";
// project import
import Profile from "./headerContent/profile";

// ==============================|| HEADER - CONTENT ||============================== //

function HeaderContent() {
  const matchesXs = useMediaQuery<Theme>((theme) =>
    theme.breakpoints.down("md")
  );

  return (
    <>
      <Box sx={{ width: "100%", ml: { xs: 0, md: 1 } }} />
      {matchesXs && <Box sx={{ width: "100%", ml: 1 }} />}

      <IconButton
        component={Link}
        href=""
        target="_blank"
        disableRipple
        color="secondary"
        title="Github Repository"
        sx={{ color: "text.primary", bgcolor: "grey.100" }}
      >
        <GithubOutlined />
      </IconButton>

      {!matchesXs && <Profile />}
      {matchesXs && <MobileSection />}
    </>
  );
}

export default HeaderContent;
