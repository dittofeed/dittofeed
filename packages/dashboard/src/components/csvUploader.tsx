import { Alert, Button, Stack, Typography } from "@mui/material";
import axios, { AxiosError } from "axios";
import { CsvUploadValidationError } from "isomorphic-lib/src/types";
import { enqueueSnackbar } from "notistack";
import React, { ChangeEvent, useState } from "react";

import { noticeAnchorOrigin } from "../lib/notices";

export function CsvUploader({
  submit,
  successMessage,
  errorMessage,
  disabled,
}: {
  submit: (values: { data: FormData }) => Promise<void>;
  successMessage: string;
  errorMessage: string;
  disabled?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [mainError, setMainError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<string[]>([]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files ? e.target.files[0] : null;
    setMainError(null);
    setRowErrors([]);

    if (uploadedFile) {
      setFile(uploadedFile);
    } else {
      setFile(null);
    }
  };

  const handleSubmit = () => {
    (async () => {
      if (!file) {
        return;
      }
      const formData = new FormData();
      formData.append("csv", file);
      try {
        await submit({ data: formData });
        setMainError(null);
        setRowErrors([]);

        enqueueSnackbar(successMessage, {
          variant: "success",
          autoHideDuration: 3000,
          anchorOrigin: noticeAnchorOrigin,
        });
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError<CsvUploadValidationError>;
          if (axiosError.response?.data && axiosError.response.status === 400) {
            setRowErrors(
              (axiosError.response.data.rowErrors ?? [])
                .slice(0, 3)
                .map((e) => `row ${e.row}: ${e.error}`),
            );
            setMainError(axiosError.response.data.message);
            return;
          }
        }
        enqueueSnackbar(errorMessage, {
          variant: "error",
          autoHideDuration: 3000,
          anchorOrigin: noticeAnchorOrigin,
        });
        // Unknown error
        console.error(error);
      }
    })();
  };

  return (
    <>
      <Stack
        direction="row"
        sx={{ alignItems: "center", width: "100%" }}
        spacing={3}
      >
        <Button variant="contained" component="label" disabled={disabled}>
          Choose CSV File
          <input accept=".csv" type="file" hidden onChange={handleFileChange} />
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={!file || disabled}
        >
          Upload
        </Button>
      </Stack>
      {file ? (
        <Typography sx={{ fontFamily: "monospace" }}>{file.name}</Typography>
      ) : null}
      <Stack spacing={1}>
        {mainError ? <Alert severity="error">{mainError}</Alert> : null}
        {rowErrors.map((e) => (
          <Alert severity="error" key={e}>
            {e}
          </Alert>
        ))}
      </Stack>
    </>
  );
}
