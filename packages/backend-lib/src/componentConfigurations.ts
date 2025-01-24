import { Result } from "neverthrow";

import {
  ComponentConfigurationResource,
  DeleteComponentConfigurationRequest,
  UpsertComponentConfigurationRequest,
  UpsertComponentConfigurationValidationError,
} from "./types";

export async function upsertComponentConfiguration(
  _upsertComponentConfigurationRequest: UpsertComponentConfigurationRequest,
): Promise<
  Result<
    ComponentConfigurationResource,
    UpsertComponentConfigurationValidationError
  >
> {
  throw new Error("Not implemented");
}

export async function deleteComponentConfiguration(
  _deleteComponentConfigurationRequest: DeleteComponentConfigurationRequest,
): Promise<void>> {
  throw new Error("Not implemented");
}
