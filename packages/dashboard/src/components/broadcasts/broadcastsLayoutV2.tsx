import KeyboardDoubleArrowDownRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowDownRounded";
import KeyboardDoubleArrowUpRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowUpRounded";
import { SxProps, Theme, Typography } from "@mui/material";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepButton from "@mui/material/StepButton";
import Stepper from "@mui/material/Stepper";
import { CompletionStatus } from "isomorphic-lib/src/types";
import React, { useCallback, useState } from "react";

import { useAppStorePick } from "../../lib/appStore";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import { GreyButton } from "../greyButtonStyle";
import { InlineDrawer } from "../inlineDrawer";
import { RecomputedRecentlyIcon } from "../recomputedRecently";
import UsersTableV2 from "../usersTableV2";
import {
  BROADCAST_STEPS,
  BroadcastState,
  BroadcastStateUpdater,
  BroadcastStep,
  BroadcastStepKey,
} from "./broadcastsShared";

const PREVIEW_HEIGHT = "40vh";

interface BroadcastLayoutProps {
  children: React.ReactNode;
  state: BroadcastState;
  updateState: BroadcastStateUpdater;
  sx?: SxProps<Theme>;
}

const PREVIEW_HEADER_HEIGHT = "48px";

function PreviewHeader({
  previewOpen,
  setPreviewOpen,
}: {
  previewOpen: boolean;
  setPreviewOpen: (open: boolean) => void;
}) {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      sx={{
        p: 1,
        borderBottom: 1,
        borderColor: "divider",
        backgroundColor: "background.paper",
        height: PREVIEW_HEADER_HEIGHT,
      }}
    >
      <Typography variant="h6">Broadcast Preview</Typography>
      <Stack direction="row" spacing={2} alignItems="center">
        <RecomputedRecentlyIcon />
        {previewOpen ? (
          <IconButton onClick={() => setPreviewOpen(false)} size="small">
            <KeyboardDoubleArrowDownRoundedIcon />
          </IconButton>
        ) : (
          <IconButton onClick={() => setPreviewOpen(true)} size="small">
            <KeyboardDoubleArrowUpRoundedIcon />
          </IconButton>
        )}
      </Stack>
    </Stack>
  );
}

function PreviewContent({
  workspaceId,
  id,
}: {
  workspaceId: string;
  id: string;
}) {
  const { data: broadcast, isLoading, isError } = useBroadcastQuery(id);
  if (isLoading || isError) {
    return null;
  }
  return (
    <Box sx={{ flex: 1, overflow: "auto" }}>
      <UsersTableV2
        workspaceId={workspaceId}
        hideControls
        segmentFilter={broadcast?.segmentId ? [broadcast.segmentId] : undefined}
        subscriptionGroupFilter={
          broadcast?.subscriptionGroupId
            ? [broadcast.subscriptionGroupId]
            : undefined
        }
      />
    </Box>
  );
}

export default function BroadcastLayout({
  children,
  state,
  updateState,
  sx,
}: BroadcastLayoutProps) {
  const { workspace } = useAppStorePick(["workspace"]);
  const [previewOpen, setPreviewOpen] = useState(true);
  const { data: broadcast } = useBroadcastQuery(state.id);
  const updateStep = useCallback(
    (step: BroadcastStepKey) => {
      updateState((draft) => {
        draft.step = step;
      });
    },
    [updateState],
  );
  const activeStepIndex: number = BROADCAST_STEPS.findIndex(
    (step) => step.key === state.step,
  );
  if (workspace.type !== CompletionStatus.Successful) {
    return null;
  }

  return (
    <Box
      sx={{ position: "relative", width: "100%", height: "100%" }}
      className="broadcast-layout"
    >
      <Stack
        sx={{ width: "100%", height: "100%", ...sx, flex: 1 }}
        className="broadcast-layout-content"
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          sx={{ width: "100%" }}
        >
          <Stepper
            sx={{
              minWidth: "720px",
              "& .MuiStepIcon-root.Mui-active": {
                color: "grey.600",
              },
            }}
            nonLinear
            activeStep={activeStepIndex === -1 ? 0 : activeStepIndex}
          >
            {BROADCAST_STEPS.map((step: BroadcastStep) => (
              <Step key={step.key}>
                <StepButton
                  color="inherit"
                  disabled={
                    !broadcast ||
                    (step.afterDraft && broadcast.status === "Draft")
                  }
                  onClick={() => {
                    updateStep(step.key);
                    if (step.key === "CONTENT") {
                      setPreviewOpen(false);
                    } else {
                      setPreviewOpen(true);
                    }
                  }}
                >
                  {step.name}
                </StepButton>
              </Step>
            ))}
          </Stepper>
          <Stack direction="row" spacing={2}>
            <GreyButton
              variant="contained"
              color="primary"
              onClick={() => setPreviewOpen(!previewOpen)}
            >
              Toggle Preview
            </GreyButton>
          </Stack>
        </Stack>
        <Box sx={{ pt: 3, pb: 1, pl: 2, flex: 1 }}>{children}</Box>
        <Box
          sx={{
            height: PREVIEW_HEADER_HEIGHT,
          }}
        />
      </Stack>
      <InlineDrawer
        open={previewOpen}
        maxHeight={PREVIEW_HEIGHT}
        header={
          <PreviewHeader
            previewOpen={previewOpen}
            setPreviewOpen={setPreviewOpen}
          />
        }
      >
        <PreviewContent workspaceId={workspace.value.id} id={state.id} />
      </InlineDrawer>
    </Box>
  );
}
