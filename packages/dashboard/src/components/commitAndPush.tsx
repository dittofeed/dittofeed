// material-ui
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import React, { ComponentProps, Suspense } from "react";

import CodeDiff from "./codeDiff";
import { GitBranchIcon } from "./gitBranchIcon";

export default function CommitAndPush(
  props: ComponentProps<typeof Dialog> & {
    branchName: string;
    newText: string;
    oldText: string;
  }
) {
  const theme = useTheme();
  const { branchName, newText, oldText } = props;
  return (
    <Dialog fullWidth maxWidth="md" {...props}>
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
            <Button variant="contained">Commit and push</Button>
          </Stack>
          <Suspense>
            <CodeDiff oldText={oldText} newText={newText} />
          </Suspense>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
