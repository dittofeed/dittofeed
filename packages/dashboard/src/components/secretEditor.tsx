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
    updateRequest: {
      type: CompletionStatus.NotStarted,
    },
    editingState: saved
      ? { type: SecretStateType.Saved }
      : { type: SecretStateType.UnSaved },
  };
}

export default function SecretEditor({ name, saved, key }: SecretEditorProps) {
  const { workspace: workspaceResult } = useAppStorePick(["workspace"]);

  const { editingState, updateRequest } = useImmer<SecretState>(() =>
    initialState(saved)
  );

  if (workspaceResult.type !== CompletionStatus.Successful) {
    return null;
  }
  return (
    <div>
      <p>secretEditor</p>
    </div>
  );
}
