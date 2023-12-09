import {
  CompletionStatus,
  EphemeralRequestStatus,
} from "isomorphic-lib/src/types";
import { useImmer } from "use-immer";

import { useAppStorePick } from "../lib/appStore";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";

export enum SecretStateType {
  Saved = "Saved",
  SavedEditing = "SavedEditing",
  UnSaved = "UnSaved",
}

export interface SavedSecretState {
  type: SecretStateType.Saved;
}

export interface SavedEditingSecretState {
  type: SecretStateType.SavedEditing;
}

export interface UnSavedSecretState {
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
      : { type: SecretStateType.UnSaved },
  };
}

function toggleVisibility(state: SecretState) {
  state.showValue = !state.showValue;
}

export default function SecretEditor({ name, saved, key }: SecretEditorProps) {
  const { workspace: workspaceResult } = useAppStorePick(["workspace"]);

  const [{ editingState, updateRequest, showValue }, setState] =
    useImmer<SecretState>(() => initialState(saved));

  if (workspaceResult.type !== CompletionStatus.Successful) {
    return null;
  }
  return (
    <div>
      <TextField
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label="toggle password visibility"
                onClick={() => setState(toggleVisibility)}
                onMouseDown={() => setState(toggleVisibility)}
              >
                {showValue ? <Visibility /> : <VisibilityOff />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
    </div>
  );
}
