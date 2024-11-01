import { Visibility, VisibilityOff } from "@mui/icons-material";
import { LoadingButton } from "@mui/lab";
import {
  Box,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
} from "@mui/material";
import { Parameters } from "@sinclair/typebox";
import {
  CompletionStatus,
  EmptyResponse,
  EphemeralRequestStatus,
  UpsertSecretRequest,
} from "isomorphic-lib/src/types";
import React, { ComponentProps, useCallback } from "react";
import { useImmer } from "use-immer";
import { Overwrite } from "utility-types";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../lib/appStore";
import SimpleTextField, { TEXT_FIELD_HEIGHT } from "./form/SimpleTextField";

export enum SecretStateType {
  Saved = "Saved",
  SavedEditing = "SavedEditing",
  UnSaved = "UnSaved",
}

export interface SavedSecretState {
  type: SecretStateType.Saved;
}

export interface SavedEditingSecretState {
  value: string;
  type: SecretStateType.SavedEditing;
}

export interface UnSavedSecretState {
  value: string;
  type: SecretStateType.UnSaved;
}

export type EditingSecretState =
  | SavedEditingSecretState
  | UnSavedSecretState
  | SavedSecretState;

export interface SecretState {
  showValue: boolean;
  updateRequest: EphemeralRequestStatus<Error>;
  editingState: EditingSecretState;
}

export function SecretButton(props: ComponentProps<typeof LoadingButton>) {
  return (
    <Box>
      <LoadingButton
        {...props}
        sx={{ height: `${TEXT_FIELD_HEIGHT + 2}rem` }}
      />
    </Box>
  );
}
export interface SecretEditorProps {
  // the name of the secret entry
  name: string;
  // the key within the secret config referenced by this component
  secretKey: string;
  // whether the secret is saved or not on page load. value is undefined while
  // loading
  saved?: boolean;
  // used to describe the secret in the UI
  label?: string;
  helperText?: string;
}

function initialState(saved: boolean): SecretState {
  return {
    showValue: false,
    updateRequest: {
      type: CompletionStatus.NotStarted,
    },
    editingState: saved
      ? { type: SecretStateType.Saved }
      : { type: SecretStateType.UnSaved, value: "" },
  };
}

function toggleVisibility(state: SecretState) {
  state.showValue = !state.showValue;
}

function disableSavedEditing(state: SecretState): SecretState {
  const newEditingState: SavedSecretState = {
    type: SecretStateType.Saved,
  };

  return {
    ...state,
    editingState: newEditingState,
  };
}

