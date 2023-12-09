import { Visibility, VisibilityOff } from "@mui/icons-material";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import {
  CompletionStatus,
  EphemeralRequestStatus,
} from "isomorphic-lib/src/types";
import { useImmer } from "use-immer";

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
  name: string;
  key: string;
  saved: boolean;
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

function SecretTextField({
  onVisibilityChange,
  showValue,
}: {
  onVisibilityChange: () => void;
  showValue: boolean;
}) {
  return (
    <TextField
      type={showValue ? "text" : "password"}
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

export default function SecretEditor({ name, saved, key }: SecretEditorProps) {
  const { workspace: workspaceResult } = useAppStorePick(["workspace"]);

  const [{ editingState, updateRequest, showValue }, setState] =
    useImmer<SecretState>(() => initialState(saved));

  if (workspaceResult.type !== CompletionStatus.Successful) {
    return null;
  }
  let field: React.ReactNode;
  switch (editingState.type) {
    case SecretStateType.Saved:
      field = <>saved placeholder</>;
      break;
    case SecretStateType.SavedEditing:
      field = (
        <>
          <SecretTextField
            onVisibilityChange={() => setState(toggleVisibility)}
            showValue={showValue}
          />
        </>
      );
      break;
    case SecretStateType.UnSaved:
      field = (
        <>
          <SecretTextField
            onVisibilityChange={() => setState(toggleVisibility)}
            showValue={showValue}
          />
        </>
      );
      break;
  }

  return <div>{field}</div>;
}
