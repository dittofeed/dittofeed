import { Visibility, VisibilityOff } from "@mui/icons-material";
import { LoadingButton } from "@mui/lab";
import { IconButton, InputAdornment, Stack, TextField } from "@mui/material";
import {
  CompletionStatus,
  EmptyResponse,
  EphemeralRequestStatus,
} from "isomorphic-lib/src/types";
import { useMemo, useState } from "react";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import apiRequestHandlerFactory from "./apiRequestHandlerFactory";
import { useAppStorePick } from "./appStore";

export const secretEditorStore = create(
  immer<{
    upsertSecretRequest: EphemeralRequestStatus<Error>;
    setUpsertSecretRequest: (
      upsertSecretRequest: EphemeralRequestStatus<Error>,
    ) => void;
  }>((set) => ({
    upsertSecretRequest: {
      type: CompletionStatus.NotStarted,
    },
    setUpsertSecretRequest: (upsertSecretRequest) =>
      set((state) => {
        state.upsertSecretRequest = upsertSecretRequest;
      }),
  })),
);

export const useSecretsEditor = ({ secretName }: { secretName: string }) => {
  const [showPassword, setShowPassword] = useState(false);
  const { secrets, apiBase, workspace, upsertSecrets } = useAppStorePick([
    "secrets",
    "apiBase",
    "workspace",
    "upsertSecrets",
  ]);
  const upsertSecretRequest = secretEditorStore(
    (state) => state.upsertSecretRequest,
  );
  const setUpsertSecretRequest = secretEditorStore(
    (state) => state.setUpsertSecretRequest,
  );
  const secret = useMemo(
    () => secrets.find((s) => s.name === secretName),
    [secrets, secretName],
  );
  const handleClickShowPassword = () => setShowPassword(!showPassword);
  const handleMouseDownPassword = () => setShowPassword(!showPassword);
  const [secretValue, setSecretValue] = useState(secret?.value ?? "");

  if (workspace.type !== CompletionStatus.Successful) {
    return null;
  }

  const secretApiHandler = apiRequestHandlerFactory({
    request: upsertSecretRequest,
    setRequest: setUpsertSecretRequest,
    responseSchema: EmptyResponse,
    setResponse: () => {
      upsertSecrets([
        {
          name: secretName,
          value: secretValue,
          workspaceId: workspace.value.id,
        },
      ]);
    },
    onSuccessNotice: `Updated secret ${secretName}.`,
    onFailureNoticeHandler: () =>
      `API Error: Failed to update secret ${secretName}.`,
    requestConfig: {
      method: "PUT",
      url: `${apiBase}/api/secrets`,
      data: {
        name: secretName,
        workspaceId: workspace.value.id,
        value: secretValue,
      },
    },
  });

  return {
    secretApiHandler,
    upsertSecretRequest,
    secretValue,
    setSecretValue,
    handleClickShowPassword,
    handleMouseDownPassword,
    showPassword,
  };
};

export default function SecretEditor({ secretName }: { secretName: string }) {
  const secretsEditor = useSecretsEditor({ secretName });
  if (!secretsEditor) return null;

  const {
    secretApiHandler,
    upsertSecretRequest,
    secretValue,
    showPassword,
    setSecretValue,
    handleClickShowPassword,
    handleMouseDownPassword,
  } = secretsEditor;

  return (
    <Stack direction="row" spacing={1}>
      <TextField
        label={secretName}
        variant="outlined"
        type={showPassword ? "text" : "password"}
        placeholder={showPassword ? undefined : "**********"}
        onChange={(e) => setSecretValue(e.target.value)}
        sx={{ flex: 1 }}
        value={secretValue}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label="toggle password visibility"
                onClick={handleClickShowPassword}
                onMouseDown={handleMouseDownPassword}
              >
                {showPassword ? <Visibility /> : <VisibilityOff />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      <LoadingButton
        variant="contained"
        disabled={secretValue === ""}
        loading={upsertSecretRequest.type === CompletionStatus.InProgress}
        onClick={secretApiHandler}
      >
        Save Change
      </LoadingButton>
    </Stack>
  );
}
