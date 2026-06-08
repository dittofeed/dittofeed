import React, { useCallback } from "react";
import {
  Box,
  Button,
  IconButton,
  TextField,
  Typography,
  Paper,
  Stack,
  Tooltip,
  Alert,
} from "@mui/material";
import { Add as AddIcon, Delete as DeleteIcon } from "@mui/icons-material";
import { CustomEmailHeader, CustomEmailHeaders, CustomEmailHeaderSchema } from "@dittofeed/isomorphic-lib/src/emailHeaders";

interface CustomHeadersEditorProps {
  headers: CustomEmailHeaders;
  onChange: (headers: CustomEmailHeaders) => void;
  disabled?: boolean;
}

export default function CustomHeadersEditor({
  headers,
  onChange,
  disabled = false,
}: CustomHeadersEditorProps) {
  const handleAddHeader = useCallback(() => {
    onChange([...headers, { name: "X-", value: "" }]);
  }, [headers, onChange]);

  const handleRemoveHeader = useCallback(
    (index: number) => {
      const newHeaders = headers.filter((_, i) => i !== index);
      onChange(newHeaders);
    },
    [headers, onChange]
  );

  const handleHeaderChange = useCallback(
    (index: number, field: keyof CustomEmailHeader, value: string) => {
      const newHeaders = [...headers];
      newHeaders[index] = { ...newHeaders[index], [field]: value };
      onChange(newHeaders);
    },
    [headers, onChange]
  );

  const getHeaderValidationError = (header: CustomEmailHeader): string | null => {
    const result = CustomEmailHeaderSchema.safeParse(header);
    if (result.success) return null;
    return result.error.issues[0]?.message || "Invalid header";
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2">
            Custom Email Headers
          </Typography>
          <Tooltip title="Add custom header">
            <span>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={handleAddHeader}
                disabled={disabled || headers.length >= 20}
                variant="outlined"
              >
                Add Header
              </Button>
            </span>
          </Tooltip>
        </Box>

        {headers.length === 0 && (
          <Alert severity="info" variant="outlined">
            No custom headers configured. Custom headers allow you to set
            provider-specific options like Postmark&apos;s{" "}
            <code>X-PM-Message-Stream</code> for selecting message streams.
          </Alert>
        )}

        {headers.map((header, index) => {
          const error = getHeaderValidationError(header);
          return (
            <Box
              key={index}
              display="flex"
              gap={1}
              alignItems="flex-start"
            >
              <TextField
                label="Header Name"
                value={header.name}
                onChange={(e) =>
                  handleHeaderChange(index, "name", e.target.value)
                }
                placeholder="X-PM-Message-Stream"
                size="small"
                disabled={disabled}
                error={!!error && header.name.length > 0}
                helperText={
                  error && header.name.length > 2 ? error : "Must start with X-"
                }
                sx={{ flex: 1 }}
              />
              <TextField
                label="Header Value"
                value={header.value}
                onChange={(e) =>
                  handleHeaderChange(index, "value", e.target.value)
                }
                placeholder="broadcast"
                size="small"
                disabled={disabled}
                sx={{ flex: 1 }}
              />
              <IconButton
                onClick={() => handleRemoveHeader(index)}
                disabled={disabled}
                color="error"
                size="small"
                sx={{ mt: 0.5 }}
              >
                <DeleteIcon />
              </IconButton>
            </Box>
          );
        })}

        {headers.length >= 20 && (
          <Alert severity="warning" variant="outlined">
            Maximum of 20 custom headers reached.
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
