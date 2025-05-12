import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { CompletionStatus } from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export interface DeleteMessageTemplateRequest {
  workspaceId: string;
  // "id" is used for the template ID to align with MessageTemplateResource
  id: string;
}

// Define the mutation function type
// The input to the mutation function will be the templateId (string)
type DeleteMessageTemplateMutationFn = (templateId: string) => Promise<void>;

export function useDeleteMessageTemplateMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, string>, // string is templateId
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, string> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: DeleteMessageTemplateMutationFn = async (templateId) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for template deletion");
    }
    const workspaceId = workspace.value.id;

    // Assuming the API endpoint is /content/templates and expects a body
    // with workspaceId and the template id for deletion.
    await axios.delete(`${baseApiUrl}/content/templates`, {
      data: {
        workspaceId,
        id: templateId, // Map templateId to "id" in the request body
      } satisfies DeleteMessageTemplateRequest,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
    });
  };

  const mutation = useMutation<void, AxiosError, string>({
    mutationFn,
    ...options,
    onSuccess: (data, variables, context) => {
      // Call the original onSuccess if provided
      options?.onSuccess?.(data, variables, context);

      // Invalidate message template queries to refresh the list
      if (workspace.type === CompletionStatus.Successful) {
        // More specific invalidation targeting the workspace
        queryClient.invalidateQueries({
          queryKey: ["messageTemplates", { workspaceId: workspace.value.id }],
        });
      }
    },
  });

  return mutation;
}
