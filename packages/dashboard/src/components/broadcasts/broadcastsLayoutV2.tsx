import CloseIcon from "@mui/icons-material/Close";
import KeyboardDoubleArrowDownRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowDownRounded";
import KeyboardDoubleArrowUpRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowUpRounded";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { LoadingButton } from "@mui/lab";
import {
  SxProps,
  Theme,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import MobileStepper from "@mui/material/MobileStepper";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepButton from "@mui/material/StepButton";
import Stepper from "@mui/material/Stepper";
import { BroadcastStepKey, CompletionStatus } from "isomorphic-lib/src/types";
import React, { useCallback, useMemo, useState } from "react";

import { useAppStorePick } from "../../lib/appStore";
import { useBroadcastMutation } from "../../lib/useBroadcastMutation";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import { useCancelBroadcastMutation } from "../../lib/useCancelBroadcastMutation";
import { usePauseBroadcastMutation } from "../../lib/usePauseBroadcastMutation";
import { useResumeBroadcastMutation } from "../../lib/useResumeBroadcastMutation";
import { useStartBroadcastMutation } from "../../lib/useStartBroadcastMutation";
import { EditableTitle } from "../editableName/v2";
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
  const { mutate: cancelBroadcast, isPending: isCancelling } =
    useCancelBroadcastMutation();

  const isLoading = isStarting || isPausing || isResuming || isCancelling;

  const canStart = useMemo(() => {
    if (!broadcast || broadcast.status !== "Draft") {
      return false;
    }
    // Check required conditions from configuration
    return Boolean(
      broadcast.messageTemplateId && broadcast.subscriptionGroupId,
    );
  }, [broadcast]);

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
      case "Scheduled":
        cancelBroadcast({ broadcastId });
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
    cancelBroadcast,
  ]);

  const isDisabled = useMemo(() => {
    if (isLoading) return true;
    if (!broadcast) return true;

    switch (broadcast.status) {
      case "Draft":
        return !canStart;
      case "Running":
      case "Paused":
      case "Scheduled":
        return false;
      default:
        return true; // Disabled for Completed, Cancelled, Failed
    }
  }, [broadcast, canStart, isLoading]);

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
        return "Cancel Scheduled";
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
      case "Scheduled":
        return <CloseIcon />;
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
      size="small"
      startIcon={getIcon()}
      sx={{
        ...greyButtonStyle,
        textTransform: "none",
        whiteSpace: "nowrap",
        px: 1,
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
  // Switch to compact header earlier to avoid overlap.
  // Kicks in at <= 1200px (roughly when actions may collide with title).
  const useMobileStepper = useMediaQuery("(max-width:1200px)");
  const { workspace } = useAppStorePick(["workspace"]);
  const [previewOpen, setPreviewOpen] = useState(true);
  const { data: broadcast } = useBroadcastQuery(state.id);
  const { mutate: updateBroadcast } = useBroadcastMutation(state.id);
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

  const isDraft = broadcast?.status === "Draft";

  const isStepDisabled = useCallback(
    (step: BroadcastStep) => {
      return !broadcast || (step.afterDraft && isDraft);
    },
    [broadcast, isDraft],
  );

  const canGoToPrevious = useMemo(() => {
    if (activeStepIndex <= 0) return false;
    const previousStep = broadcastSteps[activeStepIndex - 1];
    return previousStep && !isStepDisabled(previousStep);
  }, [activeStepIndex, broadcastSteps, isStepDisabled]);

  const canGoToNext = useMemo(() => {
    if (activeStepIndex >= broadcastSteps.length - 1) return false;
    const nextStep = broadcastSteps[activeStepIndex + 1];
    return nextStep && !isStepDisabled(nextStep);
  }, [activeStepIndex, broadcastSteps, isStepDisabled]);

  const handlePrevious = useCallback(() => {
    if (canGoToPrevious && activeStepIndex > 0) {
      const previousStep = broadcastSteps[activeStepIndex - 1];
      if (previousStep) {
        updateStep(previousStep.key);
        if (previousStep.key === "CONTENT") {
          setPreviewOpen(false);
        } else {
          setPreviewOpen(true);
        }
      }
    }
  }, [canGoToPrevious, broadcastSteps, activeStepIndex, updateStep]);

  const handleNext = useCallback(() => {
    if (canGoToNext && activeStepIndex < broadcastSteps.length - 1) {
      const nextStep = broadcastSteps[activeStepIndex + 1];
      if (nextStep) {
        updateStep(nextStep.key);
        if (nextStep.key === "CONTENT") {
          setPreviewOpen(false);
        } else {
          setPreviewOpen(true);
        }
      }
    }
  }, [canGoToNext, broadcastSteps, activeStepIndex, updateStep]);

  if (workspace.type !== CompletionStatus.Successful) {
    return null;
  }
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
          sx={{ width: "100%", gap: 1 }}
        >
          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}
          >
            {useMobileStepper ? (
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ flexShrink: 0 }}
              >
                <GreyButton
                  onClick={handlePrevious}
                  disabled={!canGoToPrevious}
                  size="small"
                  startIcon={<NavigateBeforeIcon />}
                  sx={{ textTransform: "none", whiteSpace: "nowrap", px: 1 }}
                >
                  Prev
                </GreyButton>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
                    {`${Math.max(0, activeStepIndex) + 1} / ${broadcastSteps.length} · ${broadcastSteps[Math.max(0, activeStepIndex)]?.name ?? ""}`}
                  </Typography>
                  <MobileStepper
                    variant="dots"
                    position="static"
                    steps={broadcastSteps.length}
                    activeStep={Math.max(0, activeStepIndex)}
                    backButton={<span />}
                    nextButton={<span />}
                    sx={{ background: "transparent", p: 0 }}
                  />
                </Stack>
                <GreyButton
                  onClick={handleNext}
                  disabled={!canGoToNext}
                  size="small"
                  endIcon={<NavigateNextIcon />}
                  sx={{ textTransform: "none", whiteSpace: "nowrap", px: 1 }}
                >
                  Next
                </GreyButton>
              </Stack>
            ) : (
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ flexShrink: 0 }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <GreyButton
                    variant="contained"
                    onClick={handlePrevious}
                    disabled={!canGoToPrevious}
                    startIcon={<NavigateBeforeIcon />}
                    sx={{
                      textTransform: "none",
                      fontSize: "12px",
                      pl: 1,
                      pr: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Previous
                  </GreyButton>
                  <GreyButton
                    variant="contained"
                    onClick={handleNext}
                    disabled={!canGoToNext}
                    startIcon={<NavigateNextIcon />}
                    sx={{
                      textTransform: "none",
                      fontSize: "12px",
                      pl: 1,
                      pr: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Next
                  </GreyButton>
                </Stack>
                <Stepper
                  sx={{
                    minWidth: "640px",
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
                        disabled={isStepDisabled(step)}
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
              </Stack>
            )}
            {broadcast && (
              <Tooltip
                title={broadcast.name}
                enterDelay={400}
                arrow
                disableInteractive
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <EditableTitle
                    text={broadcast.name}
                    onSubmit={(val) => {
                      updateBroadcast({
                        name: val,
                      });
                    }}
                    // Keep title single-line and ellipsized
                    sx={{
                      ml: 1,
                      minWidth: 0,
                      maxWidth: { xs: 140, sm: 220, md: 300, lg: 420, xl: 560 },
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}
                    variant="singleLine"
                  />
                </span>
              </Tooltip>
            )}
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ flexShrink: 0 }}
          >
            <StatusButton broadcastId={state.id} />
            {!state.configuration?.hideDrawer && (
              <GreyButton
                variant="contained"
                color="primary"
                disabled={broadcast?.status !== "Draft"}
                onClick={() => setPreviewOpen(!previewOpen)}
                size="small"
                sx={{ whiteSpace: "nowrap", textTransform: "none", px: 1 }}
              >
                Toggle Preview
              </GreyButton>
            )}
          </Stack>
        </Stack>
        <Box
          sx={{
            pt: 3,
            pb: 1,
            pl: 2,
            flex: 1,
            // Allow children to manage their own scrolling without forcing
            // this container to expand beyond the viewport height.
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {children}
        </Box>
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
