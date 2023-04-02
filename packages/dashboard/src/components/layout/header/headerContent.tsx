// material-ui
import { GithubOutlined } from "@ant-design/icons";
import { useTheme } from "@emotion/react";
import { Lock } from "@mui/icons-material";
import {
  Box,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  Link,
  ListSubheader,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  SvgIcon,
  SvgIconProps,
  Theme,
  useMediaQuery,
} from "@mui/material";
import React from "react";

import { useAppStore } from "../../../lib/appStore";
import MobileSection from "./headerContent/mobileSection";
// project import
import Profile from "./headerContent/profile";

// ==============================|| HEADER - CONTENT ||============================== //

function GitBranchIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 512 512">
      <path d="M416 160a64 64 0 10-96.27 55.24c-2.29 29.08-20.08 37-75 48.42-17.76 3.68-35.93 7.45-52.71 13.93v-126.2a64 64 0 10-64 0v209.22a64 64 0 1064.42.24c2.39-18 16-24.33 65.26-34.52 27.43-5.67 55.78-11.54 79.78-26.95 29-18.58 44.53-46.78 46.36-83.89A64 64 0 00416 160zM160 64a32 32 0 11-32 32 32 32 0 0132-32zm0 384a32 32 0 1132-32 32 32 0 01-32 32zm192-256a32 32 0 1132-32 32 32 0 01-32 32z" />
    </SvgIcon>
  );
}

function BranchMenuItem({
  item,
  icon,
}: {
  item: string;
  icon?: React.ReactNode;
}) {
  return (
    <MenuItem value={item}>
      <Stack direction="row" alignItems="center" spacing={1}>
        {icon ?? <GitBranchIcon color="action" />}
        <Box sx={{ fontSize: ".75rem" }}>{item}</Box>
      </Stack>
    </MenuItem>
  );
}

function BranchSelect() {
  const enableSourceControl = useAppStore((store) => store.enableSourceControl);
  const sourceControlProvider = useAppStore(
    (store) => store.sourceControlProvider
  );

  const [branch, setBranch] = React.useState("main");

  if (!enableSourceControl || !sourceControlProvider) {
    return null;
  }

  const handleChange = (event: SelectChangeEvent) => {
    setBranch(event.target.value as string);
  };

  return (
    <Select
      value={branch}
      label="Branch"
      sx={{ minWidth: 150, fontSize: ".75rem", ml: 1, mr: 1 }}
      onChange={handleChange}
      renderValue={(value) => <>{value}</>}
    >
      <BranchMenuItem item="main" icon={<Lock color="action" />} />
      <Divider />
      <ListSubheader sx={{ fontSize: ".75rem" }}>your branches</ListSubheader>
      <BranchMenuItem item="my-feature-branch" />
    </Select>
  );
}

function HeaderContent() {
  const matchesXs = useMediaQuery<Theme>((theme) =>
    theme.breakpoints.down("md")
  );

  return (
    <>
      <BranchSelect />
      <Box sx={{ width: "100%", ml: { xs: 0, md: 1 } }} />
      {matchesXs && <Box sx={{ width: "100%", ml: 1 }} />}

      <IconButton
        component={Link}
        href="https://github.com/dittofeed/dittofeed"
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
