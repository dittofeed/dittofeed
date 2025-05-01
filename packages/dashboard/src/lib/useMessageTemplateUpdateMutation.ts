import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  CompletionStatus,
  GetMessageTemplatesResponse,
  MessageTemplateResource,
  UpsertMessageTemplateResource,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";

// Context type for mutation rollback
interface MutationContext {
  previousTemplateDataArray: MessageTemplateResource[] | null | undefined;
}

// Define the type for the variables passed to the mutation function explicitly
export type UpsertMessageTemplateParams = Omit<
  UpsertMessageTemplateResource,
  "workspaceId"
>;

// Mutation hook for updating message templates
export function useMessageTemplateUpdateMutation() {
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);
  const queryClient = useQueryClient();

  const mutationFn = async (
    updateData: UpsertMessageTemplateParams,
  ): Promise<MessageTemplateResource> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const workspaceId = workspace.value.id;

    // Construct the full request payload for PUT/upsert.
    const requestData: UpsertMessageTemplateResource = {
      ...updateData,
      workspaceId,
    };

    const response = await axios.put<MessageTemplateResource>(
      `${apiBase}/api/templates`,
      requestData,
    );
    return response.data;
  };

  return useMutation<
    MessageTemplateResource, // Type of data returned by mutationFn
    Error, // Type of error
    UpsertMessageTemplateParams, // Type of variables passed to mutate()
    MutationContext // Type of context used between onMutate and onError/onSettled
  >({
    mutationFn,
    onMutate: async (newData) => {
      if (workspace.type !== CompletionStatus.Successful) {
        return undefined;
      }
      const workspaceId = workspace.value.id;
      const queryKey = ["messageTemplates", { ids: [newData.id], workspaceId }];

      await queryClient.cancelQueries({ queryKey });

      const previousTemplateDataArray = queryClient.getQueryData<
        MessageTemplateResource[] | null
      >(queryKey);

      queryClient.setQueryData<GetMessageTemplatesResponse["templates"]>(
        queryKey,
        (oldDataArray) => {
          const oldData: MessageTemplateResource | undefined =
            oldDataArray?.[0];

          if (!oldData) {
            return oldDataArray;
          }

          return [
            {
              ...oldData,
              ...newData,
              draft:
                newData.draft === undefined
                  ? oldData.draft
                  : newData.draft ?? oldData.draft,
            } satisfies MessageTemplateResource,
          ];
        },
      );

      return { previousTemplateDataArray };
    },
    onError: (err, variables, context) => {
      console.error("Message template update mutation failed:", err);
      if (
        context?.previousTemplateDataArray !== undefined &&
        workspace.type === CompletionStatus.Successful
      ) {
        const workspaceId = workspace.value.id;
        const queryKey = [
          "messageTemplates",
          { ids: [variables.id], workspaceId },
        ];
        queryClient.setQueryData(queryKey, context.previousTemplateDataArray);
      }
    },
    onSettled: (_data, _error, variables, _context) => {
      if (workspace.type !== CompletionStatus.Successful) {
        console.warn(
          "Workspace not available, skipping query invalidation on settle.",
        );
        return;
      }
      const workspaceId = workspace.value.id;
      const queryKey = [
        "messageTemplates",
        {
          ids: [variables.id],
          workspaceId,
        },
      ];
      queryClient.invalidateQueries({ queryKey });

      const allTemplatesQueryKey = ["messageTemplates", { workspaceId }];
      queryClient.invalidateQueries({ queryKey: allTemplatesQueryKey });
    },
  });
}
