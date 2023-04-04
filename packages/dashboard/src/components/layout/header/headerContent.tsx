// material-ui
import { GithubOutlined } from "@ant-design/icons";
import { Lock } from "@mui/icons-material";
import {
  Box,
  Button,
  Dialog,
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
  TextField,
  Theme,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import React, { lazy, Suspense } from "react";

import { useAppStore } from "../../../lib/appStore";
import ErrorBoundary from "../../errorBoundary";
import { GitBranchIcon } from "../../gitBranchIcon";
import MobileSection from "./headerContent/mobileSection";
// project import
import Profile from "./headerContent/profile";

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

  const CodeDiff = lazy(() => import("../../codeDiff"));

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
            <Typography variant="h5">
              Commit and push to remote branch
            </Typography>
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
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ width: "100%" }}
              spacing={1}
            >
              <Typography sx={{ fontWeight: 600 }}>title</Typography>
              <TextField
                sx={{
                  flex: 1,
                  "& .MuiInputLabel-root": {
                    fontSize: "0.75rem",
                  },
                  "& .MuiOutlinedInput-input": {
                    p: 1,
                    fontSize: "0.75rem",
                  },
                }}
              />
              <Typography sx={{ fontWeight: 600 }}>description</Typography>
              <TextField
                sx={{
                  flex: 1,
                  "& .MuiInputLabel-root": {
                    fontSize: "0.75rem",
                  },
                  "& .MuiOutlinedInput-input": {
                    p: 1,
                    fontSize: "0.75rem",
                  },
                }}
              />
            </Stack>
            <Suspense>
              <CodeDiff oldText={oldText} newText={newText} />
            </Suspense>
          </Stack>
        </DialogContent>
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
