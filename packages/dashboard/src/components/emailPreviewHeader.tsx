import { TextField, useTheme } from "@mui/material";
import escapeHTML from "escape-html";
import React from "react";

import { getDisabledInputStyles } from "./templateEditor";

interface EmailPreviewHeaderProps {
  email: string | undefined;
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
  const disabledStyles = getDisabledInputStyles(theme);

  return (
    <>
      <TextField
        required
        label="To"
        variant="filled"
        disabled
        sx={disabledStyles}
        value={escapeHTML(email ?? "")}
        slotProps={{
          input: {
            sx: {
              fontSize: ".75rem",
              borderTopLeftRadius: 0,
            },
          },
        }}
      />
      <TextField
        required
        label="From"
        variant="filled"
        disabled
        sx={disabledStyles}
        value={escapeHTML(from ?? "")}
        slotProps={{
          input: {
            sx: {
              fontSize: ".75rem",
              borderTopLeftRadius: 0,
            },
          },
        }}
      />
      <TextField
        required
        label="Subject"
        variant="filled"
        disabled
        sx={disabledStyles}
        value={escapeHTML(subject ?? "")}
        slotProps={{
          input: {
            sx: {
              fontSize: ".75rem",
              borderTopLeftRadius: 0,
            },
          },
        }}
      />
      <TextField
        label="Reply-To"
        variant="filled"
        disabled
        sx={disabledStyles}
        value={escapeHTML(replyTo ?? "")}
        slotProps={{
          input: {
            sx: {
              fontSize: ".75rem",
              borderTopLeftRadius: 0,
            },
          },
        }}
      />
    </>
  );
}

export default EmailPreviewHeader;
