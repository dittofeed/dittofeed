// material-ui
import { GithubOutlined } from "@ant-design/icons";
import { Lock } from "@mui/icons-material";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  ListSubheader,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  SvgIcon,
  SvgIconProps,
  Theme,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import React from "react";

import { useAppStore } from "../../../lib/appStore";
import CodeDiff from "../../codeDiff";
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

function BranchMenuItemContents({
  item,
  icon,
}: {
  item: string;
  icon?: React.ReactNode;
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      {icon ?? <GitBranchIcon color="action" />}
      <Box sx={{ fontSize: ".75rem" }}>{item}</Box>
    </Stack>
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
      sx={{
        fontSize: ".75rem",
        ml: 1,
        mr: 1,
        height: "100%",
        "& .MuiSelect-select": {
          pt: 1,
          pb: 1,
          height: "100%",
        },
      }}
      onChange={handleChange}
      renderValue={(value) => (
        <Stack spacing={1} direction="row" alignItems="center">
          {value === "main" ? (
            <Lock color="action" />
          ) : (
            <GitBranchIcon color="action" />
          )}
          <Box>{value}</Box>
        </Stack>
      )}
    >
      <MenuItem value="main">
        <BranchMenuItemContents item="main" icon={<Lock color="action" />} />
      </MenuItem>
      <Divider />

      <ListSubheader sx={{ fontSize: ".75rem" }}>your branches</ListSubheader>

      <MenuItem value="my-feature-branch">
        <BranchMenuItemContents item="maxgurewitz/my-feature-branch" />
      </MenuItem>
    </Select>
  );
}

enum GitAction {
  CommitAndPush = "CommitAndPush",
  OpenPR = "OpenPR",
}

function GitActionsSelect() {
  const theme = useTheme();
  const enableSourceControl = useAppStore((store) => store.enableSourceControl);
  const sourceControlProvider = useAppStore(
    (store) => store.sourceControlProvider
  );
  const [isDiffOpen, setDiffOpen] = React.useState(false);
  const handleClose = () => setDiffOpen(false);

  if (!enableSourceControl || !sourceControlProvider) {
    return null;
  }
  const oldText =
    "[\n" +
    "    {\n" +
    '        "age": "22",\n' +
    '        "name": "Niroj"\n' +
    "    },\n" +
    "    {\n" +
    '        "age": "20",\n' +
    '        "name": "Dey"\n' +
    "    }\n" +
    "]\n";
  const newText =
    "[\n" +
    "    {\n" +
    '        "age": "22",\n' +
    '        "name": "Niroj"\n' +
    "    },\n" +
    "    {\n" +
    '        "age": "20",\n' +
    '        "name": "Dey1"\n' +
    "    }\n" +
    "]\n";
  const branchName = "maxgurewitz/my-feature-branch";

  const handleChange = (event: SelectChangeEvent) => {
    const value = event.target.value as string;
    switch (value) {
      case GitAction.CommitAndPush: {
        setDiffOpen(true);
        break;
      }
      case GitAction.OpenPR: {
        console.log("open pr");
        break;
      }
      default:
        console.error("unanticipated select");
    }
  };

  return (
    <>
      <Select
        value=""
        displayEmpty
        sx={{
          minWidth: 150,
          fontSize: ".75rem",
          backgroundColor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
          ml: 1,
          mr: 1,
          "& svg": {
            color: theme.palette.primary.contrastText,
          },
          height: "100%",
          "& .MuiSelect-select": {
            pt: 1,
            pb: 1,
            height: "100%",
          },
        }}
        onChange={handleChange}
        renderValue={() => (
          <Stack spacing={1} direction="row" alignItems="center">
            <GitBranchIcon />
            <Box>Actions</Box>
          </Stack>
        )}
      >
        <MenuItem value={GitAction.CommitAndPush}>Commit and Push</MenuItem>
        <MenuItem value={GitAction.OpenPR}>Open Pull Request</MenuItem>
      </Select>
      <Dialog open={isDiffOpen} onClose={handleClose} fullWidth maxWidth="md">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography>Commit and push to remote branch</Typography>
            <Button
              sx={{
                backgroundColor: theme.palette.primary.lighter,
                p: 1,
                borderRadius: 1,
              }}
            >
              <a
                href={`https://github.com/dittofeed/dittofeed/tree/${branchName}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  textDecoration: "none",
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <GitBranchIcon
                    sx={{
                      fontSize: "1rem",
                      color: theme.palette.primary.main,
                    }}
                  />
                  <Box
                    sx={{
                      fontSize: ".75rem",
                      color: theme.palette.primary.main,
                      textTransform: "none",
                    }}
                  >
                    {branchName}
                  </Box>
                </Stack>
              </a>
            </Button>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack direction="column" spacing={1} alignItems="center">
            <DialogContentText>Foo Bar</DialogContentText>
            <CodeDiff oldText={oldText} newText={newText} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button autoFocus>My Button</Button>
        </DialogActions>
      </Dialog>
    </>
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
      <GitActionsSelect />
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
