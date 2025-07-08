import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  CreateCustomSegmentObjectError,
  CreateCustomSegmentObjectRequest,
  CreateCustomSegmentObjectResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export type CreateCustomSegmentObjectMutationParams = Omit<
  CreateCustomSegmentObjectRequest,
  "workspaceId"
>;

type CreateCustomSegmentObjectMutationFn = (
  data: CreateCustomSegmentObjectMutationParams,
) => Promise<CreateCustomSegmentObjectResponse>;

export function useCreateCustomSegmentObjectMutation(
  options?: Omit<
    UseMutationOptions<
      CreateCustomSegmentObjectResponse,
      AxiosError<CreateCustomSegmentObjectError>,
      CreateCustomSegmentObjectMutationParams
    >,
    "mutationFn"
  >,
): UseMutationResult<
  CreateCustomSegmentObjectResponse,
  AxiosError<CreateCustomSegmentObjectError>,
  CreateCustomSegmentObjectMutationParams
> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: CreateCustomSegmentObjectMutationFn = async (data) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for segment mutation");
    }
    const workspaceId = workspace.value.id;

    const response = await axios.post(
      `${baseApiUrl}/integrations/twentycrm/create-custom-segment-object`,
      {
        ...data,
        workspaceId,
      } satisfies CreateCustomSegmentObjectRequest,
      {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      },
    );

    const validatedData = unwrap(
      schemaValidateWithErr(response.data, CreateCustomSegmentObjectResponse),
    );

    return validatedData;
  };

  const mutation = useMutation<
    CreateCustomSegmentObjectResponse,
    AxiosError<CreateCustomSegmentObjectError>,
    CreateCustomSegmentObjectMutationParams
  >({
    mutationFn,
    ...options,
  });

  return mutation;
}
