import { ContentCopyOutlined } from "@mui/icons-material";
import { IconButton, InputAdornment } from "@mui/material";
import { enqueueSnackbar } from "notistack";
import React from "react";

import { noticeAnchorOrigin } from "./notices";

export async function copyToClipboard({
  value,
  successNotice,
  failureNotice,
}: {
  successNotice: string;
  failureNotice: string;
  value: string;
}) {
  try {
    await navigator.clipboard.writeText(value);
    enqueueSnackbar(successNotice, {
      variant: "success",
      autoHideDuration: 1000,
      anchorOrigin: noticeAnchorOrigin,
    });
  } catch (err) {
    enqueueSnackbar(failureNotice, {
      variant: "error",
      autoHideDuration: 1000,
      anchorOrigin: noticeAnchorOrigin,
    });
  }
}

export const COPY_INPUT_PROPS = {
  endAdornment: {},
};

export function copyInputProps({
  value,
  successNotice,
  failureNotice,
}: {
  value: string;
  successNotice: string;
  failureNotice: string;
}) {
  return {
    endAdornment: (
      <InputAdornment position="end">
        <IconButton
          color="primary"
          onClick={() =>
            copyToClipboard({
              value,
              successNotice,
              failureNotice,
            })
          }
        >
          <ContentCopyOutlined />
        </IconButton>
      </InputAdornment>
    ),
  };
}
