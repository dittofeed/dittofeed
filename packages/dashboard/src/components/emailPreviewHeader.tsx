import { SxProps, TextField, Theme, useTheme } from "@mui/material";
import escapeHTML from "escape-html";
import React from "react";

interface EmailPreviewHeaderProps {
  email: string;
  from: string | undefined | null;
  subject: string | undefined | null;
  replyTo: string | undefined | null;
}

function EmailPreviewHeader({
  email,
  from,
  subject,
  replyTo,
}: EmailPreviewHeaderProps) {
  const theme = useTheme();
  const disabledStyles: SxProps<Theme> = {
    "& .MuiInputBase-input.Mui-disabled": {
      WebkitTextFillColor: theme.palette.grey[600],
      color: theme.palette.grey[600],
    },
    '& .MuiFormLabel-root[data-shrink="true"]': {
      color: theme.palette.grey[600],
    },
  };
  return (
    <>
      <TextField
        required
        label="To"
        variant="filled"
        disabled
        InputProps={{
          sx: {
            fontSize: ".75rem",
            borderTopLeftRadius: 0,
          },
        }}
        sx={disabledStyles}
        value={escapeHTML(email ?? "")}
      />
      <TextField
        required
        label="From"
        variant="filled"
        disabled
        InputProps={{
          sx: {
            fontSize: ".75rem",
            borderTopLeftRadius: 0,
          },
        }}
        sx={disabledStyles}
        value={escapeHTML(from ?? "")}
      />
      <TextField
        required
        label="Subject"
        variant="filled"
        disabled
        InputProps={{
          sx: {
            fontSize: ".75rem",
            borderTopLeftRadius: 0,
          },
        }}
        sx={disabledStyles}
        value={escapeHTML(subject ?? "")}
      />
      <TextField
        label="Reply-To"
        variant="filled"
        disabled
        InputProps={{
          sx: {
            fontSize: ".75rem",
            borderTopLeftRadius: 0,
          },
        }}
        sx={disabledStyles}
        value={escapeHTML(replyTo ?? "")}
      />
    </>
  );
}

export default EmailPreviewHeader;
