import React, { useState, useCallback } from "react";
import {
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  Typography,
  Paper,
  Tooltip,
  Alert,
} from "@mui/material";
import { Add as AddIcon, Delete as DeleteIcon } from "@mui/icons-material";

export interface EmailHeader {
  name: string;
  value: string;
}

export interface EmailCustomHeadersProps {
  headers: EmailHeader[];
  onChange: (headers: EmailHeader[]) => void;
  disabled?: boolean;
}

const COMMON_HEADERS = [
  { name: "X-PM-Message-Stream", description: "Postmark message stream (e.g., 'broadcast')" },
  { name: "X-Priority", description: "Email priority (1=high, 3=normal, 5=low)" },
  { name: "X-Mailer", description: "Custom mailer identifier" },
  { name: "List-Unsubscribe", description: "Unsubscribe URL" },
];

function validateHeaderName(name: string): string | null {
  if (!name) return "Header name is required";
  if (/[\s:]/.test(name)) return "Header name cannot contain spaces or colons";
  if (!/^[\x21-\x39\x3B-\x7E]+$/.test(name)) return "Header name contains invalid characters";
  return null;
}

function validateHeaderValue(value: string): string | null {
  if (/[\r\n]/.test(value)) return "Header value cannot contain line breaks";
  return null;
}

export function EmailCustomHeaders({
  headers,
  onChange,
  disabled = false,
}: EmailCustomHeadersProps) {
  const [errors, setErrors] = useState<Record<number, { name?: string; value?: string }>>({});

  const addHeader = useCallback(() => {
    onChange([...headers, { name: "", value: "" }]);
  }, [headers, onChange]);

  const removeHeader = useCallback(
    (index: number) => {
      const newHeaders = headers.filter((_, i) => i !== index);
      onChange(newHeaders);
      // Clean up errors
      const newErrors = { ...errors };
      delete newErrors[index];
      setErrors(newErrors);
    },
    [headers, onChange, errors]
  );

  const updateHeader = useCallback(
    (index: number, field: "name" | "value", val: string) => {
      const newHeaders = headers.map((h, i) =>
        i === index ? { ...h, [field]: val } : h
      );
      onChange(newHeaders);

      // Validate
      const newErrors = { ...errors };
      if (!newErrors[index]) newErrors[index] = {};
      if (field === "name") {
        const error = validateHeaderName(val);
        if (error) {
          newErrors[index].name = error;
        } else {
          delete newErrors[index].name;
        }
      } else {
        const error = validateHeaderValue(val);
        if (error) {
          newErrors[index].value = error;
        } else {
          delete newErrors[index].value;
        }
      }
      setErrors(newErrors);
    },
    [headers, onChange, errors]
  );

  const addCommonHeader = useCallback(
    (headerName: string) => {
      onChange([...headers, { name: headerName, value: "" }]);
    },
    [headers, onChange]
  );

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Custom Email Headers
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Add custom headers to your email. Useful for provider-specific features like
        Postmark message streams.
      </Typography>

      {headers.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No custom headers configured. Click "Add Header" to add one, or select
          from common headers below.
        </Alert>
      )}

      <Stack spacing={2}>
        {headers.map((header, index) => (
          <Stack key={index} direction="row" spacing={1} alignItems="flex-start">
            <TextField
              label="Header Name"
              value={header.name}
              onChange={(e) => updateHeader(index, "name", e.target.value)}
              size="small"
              disabled={disabled}
              error={!!errors[index]?.name}
              helperText={errors[index]?.name}
              placeholder="X-Custom-Header"
              sx={{ flex: 1 }}
            />
            <TextField
              label="Header Value"
              value={header.value}
              onChange={(e) => updateHeader(index, "value", e.target.value)}
              size="small"
              disabled={disabled}
              error={!!errors[index]?.value}
              helperText={errors[index]?.value}
              placeholder="header-value"
              sx={{ flex: 1 }}
            />
            <IconButton
              onClick={() => removeHeader(index)}
              disabled={disabled}
              size="small"
              color="error"
              aria-label="Remove header"
            >
              <DeleteIcon />
            </IconButton>
          </Stack>
        ))}
      </Stack>

      <Box sx={{ mt: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button
          startIcon={<AddIcon />}
          onClick={addHeader}
          disabled={disabled}
          size="small"
          variant="outlined"
        >
          Add Header
        </Button>
      </Box>

      {headers.length === 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Common headers:
          </Typography>
          <Box sx={{ mt: 0.5, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {COMMON_HEADERS.map((ch) => (
              <Tooltip key={ch.name} title={ch.description}>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => addCommonHeader(ch.name)}
                  disabled={disabled}
                  sx={{ textTransform: "none", fontSize: "0.75rem" }}
                >
                  + {ch.name}
                </Button>
              </Tooltip>
            ))}
          </Box>
        </Box>
      )}
    </Paper>
  );
}

export default EmailCustomHeaders;
