import {
  useMutation,
  UseMutationOptions,
  useQueryClient,
} from "@tanstack/react-query";
import axios from "axios";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { sleep } from "isomorphic-lib/src/time";
import {
  BaseMessageResponse,
  BroadcastResourceV2,
  CancelBroadcastRequest,
  CompletionStatus,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { BROADCASTS_QUERY_KEY } from "./useBroadcastsQuery";

export const CANCEL_BROADCAST_MUTATION_KEY = ["cancelBroadcast"];

interface MutationContext {
  previousBroadcast?: BroadcastResourceV2;
}

export function useCancelBroadcastMutation(
  options?: UseMutationOptions<
    BaseMessageResponse,
    Error,
    Omit<CancelBroadcastRequest, "workspaceId">,
    MutationContext
  >,
) {
  const { workspace } = useAppStorePick(["workspace"]);
  const queryClient = useQueryClient();
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (
    params: Omit<CancelBroadcastRequest, "workspaceId">,
  ): Promise<BaseMessageResponse> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }

    const { id: workspaceId } = workspace.value;
    const response = await axios.post(
      `${baseApiUrl}/broadcasts/cancel`,
      {
        ...params,
        workspaceId,
      },
      { headers: authHeaders },
    );

    const validatedResponse = schemaValidate(
      response.data,
      BaseMessageResponse,
    );
    if (validatedResponse.isErr()) {
      throw new Error(
        `API response schema validation failed: ${validatedResponse.error
          .map((e) => e.message)
          .join(", ")}`,
      );
    }
    return validatedResponse.value;
  };

  return useMutation<
    BaseMessageResponse,
    Error,
    Omit<CancelBroadcastRequest, "workspaceId">,
    MutationContext
  >({
    mutationFn,
    mutationKey: CANCEL_BROADCAST_MUTATION_KEY,
    ...options,
    onMutate: async (variables) => {
      if (workspace.type !== CompletionStatus.Successful) {
        throw new Error("Workspace not available");
      }
      const workspaceId = workspace.value.id;

      // Cancel any outgoing refetches for the specific broadcast
      const broadcastQueryKey = [
        BROADCASTS_QUERY_KEY,
        { ids: [variables.broadcastId], workspaceId },
      ];
      await queryClient.cancelQueries({ queryKey: broadcastQueryKey });

      // Snapshot the previous value
      const previousData =
        queryClient.getQueryData<BroadcastResourceV2[]>(broadcastQueryKey);
      const previousBroadcast = previousData?.[0];

      // Optimistically update to the new value
      if (previousBroadcast && previousBroadcast.version === "V2") {
        queryClient.setQueryData<BroadcastResourceV2[]>(broadcastQueryKey, [
          {
            ...previousBroadcast,
            status: "Cancelled" as const,
          },
        ]);
      }

      // Call the original onMutate if provided
      await options?.onMutate?.(variables);

      // Return a context object with the snapshotted value
      return { previousBroadcast };
    },
    onError: (err, variables, context) => {
      if (workspace.type !== CompletionStatus.Successful) {
        return;
      }
      const workspaceId = workspace.value.id;

      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousBroadcast) {
        const broadcastQueryKey = [
          BROADCASTS_QUERY_KEY,
          { ids: [variables.broadcastId], workspaceId },
        ];
        queryClient.setQueryData(broadcastQueryKey, [
          context.previousBroadcast,
        ]);
      }
      // Call the original onError if provided
      options?.onError?.(err, variables, context);
    },
    onSuccess: async (...args) => {
      // Wait before invalidating to allow backend to process
      await sleep(2000);

      // Invalidate queries - this will refresh all broadcasts queries including specific ones
      await queryClient.invalidateQueries({
        queryKey: [BROADCASTS_QUERY_KEY],
      });

      // Call the original onSuccess if provided
      options?.onSuccess?.(...args);
    },
  });
}
