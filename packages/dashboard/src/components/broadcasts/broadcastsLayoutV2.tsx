import KeyboardDoubleArrowDownRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowDownRounded";
import KeyboardDoubleArrowUpRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowUpRounded";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepButton from "@mui/material/StepButton";
import Stepper from "@mui/material/Stepper";
import React, { useCallback, useState } from "react";

import { GreyButton } from "../greyButtonStyle";
import {
  BROADCAST_STEPS,
  BroadcastState,
  BroadcastStateUpdater,
  BroadcastStepKey,
} from "./broadcastsShared";

interface BroadcastLayoutProps {
  children: React.ReactNode;
  state: BroadcastState;
  updateState: BroadcastStateUpdater;
}

function PreviewHeader({
  previewOpen,
  setPreviewOpen,
}: {
  previewOpen: boolean;
  setPreviewOpen: (open: boolean) => void;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        p: 1,
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      {previewOpen ? (
        <IconButton onClick={() => setPreviewOpen(false)} size="small">
          <KeyboardDoubleArrowDownRoundedIcon />
        </IconButton>
      ) : (
        <IconButton onClick={() => setPreviewOpen(true)} size="small">
          <KeyboardDoubleArrowUpRoundedIcon />
        </IconButton>
      )}
    </Box>
  );
}

export default function BroadcastLayout({
  children,
  state,
  updateState,
}: BroadcastLayoutProps) {
  const [previewOpen, setPreviewOpen] = useState(true);

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

  return (
    <Stack sx={{ width: "100%", height: "100%" }}>
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
          {BROADCAST_STEPS.map((step) => (
            <Step key={step.key}>
              <StepButton color="inherit" onClick={() => updateStep(step.key)}>
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
      <Box sx={{ pt: 3, pb: 1, pl: 2 }}>{children}</Box>
      <Drawer
        anchor="bottom"
        open={!previewOpen}
        hideBackdrop
        sx={{
          pointerEvents: "none", // Make the modal container ignore clicks
        }}
        PaperProps={{
          sx: {
            pointerEvents: "auto",
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
          },
        }}
      >
        <PreviewHeader
          previewOpen={previewOpen}
          setPreviewOpen={setPreviewOpen}
        />
      </Drawer>
      <Drawer
        anchor="bottom"
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        hideBackdrop
        sx={{
          pointerEvents: "none", // Make the modal container ignore clicks
        }}
        PaperProps={{
          sx: {
            pointerEvents: "auto",
            height: "50vh",
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
          },
        }}
      >
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <PreviewHeader
            previewOpen={previewOpen}
            setPreviewOpen={setPreviewOpen}
          />
          <Box sx={{ p: 2, flex: 1, overflow: "auto" }}>drawer content</Box>
        </Box>
      </Drawer>
    </Stack>
  );
}
