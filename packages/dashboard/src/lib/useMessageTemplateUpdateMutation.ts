import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  CompletionStatus,
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  UpsertMessageTemplateResource,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";

// Context type for mutation rollback
interface MutationContext {
  previousTemplateDataArray: MessageTemplateResource[] | null | undefined;
}

// Define the type for the variables passed to the mutation function explicitly
type MutationVariables = Omit<
  UpsertMessageTemplateResource,
  "workspaceId" | "id"
>;

// Mutation hook for updating message templates
export function useMessageTemplateUpdateMutation(templateId: string) {
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);
  const queryClient = useQueryClient();

  const mutationFn = async (
    updateData: MutationVariables,
  ): Promise<MessageTemplateResource> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const workspaceId = workspace.value.id;

    // Construct the full request payload for PUT/upsert.
    const requestData: UpsertMessageTemplateResource = {
      ...updateData,
      workspaceId,
      id: templateId,
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
    MutationVariables, // Type of variables passed to mutate()
    MutationContext // Type of context used between onMutate and onError/onSettled
  >({
    mutationFn,
    onMutate: async (newData) => {
      if (workspace.type !== CompletionStatus.Successful) {
        return undefined;
      }
      const workspaceId = workspace.value.id;
      const queryKey = ["messageTemplates", { ids: [templateId], workspaceId }];

      await queryClient.cancelQueries({ queryKey });

      const previousTemplateDataArray = queryClient.getQueryData<
        MessageTemplateResource[] | null
      >(queryKey);

      queryClient.setQueryData<MessageTemplateResource[] | undefined>(
        queryKey,
        (oldDataArray) => {
          if (!oldDataArray || oldDataArray.length === 0) {
            return oldDataArray;
          }

          return oldDataArray.map((template) => {
            if (template.id === templateId) {
              // Perform a type-safe merge for optimistic update
              const updatedTemplate: MessageTemplateResource = {
                ...template,
                type: newData.type,
                ...(newData.name && { name: newData.name }),
                ...(newData.definition && { definition: newData.definition }),
                draft:
                  newData.draft === null
                    ? template.draft
                    : newData.draft ?? template.draft,
                ...(newData.journeyId && { journeyId: newData.journeyId }),
                ...(newData.from && { from: newData.from }),
                ...(newData.replyTo && { replyTo: newData.replyTo }),
                ...(newData.subject && { subject: newData.subject }),
                ...(newData.body && { body: newData.body }),
                ...(newData.title && { title: newData.title }),
                ...(newData.webhookUrl && { webhookUrl: newData.webhookUrl }),
                ...(newData.webhookHeaders && {
                  webhookHeaders: newData.webhookHeaders,
                }),
                ...(newData.webhookBody && {
                  webhookBody: newData.webhookBody,
                }),
                ...(newData.webhookMethod && {
                  webhookMethod: newData.webhookMethod,
                }),
              };
              return updatedTemplate;
            }
            return template;
          });
        },
      );

      return { previousTemplateDataArray };
    },
    onError: (err, _variables, context) => {
      console.error("Message template update mutation failed:", err);
      if (
        context?.previousTemplateDataArray !== undefined &&
        workspace.type === CompletionStatus.Successful
      ) {
        const workspaceId = workspace.value.id;
        const queryKey = [
          "messageTemplates",
          { ids: [templateId], workspaceId },
        ];
        queryClient.setQueryData(queryKey, context.previousTemplateDataArray);
      }
    },
    onSettled: (_data, _error, _variables, _context) => {
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
          ids: [templateId],
          workspaceId,
        },
      ];
      queryClient.invalidateQueries({ queryKey });

      const allTemplatesQueryKey = ["messageTemplates", { workspaceId }];
      queryClient.invalidateQueries({ queryKey: allTemplatesQueryKey });
    },
  });
}
