import React, { useState, useCallback } from "react";
import {
  Box,
  Button,
  IconButton,
  TextField,
  Typography,
  Alert,
  Paper,
  Stack,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { EmailHeader, validateHeaders, BLOCKED_HEADER_NAMES } from "isomorphic-lib/src/types/emailHeaders";

interface EmailHeadersEditorProps {
  headers: EmailHeader[];
  onChange: (headers: EmailHeader[]) => void;
  disabled?: boolean;
}

/**
 * A component for editing custom email headers in the Dittofeed dashboard.
 * Allows users to add headers like X-PM-Message-Stream for Postmark integration.
 */
export function EmailHeadersEditor({
  headers,
  onChange,
  disabled = false,
}: EmailHeadersEditorProps) {
  const [errors, setErrors] = useState<string[]>([]);

  const handleAddHeader = useCallback(() => {
    onChange([...headers, { name: "", value: "" }]);
  }, [headers, onChange]);

  const handleRemoveHeader = useCallback(
    (index: number) => {
      const newHeaders = headers.filter((_, i) => i !== index);
      onChange(newHeaders);
      // Re-validate
      const validation = validateHeaders(newHeaders);
      setErrors(validation.errors);
    },
    [headers, onChange]
  );

  const handleChangeHeader = useCallback(
    (index: number, field: "name" | "value", value: string) => {
      const newHeaders = [...headers];
      newHeaders[index] = { ...newHeaders[index], [field]: value };
      onChange(newHeaders);
      // Validate on change
      const validation = validateHeaders(newHeaders.filter((h) => h.name));
      setErrors(validation.errors);
    },
    [headers, onChange]
  );

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
      <Stack spacing={2}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2">
            Custom Email Headers
          </Typography>
          <Tooltip title="Add custom header (e.g., X-PM-Message-Stream for Postmark)">
            <span>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={handleAddHeader}
                disabled={disabled || headers.length >= 50}
              >
                Add Header
              </Button>
            </span>
          </Tooltip>
        </Box>

        {headers.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No custom headers configured. Add headers like{" "}
            <code>X-PM-Message-Stream: broadcast</code> for Postmark or other
            provider-specific headers.
          </Typography>
        )}

        {headers.map((header, index) => (
          <Box
            key={index}
            display="flex"
            gap={1}
            alignItems="flex-start"
          >
            <TextField
              label="Header Name"
              placeholder="X-PM-Message-Stream"
              value={header.name}
              onChange={(e) =>
                handleChangeHeader(index, "name", e.target.value)
              }
              size="small"
              disabled={disabled}
              error={
                !!header.name &&
                BLOCKED_HEADER_NAMES.has(header.name.toLowerCase())
              }
              helperText={
                header.name &&
                BLOCKED_HEADER_NAMES.has(header.name.toLowerCase())
                  ? "This header name is not allowed"
                  : undefined
              }
              sx={{ flex: 1 }}
            />
            <TextField
              label="Header Value"
              placeholder="broadcast"
              value={header.value}
              onChange={(e) =>
                handleChangeHeader(index, "value", e.target.value)
              }
              size="small"
              disabled={disabled}
              sx={{ flex: 1 }}
            />
            <IconButton
              onClick={() => handleRemoveHeader(index)}
              disabled={disabled}
              size="small"
              color="error"
              aria-label="Remove header"
            >
              <DeleteIcon />
            </IconButton>
          </Box>
        ))}

        {errors.length > 0 && (
          <Alert severity="error">
            {errors.map((error, i) => (
              <div key={i}>{error}</div>
            ))}
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}

export default EmailHeadersEditor;
