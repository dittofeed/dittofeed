import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  ChannelType,
  CompletionStatus,
  DeleteMessageTemplateRequest as ApiDeleteMessageTemplateRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

// Interface for the variables passed to the mutate function
export interface DeleteMessageTemplateVariables {
  id: string;
  channelType: ChannelType;
}

// Define the mutation function type
// The input to the mutation function will be DeleteMessageTemplateVariables
type DeleteMessageTemplateMutationFn = (
  variables: DeleteMessageTemplateVariables,
) => Promise<void>;

export function useDeleteMessageTemplateMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, DeleteMessageTemplateVariables>,
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, DeleteMessageTemplateVariables> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: DeleteMessageTemplateMutationFn = async (variables) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for template deletion");
    }
    const workspaceId = workspace.value.id;
    const { id, channelType } = variables;

    await axios.delete(`${baseApiUrl}/content/templates/v2`, {
      params: {
        workspaceId,
        id,
        type: channelType,
      } satisfies ApiDeleteMessageTemplateRequest,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
    });
  };

  const mutation = useMutation<
    void,
    AxiosError,
    DeleteMessageTemplateVariables
  >({
    mutationFn,
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);
      if (workspace.type === CompletionStatus.Successful) {
        queryClient.invalidateQueries({
          queryKey: ["messageTemplates", { workspaceId: workspace.value.id }],
        });
      }
    },
  });

  return mutation;
}
