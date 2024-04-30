// material-ui
import { GitHub, Lock } from "@mui/icons-material";
import LoadingButton from "@mui/lab/LoadingButton";
import {
  Box,
  Dialog,
  DialogContent,
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

import { useAppStorePick } from "../../../lib/appStore";
import ExternalLink from "../../externalLink";
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

const newBranch = "new-branch" as const;
const branchName = "maxgurewitz/my-feature-branch";

function BranchSelect() {
  const { enableSourceControl, sourceControlProvider } = useAppStorePick([
    "enableSourceControl",
    "sourceControlProvider",
  ]);

  const [branch, setBranch] = React.useState("main");
  const [newBranchIsOpen, setNewBranchIsOpen] = React.useState(false);
  const [newBranchIsLoading, setNewBranchIsLoading] = React.useState(false);
  const [availableBranches, setAvailableBranches] = React.useState<string[]>(
    [],
  );

  if (!enableSourceControl || !sourceControlProvider) {
    return null;
  }

  const handleChange = (event: SelectChangeEvent) => {
    if (event.target.value === newBranch) {
      setNewBranchIsOpen(true);
      return;
    }
    setBranch(event.target.value as string);
  };

  const handleCreateNewBranch = () => {
    setNewBranchIsLoading(true);
    setTimeout(() => {
      setAvailableBranches([branchName]);
      setNewBranchIsOpen(false);
      setBranch(branchName);
      setNewBranchIsLoading(false);
    }, 200);
  };

  // maxgurewitz/my-feature-branch
  return (
    <>
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
        <MenuItem value={newBranch}>
          <BranchMenuItemContents item="New Branch" />
        </MenuItem>
        {availableBranches.map((ab) => (
          <MenuItem value={ab} key={ab}>
            <BranchMenuItemContents item={ab} />
          </MenuItem>
        ))}
      </Select>

      <Dialog
        fullWidth
        maxWidth="sm"
        open={newBranchIsOpen}
        onClose={() => {
          setNewBranchIsOpen(false);
        }}
      >
        <DialogTitle>
          <Typography variant="h5">Create a new branch</Typography>
        </DialogTitle>

        <DialogContent>
          <Stack direction="column" spacing={1} alignItems="center">
            <Box sx={{ width: "100%" }}>
              Create a new branch based off of the main branch
            </Box>
            <TextField defaultValue="maxgurewitz/" sx={{ width: "100%" }} />
            <Typography variant="caption" sx={{ width: "100%" }}>
              Your branch will be created locally. You will need to commit and
              push it to see it in GitHub.
            </Typography>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="right"
              sx={{ width: "100%" }}
            >
              <LoadingButton
                loading={newBranchIsLoading}
                variant="contained"
                sx={{ textTransform: "none" }}
                onClick={handleCreateNewBranch}
              >
                Create new branch
              </LoadingButton>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}

enum GitAction {
  CommitAndPush = "CommitAndPush",
  OpenPR = "OpenPR",
}

const oldConfig = `definition:
  entryNode:
    segment: 'Users created within the last 30 minutes'
    child: 1
  nodes:
    - id: 1
      type: 'MessageNode'
      child: 2
      variant:
        type: 'Email'
        template: 'Welcome'
    - id: 2
      type: 'DelayNode'
      child: 3
      variant:
        type: 'Second'
        seconds: 604800
    - id: 3
      type: 'MessageNode'
      child: 4
      variant:
        type: 'Email'
        template: '10 Reasons to Upgrade'
    - id: 4
      type: 'ExitNode'
`;

const newConfig = `definition:
  entryNode:
    segment: 'Users created within the last 30 minutes'
    child: 1
  nodes:
    - id: 1
      type: 'MessageNode'
      child: 2
      variant:
        type: 'Email'
        template: 'Welcome'
    - id: 2
      type: 'ExitNode'
`;

function GitActionsSelect() {
  const theme = useTheme();
  const { enableSourceControl, sourceControlProvider } = useAppStorePick([
    "enableSourceControl",
    "sourceControlProvider",
  ]);
  const [isDiffOpen, setDiffOpen] = React.useState(false);
  const handleClose = () => setDiffOpen(false);

  if (!enableSourceControl || !sourceControlProvider) {
    return null;
  }
  const oldText = oldConfig;
  const newText = newConfig;

  const handleChange = (event: SelectChangeEvent) => {
    const value = event.target.value as string;
    switch (value) {
      case GitAction.CommitAndPush: {
        setDiffOpen(true);
        break;
      }
      default:
        console.error("unanticipated select");
    }
  };

  const CommitAndPush = lazy(() => import("../../commitAndPush"));

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
        <MenuItem value={GitAction.OpenPR}>
          <ExternalLink href="https://github.com/dittofeed/dittofeed/compare/main...maxgurewitz%2Fmy-feature-branch?body=&expand=1&title=remove+delay+and+message+nodes">
            Open Pull Request
          </ExternalLink>
        </MenuItem>
      </Select>
      <Dialog fullWidth maxWidth="md" open={isDiffOpen} onClose={handleClose}>
        <Suspense>
          <CommitAndPush
            branchName={branchName}
            diffs={[
              {
                oldFileName: "Onboarding Journey",
                newFileName: "Onboarding Journey",
                newText,
                oldText,
              },
            ]}
            onCommit={handleClose}
          />
        </Suspense>
      </Dialog>
    </>
  );
}

function HeaderContent() {
  const matchesXs = useMediaQuery<Theme>((theme) =>
    theme.breakpoints.down("md"),
  );
  const { features } = useAppStorePick(["features"]);

  return (
    <>
      <BranchSelect />
      <Box sx={{ width: "100%", ml: { xs: 0, md: 1 } }} />
      {matchesXs && <Box sx={{ width: "100%", ml: 1 }} />}
      <GitActionsSelect />
      {!features.WhiteLabel ? (
        <IconButton
          component={Link}
          href="https://github.com/dittofeed/dittofeed"
          target="_blank"
          disableRipple
          color="secondary"
          title="Github Repository"
          sx={{ color: "text.primary", bgcolor: "grey.100" }}
        >
          <GitHub />
        </IconButton>
      ) : null}

      {!matchesXs && <Profile />}
      {matchesXs && <MobileSection />}
    </>
  );
}

export default HeaderContent;
