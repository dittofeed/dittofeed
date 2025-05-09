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
  MessageTemplateTestRequest,
  MessageTemplateTestResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export type TestTemplateVariables = Omit<
  MessageTemplateTestRequest,
  "workspaceId"
>;

export type UseTestTemplateMutationOptions = Omit<
  UseMutationOptions<
    MessageTemplateTestResponse,
    AxiosError, // Can be more specific if API provides structured errors
    TestTemplateVariables
  >,
  "mutationFn"
>;

export function useTestTemplateMutation(
  options?: UseTestTemplateMutationOptions,
): UseMutationResult<
  MessageTemplateTestResponse,
  AxiosError,
  TestTemplateVariables
> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (
    params: TestTemplateVariables,
  ): Promise<MessageTemplateTestResponse> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for testing template");
    }
    const workspaceId = workspace.value.id;

    const fullRequestParams: MessageTemplateTestRequest = {
      ...params,
      workspaceId,
    };

    const response = await axios.post<MessageTemplateTestResponse>(
      `${baseApiUrl}/content/templates/test`,
      fullRequestParams,
      {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      },
    );
    return unwrap(
      schemaValidateWithErr(response.data, MessageTemplateTestResponse),
    );
  };

  return useMutation({
    mutationFn,
    ...options,
    // onSuccess, onError, onSettled can be handled by the caller via options
  });
}
