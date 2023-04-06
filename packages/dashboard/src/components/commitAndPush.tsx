// material-ui
import LoadingButton from "@mui/lab/LoadingButton";
import {
  Box,
  Button,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import hash from "fnv1a";
import { enqueueSnackbar } from "notistack";
import React from "react";

import { noticeAnchorOrigin } from "../lib/notices";
import { UnifiedDiffParams } from "../lib/unifiedDiff";
import CodeDiff from "./codeDiff";
import ExternalLink from "./externalLink";
import { GitBranchIcon } from "./gitBranchIcon";

export default function CommitAndPush({
  branchName,
  diffs,
  onCommit,
}: {
  branchName: string;
  diffs: UnifiedDiffParams[];
  onCommit?: () => void;
}) {
  const theme = useTheme();
  const [title, setTitle] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const isCommitDisabled = title.length === 0;
  const handleSubmit = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      enqueueSnackbar("Successfully committed changes", {
        variant: "success",
        autoHideDuration: 3000,
        anchorOrigin: noticeAnchorOrigin,
      });
      if (onCommit) {
        onCommit();
      }
    }, 1000);
  };

  return (
    <>
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h5">Commit and push to remote branch</Typography>
          <Button
            sx={{
              backgroundColor: theme.palette.primary.lighter,
              p: 1,
              borderRadius: 1,
            }}
          >
            <ExternalLink
              href={`https://github.com/dittofeed/dittofeed/tree/${branchName}`}
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
            </ExternalLink>
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
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
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
            <LoadingButton
              variant="contained"
              loading={loading}
              disabled={isCommitDisabled}
              onClick={handleSubmit}
            >
              Commit and push
            </LoadingButton>
          </Stack>
          {diffs.map((diff) => (
            <CodeDiff key={hash(diff.oldText + diff.newText)} {...diff} />
          ))}
        </Stack>
      </DialogContent>
    </>
  );
}
