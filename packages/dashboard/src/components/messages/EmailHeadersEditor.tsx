import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  IconButton,
  TextField,
  Typography,
  Stack,
  Tooltip,
  Alert,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import {
  EmailHeaderEntry,
  emailHeadersToRecord,
  recordToEmailHeaderEntries,
  validateHeaderName,
  validateHeaderValue,
  EmailHeaders,
} from 'isomorphic-lib/src/types/emailHeaders';

interface EmailHeadersEditorProps {
  headers?: EmailHeaders;
  onChange: (headers: EmailHeaders) => void;
  disabled?: boolean;
}

export default function EmailHeadersEditor({
  headers,
  onChange,
  disabled = false,
}: EmailHeadersEditorProps) {
  const [entries, setEntries] = useState<EmailHeaderEntry[]>(
    headers ? recordToEmailHeaderEntries(headers) : []
  );
  const [errors, setErrors] = useState<Record<number, string>>({});

  const validateAndUpdate = useCallback(
    (newEntries: EmailHeaderEntry[]) => {
      const newErrors: Record<number, string> = {};

      for (let i = 0; i < newEntries.length; i++) {
        const entry = newEntries[i];
        if (entry.name && !validateHeaderName(entry.name)) {
          newErrors[i] = 'Invalid header name';
        } else if (entry.value && !validateHeaderValue(entry.value)) {
          newErrors[i] = 'Invalid header value';
        }
      }

      setErrors(newErrors);
      setEntries(newEntries);

      if (Object.keys(newErrors).length === 0) {
        const validEntries = newEntries.filter((e) => e.name.trim());
        onChange(emailHeadersToRecord(validEntries));
      }
    },
    [onChange]
  );

  const addEntry = useCallback(() => {
    validateAndUpdate([...entries, { name: '', value: '' }]);
  }, [entries, validateAndUpdate]);

  const removeEntry = useCallback(
    (index: number) => {
      const newEntries = entries.filter((_, i) => i !== index);
      validateAndUpdate(newEntries);
    },
    [entries, validateAndUpdate]
  );

  const updateEntry = useCallback(
    (index: number, field: 'name' | 'value', val: string) => {
      const newEntries = [...entries];
      newEntries[index] = { ...newEntries[index], [field]: val };
      validateAndUpdate(newEntries);
    },
    [entries, validateAndUpdate]
  );

  return (
    <Box sx={{ mt: 2, mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Custom Email Headers
      </Typography>
      <Alert severity="info" sx={{ mb: 1 }}>
        Add custom headers like <code>X-PM-Message-Stream: broadcast</code> for
        Postmark or other provider-specific headers.
      </Alert>
      <Stack spacing={1}>
        {entries.map((entry, index) => (
          <Stack key={index} direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              label="Header Name"
              placeholder="X-PM-Message-Stream"
              value={entry.name}
              onChange={(e) => updateEntry(index, 'name', e.target.value)}
              error={!!errors[index]}
              helperText={errors[index]}
              disabled={disabled}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="Header Value"
              placeholder="broadcast"
              value={entry.value}
              onChange={(e) => updateEntry(index, 'value', e.target.value)}
              disabled={disabled}
              sx={{ flex: 1 }}
            />
            <Tooltip title="Remove header">
              <IconButton
                onClick={() => removeEntry(index)}
                disabled={disabled}
                size="small"
                color="error"
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        ))}
      </Stack>
      <Button
        startIcon={<AddIcon />}
        onClick={addEntry}
        disabled={disabled}
        size="small"
        sx={{ mt: 1 }}
      >
        Add Header
      </Button>
    </Box>
  );
}
