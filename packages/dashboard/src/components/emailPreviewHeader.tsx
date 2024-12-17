import { TextField, useTheme } from "@mui/material";
import escapeHTML from "escape-html";
import React from "react";

import { getDisabledInputStyles } from "./templateEditor";

interface EmailPreviewHeaderProps {
  email: string | undefined;
  from: string | undefined | null;
  subject: string | undefined | null;
}

function EmailPreviewHeader({ email, from, subject }: EmailPreviewHeaderProps) {
  const theme = useTheme();
  const disabledStyles = getDisabledInputStyles(theme);

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
    </>
  );
}

export default EmailPreviewHeader;
