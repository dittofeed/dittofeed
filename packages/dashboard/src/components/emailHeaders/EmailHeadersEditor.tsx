import React, { useState, useCallback } from "react";
import {
  Box,
  Button,
  IconButton,
  TextField,
  Typography,
  Stack,
  Paper,
  Tooltip,
} from "@mui/material";
import { Add as AddIcon, Delete as DeleteIcon } from "@mui/icons-material";
import { EmailHeader, validateHeaderName, validateHeaderValue } from "isomorphic-lib/src/emailHeaders";

interface EmailHeadersEditorProps {
  headers: EmailHeader[];
  onChange: (headers: EmailHeader[]) => void;
  disabled?: boolean;
}

export function EmailHeadersEditor({
  headers,
  onChange,
  disabled = false,
}: EmailHeadersEditorProps) {
  const [errors, setErrors] = useState<Record<number, string>>({});

  const handleAdd = useCallback(() => {
    onChange([...headers, { name: "", value: "" }]);
  }, [headers, onChange]);

  const handleRemove = useCallback(
    (index: number) => {
      const updated = headers.filter((_, i) => i !== index);
      onChange(updated);
      const newErrors = { ...errors };
      delete newErrors[index];
      setErrors(newErrors);
    },
    [headers, onChange, errors]
  );

  const handleChange = useCallback(
    (index: number, field: "name" | "value", val: string) => {
      const updated = headers.map((h, i) =>
        i === index ? { ...h, [field]: val } : h
      );
      onChange(updated);

      const newErrors = { ...errors };
      if (field === "name" && val && !validateHeaderName(val)) {
        newErrors[index] = "Invalid header name";
      } else if (field === "value" && val && !validateHeaderValue(val)) {
        newErrors[index] = "Invalid header value";
      } else {
        delete newErrors[index];
      }
      setErrors(newErrors);
    },
    [headers, onChange, errors]
  );

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
      <Stack spacing={2}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2">
            Custom Email Headers
          </Typography>
          <Tooltip title="Add headers like X-PM-Message-Stream for Postmark channel selection">
            <span>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={handleAdd}
                disabled={disabled}
              >
                Add Header
              </Button>
            </span>
          </Tooltip>
        </Box>

        {headers.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No custom headers configured. Add headers to customize email delivery
            (e.g., X-PM-Message-Stream for Postmark).
          </Typography>
        )}

        {headers.map((header, index) => (
          <Box key={index} display="flex" gap={1} alignItems="flex-start">
            <TextField
              label="Header Name"
              placeholder="X-PM-Message-Stream"
              size="small"
              value={header.name}
              onChange={(e) => handleChange(index, "name", e.target.value)}
              error={!!errors[index]}
              helperText={errors[index]}
              disabled={disabled}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Header Value"
              placeholder="broadcast"
              size="small"
              value={header.value}
              onChange={(e) => handleChange(index, "value", e.target.value)}
              disabled={disabled}
              sx={{ flex: 1 }}
            />
            <IconButton
              size="small"
              onClick={() => handleRemove(index)}
              disabled={disabled}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

export default EmailHeadersEditor;