function SecretTextField({
  showValue,
  onVisibilityChange,
  autoFocus,
  onChange,
  helperText,
  label,
}: {
  autoFocus?: boolean;
  onVisibilityChange: () => void;
  showValue: boolean;
  label?: string;
  onChange: React.ComponentProps<typeof TextField>["onChange"];
  helperText?: string;
}) {
  return (
    <SimpleTextField
      autoFocus={autoFocus}
      type={showValue ? "text" : "password"}
      sx={{ flex: 1 }}
      label={label}
      onChange={onChange}
      helperText={helperText}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              aria-label="toggle secret visibility"
              onClick={onVisibilityChange}
              onMouseDown={onVisibilityChange}
            >
              {showValue ? <Visibility /> : <VisibilityOff />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
}

function setRequest(request: EphemeralRequestStatus<Error>) {
  return (state: SecretState) => {
    state.updateRequest = request;
  };
}

type HandleUpdate = (props: {
  key: string;
  value: string;
  request: EphemeralRequestStatus<Error>;
  setRequest: (request: EphemeralRequestStatus<Error>) => void;
  onResponse: () => void;
}) => void;

type HandleDelete = (props: {
  key: string;
  request: EphemeralRequestStatus<Error>;
  setRequest: (request: EphemeralRequestStatus<Error>) => void;
  onResponse: () => void;
}) => void;

interface SecretEditorUpdateProps {
  handleUpdate: HandleUpdate;
  handleDelete: HandleDelete;
}

export interface SecretEditorKeyedProps extends SecretEditorProps {
  // type of secret, passed in payload
  type: string;
}

function SecretEditorLoaded({
  name,
  saved,
  secretKey,
  label,
  helperText,
  handleDelete,
  handleUpdate,
}: Overwrite<SecretEditorProps, { saved: boolean }> & SecretEditorUpdateProps) {
  const { workspace: workspaceResult, patchSecretAvailability } =
    useAppStorePick(["workspace", "patchSecretAvailability"]);

  const [{ editingState, updateRequest, showValue }, setState] =
    useImmer<SecretState>(() => initialState(saved));

  if (workspaceResult.type !== CompletionStatus.Successful) {
    return null;
  }
  let field: React.ReactNode;
  switch (editingState.type) {
    case SecretStateType.Saved: {
      field = (
        <>
          <SimpleTextField
            disabled
            value="**********"
            sx={{ flex: 1 }}
            helperText={helperText}
            label={label}
          />
          <SecretButton
            onClick={() => {
              setState((draft) => {
                draft.editingState = {
                  type: SecretStateType.SavedEditing,
                  value: "",
                };
              });
            }}
          >
            Update
          </SecretButton>
          <SecretButton
            loading={updateRequest.type === CompletionStatus.InProgress}
            onClick={() =>
              handleDelete({
                key: secretKey,
                request: updateRequest,
                setRequest,
                onResponse: () => {
                  patchSecretAvailability({
                    workspaceId: workspaceResult.value.id,
                    name,
                    key: secretKey,
                    value: false,
                  });
                  setState((draft) => {
                    draft.editingState = {
                      type: SecretStateType.UnSaved,
                      value: "",
                    };
                  });
                },
              })
            }
          >
            Delete
          </SecretButton>
        </>
      );
      break;
    }
    case SecretStateType.SavedEditing: {
      field = (
        <>
          <SecretTextField
            helperText={helperText}
            label={label}
            onChange={(e) => {
              setState((draft) => {
                if (draft.editingState.type !== SecretStateType.SavedEditing) {
                  return;
                }

                draft.editingState.value = e.target.value;
              });
            }}
            onVisibilityChange={() => setState(toggleVisibility)}
            showValue={showValue}
          />
          <SecretButton
            onClick={() =>
              handleUpdate({
                key: secretKey,
                value: editingState.value,
                request: updateRequest,
                setRequest,
                onResponse: () => {
                  patchSecretAvailability({
                    workspaceId: workspaceResult.value.id,
                    name,
                    key: secretKey,
                    value: true,
                  });

                  setState((draft) => {
                    draft.editingState = {
                      type: SecretStateType.Saved,
                    };
                  });
                },
              })
            }
            loading={updateRequest.type === CompletionStatus.InProgress}
          >
            Save
          </SecretButton>
          <SecretButton onClick={() => setState(disableSavedEditing)}>
            Cancel
          </SecretButton>
        </>
      );
      break;
    }
    case SecretStateType.UnSaved: {
      field = (
        <>
          <SecretTextField
            label={label}
            helperText={helperText}
            onVisibilityChange={() => setState(toggleVisibility)}
            onChange={(e) => {
              setState((draft) => {
                if (draft.editingState.type !== SecretStateType.UnSaved) {
                  return;
                }

                draft.editingState.value = e.target.value;
              });
            }}
            showValue={showValue}
          />

          <SecretButton
            variant="contained"
            loading={updateRequest.type === CompletionStatus.InProgress}
            onClick={() =>
              handleUpdate({
                key: secretKey,
                value: editingState.value,
                request: updateRequest,
                setRequest,
                onResponse: () => {
                  patchSecretAvailability({
                    workspaceId: workspaceResult.value.id,
                    name,
                    key: secretKey,
                    value: true,
                  });
                  setState((draft) => {
                    draft.editingState = {
                      type: SecretStateType.Saved,
                    };
                  });
                },
              })
            }
          >
            Save
          </SecretButton>
        </>
      );
      break;
    }
  }

  return (
    <Stack
      direction="row"
      className="secret-editor"
      spacing={1}
      sx={{ width: "100%" }}
    >
      {field}
    </Stack>
  );
}

export function SecretEditorBase(
  props: SecretEditorProps & SecretEditorUpdateProps,
) {
  const { saved, label, helperText } = props;
  if (saved === undefined) {
    return (
      <Stack
        direction="row"
        className="secret-editor"
        spacing={1}
        sx={{ width: "100%" }}
      >
        <SimpleTextField
          disabled
          sx={{ flex: 1 }}
          helperText={helperText}
          label={label}
        />
        <SecretButton loading />
      </Stack>
    );
  }

  return <SecretEditorLoaded {...props} saved={saved} />;
}

/**
 * Edit a secret whose values are stored as a map of key-value pairs inside of
 * secret configValue json.
 * @param param0
 * @returns
 */
export function KeyedSecretEditor({
  name,
  label,
  type,
  ...rest
}: SecretEditorKeyedProps) {
  const { workspace: workspaceResult, apiBase } = useAppStorePick([
    "workspace",
    "apiBase",
  ]);

  const handleUpdate: HandleUpdate = useCallback(
    ({
      key,
      value,
      request,
      setRequest: setUpdateRequest,
      onResponse,
    }: Parameters<HandleUpdate>[0]) => {
      if (workspaceResult.type !== CompletionStatus.Successful) {
        return;
      }
      apiRequestHandlerFactory({
        request,
        setRequest: setUpdateRequest,
        responseSchema: EmptyResponse,
        onSuccessNotice: `Successfully saved ${label}`,
        onFailureNoticeHandler: () => `API Error: Failed to save ${label}`,
        setResponse: onResponse,
        requestConfig: {
          method: "PUT",
          url: `${apiBase}/api/secrets`,
          data: {
            workspaceId: workspaceResult.value.id,
            name,
            configValue: {
              type,
              [key]: value,
            },
          } satisfies UpsertSecretRequest,
          headers: {
            "Content-Type": "application/json",
          },
        },
      })();
    },
    [workspaceResult, label, apiBase, name, type],
  );

  const handleDelete: HandleDelete = useCallback(
    ({
      key,
      request,
      setRequest: setUpdateRequest,
      onResponse,
    }: Parameters<HandleDelete>[0]) => {
      if (workspaceResult.type !== CompletionStatus.Successful) {
        return;
      }
      apiRequestHandlerFactory({
        request,
        setRequest: setUpdateRequest,
        responseSchema: EmptyResponse,
        onSuccessNotice: `Successfully deleted ${label}`,
        onFailureNoticeHandler: () => `API Error: Failed to delete ${label}`,
        setResponse: onResponse,
        requestConfig: {
          method: "PUT",
          url: `${apiBase}/api/secrets`,
          data: {
            workspaceId: workspaceResult.value.id,
            name,
            configValue: {
              [key]: "",
            },
          } satisfies UpsertSecretRequest,
          headers: {
            "Content-Type": "application/json",
          },
        },
      })();
    },
    [workspaceResult, label, apiBase, name],
  );
  return (
    <SecretEditorBase
      handleUpdate={handleUpdate}
      handleDelete={handleDelete}
      label={label}
      name={name}
      {...rest}
    />
  );
}
