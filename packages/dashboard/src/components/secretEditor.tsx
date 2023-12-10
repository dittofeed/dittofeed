import { Visibility, VisibilityOff } from "@mui/icons-material";
import { LoadingButton } from "@mui/lab";
import {
  Button,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
} from "@mui/material";
import {
  CompletionStatus,
  EmptyResponse,
  EphemeralRequestStatus,
  UpsertSecretRequest,
} from "isomorphic-lib/src/types";
import { useImmer } from "use-immer";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../lib/appStore";

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

export interface SecretEditorProps {
  // the name of the secret config referenced by this component
  name: string;
  // the key within the secret config referenced by this component
  key: string;
  // whether the secret is saved or not on page load
  saved: boolean;
  // used to describe the secret in the UI
  title: string;
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
  onLeave,
  onVisibilityChange,
  autoFocus,
}: {
  autoFocus?: boolean;
  onVisibilityChange: () => void;
  onLeave?: () => void;
  showValue: boolean;
}) {
  return (
    <TextField
      autoFocus={autoFocus}
      type={showValue ? "text" : "password"}
      onBlur={() => {
        if (onLeave) {
          onLeave();
        }
      }}
      onKeyUp={(e) => {
        if (onLeave && (e.key === "Enter" || e.key === "Escape")) {
          onLeave();
        }
      }}
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

// function generateHandler({config, onComplete, updateRequest}: {config: Record<string, string>, onComplete: () => void, updateRequest: EphemeralRequestStatus<Error>}) {
//   return apiRequestHandlerFactory({
//         request: updateRequest,
//         setRequest: (request) => setState(setRequest(request)),
//         responseSchema: EmptyResponse,
//         setResponse: () => {
//           setState((draft) => {
//             draft.editingState = {
//               type: SecretStateType.UnSaved,
//               value: "",
//             };
//           });
//         },
//         requestConfig: {
//           method: "PUT",
//           url: `${apiBase}/api/secrets`,
//           data: {
//             [key]: "",
//           },
//           headers: {
//             "Content-Type": "application/json",
//           },
//         },
//       }

// }

export default function SecretEditor({
  name,
  saved,
  key,
  title,
}: SecretEditorProps) {
  const { workspace: workspaceResult, apiBase } = useAppStorePick([
    "workspace",
    "apiBase",
  ]);

  const [{ editingState, updateRequest, showValue }, setState] =
    useImmer<SecretState>(() => initialState(saved));

  if (workspaceResult.type !== CompletionStatus.Successful) {
    return null;
  }
  let field: React.ReactNode;
  switch (editingState.type) {
    case SecretStateType.Saved: {
      const deleteHandler = apiRequestHandlerFactory({
        request: updateRequest,
        setRequest: (request) => setState(setRequest(request)),
        responseSchema: EmptyResponse,
        onSuccessNotice: `Successfully deleted ${title}`,
        setResponse: () => {
          setState((draft) => {
            draft.editingState = {
              type: SecretStateType.UnSaved,
              value: "",
            };
          });
        },
        onFailureNoticeHandler: () => `API Error: Failed to update ${title}`,
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
      });

      field = (
        <Stack direction="row" alignItems="center" spacing={1}>
          <TextField disabled placeholder="**********" />
          <Button
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
          </Button>
          <LoadingButton
            loading={updateRequest.type === CompletionStatus.InProgress}
            onClick={deleteHandler}
          >
            Delete
          </LoadingButton>
        </Stack>
      );
      break;
    }
    case SecretStateType.SavedEditing: {
      const updateHandler = apiRequestHandlerFactory({
        request: updateRequest,
        setRequest: (request) => setState(setRequest(request)),
        responseSchema: EmptyResponse,
        onSuccessNotice: `Successfully updated ${title}`,
        onFailureNoticeHandler: () => `API Error: Failed to update ${title}`,
        setResponse: () => {
          setState((draft) => {
            draft.editingState = {
              type: SecretStateType.Saved,
            };
          });
        },
        requestConfig: {
          method: "PUT",
          url: `${apiBase}/api/secrets`,
          data: {
            workspaceId: workspaceResult.value.id,
            name,
            configValue: {
              [key]: editingState.value,
            },
          } satisfies UpsertSecretRequest,
          headers: {
            "Content-Type": "application/json",
          },
        },
      });
      field = (
        <Stack direction="row" alignItems="center" spacing={1}>
          <SecretTextField
            onVisibilityChange={() => setState(toggleVisibility)}
            showValue={showValue}
            onLeave={() => setState(disableSavedEditing)}
          />
          <LoadingButton
            loading={updateRequest.type === CompletionStatus.InProgress}
            onClick={updateHandler}
          >
            Save
          </LoadingButton>
          <Button onClick={() => setState(disableSavedEditing)}>Cancel</Button>
        </Stack>
      );
      break;
    }
    case SecretStateType.UnSaved: {
      const updateHandler = apiRequestHandlerFactory({
        request: updateRequest,
        setRequest: (request) => setState(setRequest(request)),
        responseSchema: EmptyResponse,
        onSuccessNotice: `Successfully updated ${title}`,
        onFailureNoticeHandler: () => `API Error: Failed to update ${title}`,
        setResponse: () => {
          setState((draft) => {
            draft.editingState = {
              type: SecretStateType.Saved,
            };
          });
        },
        requestConfig: {
          method: "PUT",
          url: `${apiBase}/api/secrets`,
          data: {
            workspaceId: workspaceResult.value.id,
            name,
            configValue: {
              [key]: editingState.value,
            },
          } satisfies UpsertSecretRequest,
          headers: {
            "Content-Type": "application/json",
          },
        },
      });
      field = (
        <Stack direction="row" alignItems="center" spacing={1}>
          <SecretTextField
            onVisibilityChange={() => setState(toggleVisibility)}
            showValue={showValue}
          />
          <LoadingButton
            loading={updateRequest.type === CompletionStatus.InProgress}
            onClick={updateHandler}
          >
            Save
          </LoadingButton>
        </Stack>
      );
      break;
    }
  }

  return field;
}
