import KeyboardDoubleArrowDownRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowDownRounded";
import KeyboardDoubleArrowUpRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowUpRounded";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { LoadingButton } from "@mui/lab";
import { SxProps, Theme, Typography } from "@mui/material";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepButton from "@mui/material/StepButton";
import Stepper from "@mui/material/Stepper";
import { BroadcastStepKey, CompletionStatus } from "isomorphic-lib/src/types";
import React, { useCallback, useMemo, useState } from "react";

import { useAppStorePick } from "../../lib/appStore";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import { usePauseBroadcastMutation } from "../../lib/usePauseBroadcastMutation";
import { useResumeBroadcastMutation } from "../../lib/useResumeBroadcastMutation";
import { useStartBroadcastMutation } from "../../lib/useStartBroadcastMutation";
import { GreyButton, greyButtonStyle } from "../greyButtonStyle";
import { InlineDrawer } from "../inlineDrawer";
import { RecomputedRecentlyIcon } from "../recomputedRecently";
import UsersTableV2 from "../usersTableV2";
import {
  BroadcastState,
  BroadcastStateUpdater,
  BroadcastStep,
  useBroadcastSteps,
} from "./broadcastsShared";

const PREVIEW_HEIGHT = "440px";

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

function PreviewContent({ id }: { id: string }) {
  const { data: broadcast, isLoading, isError } = useBroadcastQuery(id);
  if (isLoading || isError) {
    return null;
  }
  return (
    <Box sx={{ flex: 1, overflow: "auto" }}>
      <UsersTableV2
        hideControls
        limit={5}
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

function StatusButton({ broadcastId }: { broadcastId: string }) {
  const { data: broadcast } = useBroadcastQuery(broadcastId);
  const { mutate: startBroadcast, isPending: isStarting } =
    useStartBroadcastMutation();
  const { mutate: pauseBroadcast, isPending: isPausing } =
    usePauseBroadcastMutation();
  const { mutate: resumeBroadcast, isPending: isResuming } =
    useResumeBroadcastMutation();

  const isLoading = isStarting || isPausing || isResuming;

  const canStart = useMemo(() => {
    if (!broadcast || broadcast.status !== "Draft") {
      return false;
    }
    // Check required conditions from configuration
    return Boolean(
      broadcast.messageTemplateId && broadcast.subscriptionGroupId,
    );
  }, [broadcast]);

  const isDisabled = useMemo(() => {
    if (isLoading) return true;
    if (!broadcast) return true;

    switch (broadcast.status) {
      case "Draft":
        return !canStart;
      case "Running":
      case "Paused":
        return false;
      default:
        return true; // Disabled for Scheduled, Completed, Cancelled, Failed
    }
  }, [broadcast, canStart, isLoading]);

  const handleClick = useCallback(() => {
    if (!broadcast) return;

    switch (broadcast.status) {
      case "Draft":
        if (canStart) {
          startBroadcast({ broadcastId });
        }
        break;
      case "Running":
        pauseBroadcast({ broadcastId });
        break;
      case "Paused":
        resumeBroadcast({ broadcastId });
        break;
      default:
        // Do nothing for other statuses
        break;
    }
  }, [
    broadcast,
    broadcastId,
    canStart,
    startBroadcast,
    pauseBroadcast,
    resumeBroadcast,
  ]);

  if (!broadcast) {
    return null;
  }

  const getButtonText = () => {
    switch (broadcast.status) {
      case "Draft":
        return "Start Broadcast";
      case "Running":
        return "Pause";
      case "Paused":
        return "Resume";
      case "Scheduled":
        return "Scheduled";
      case "Completed":
        return "Completed";
      case "Cancelled":
        return "Cancelled";
      case "Failed":
        return "Failed";
      default:
        return broadcast.status;
    }
  };

  const getIcon = () => {
    switch (broadcast.status) {
      case "Draft":
      case "Paused":
        return <PlayArrowIcon />;
      case "Running":
        return <PauseIcon />;
      default:
        return null;
    }
  };

  return (
    <LoadingButton
      variant="contained"
      onClick={handleClick}
      disabled={isDisabled}
      loading={isLoading}
      startIcon={getIcon()}
      sx={{
        ...greyButtonStyle,
        textTransform: "none",
      }}
    >
      {getButtonText()}
    </LoadingButton>
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
  const broadcastSteps = useBroadcastSteps(state.configuration?.stepsAllowList);

  const activeStepIndex: number = broadcastSteps.findIndex(
    (step) => step.key === state.step,
  );
  if (workspace.type !== CompletionStatus.Successful) {
    return null;
  }
  const isDraft = broadcast?.status === "Draft";
  const hasDrawer = !state.configuration?.hideDrawer && isDraft;

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
            {broadcastSteps.map((step: BroadcastStep) => (
              <Step key={step.key}>
                <StepButton
                  color="inherit"
                  disabled={!broadcast || (step.afterDraft && isDraft)}
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
            <StatusButton broadcastId={state.id} />
            {!state.configuration?.hideDrawer && (
              <GreyButton
                variant="contained"
                color="primary"
                disabled={broadcast?.status !== "Draft"}
                onClick={() => setPreviewOpen(!previewOpen)}
              >
                Toggle Preview
              </GreyButton>
            )}
          </Stack>
        </Stack>
        <Box sx={{ pt: 3, pb: 1, pl: 2, flex: 1 }}>{children}</Box>
        {hasDrawer && (
          <Box
            sx={{
              height: PREVIEW_HEADER_HEIGHT,
            }}
          />
        )}
      </Stack>
      {hasDrawer && (
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
          <PreviewContent id={state.id} />
        </InlineDrawer>
      )}
    </Box>
  );
}
