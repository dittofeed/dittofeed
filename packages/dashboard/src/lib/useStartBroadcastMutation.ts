import {
  useMutation,
  UseMutationOptions,
  useQueryClient,
} from "@tanstack/react-query";
import axios from "axios";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  BaseMessageResponse,
  CompletionStatus,
  StartBroadcastRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { BROADCASTS_QUERY_KEY } from "./useBroadcastsQuery";

export const START_BROADCAST_MUTATION_KEY = ["startBroadcast"];

export function useStartBroadcastMutation(
  options?: UseMutationOptions<
    BaseMessageResponse,
    Error,
    Omit<StartBroadcastRequest, "workspaceId">
  >,
) {
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);
  const queryClient = useQueryClient();

  const mutationFn = async (
    params: Omit<StartBroadcastRequest, "workspaceId">,
  ): Promise<BaseMessageResponse> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }

    const { id: workspaceId } = workspace.value;
    const response = await axios.post(`${apiBase}/api/broadcasts/start`, {
      ...params,
      workspaceId,
    });

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
    Omit<StartBroadcastRequest, "workspaceId">
  >({
    mutationFn,
    mutationKey: START_BROADCAST_MUTATION_KEY,
    ...options,
    onSuccess: (...args) => {
      queryClient.invalidateQueries({
        queryKey: [BROADCASTS_QUERY_KEY],
      });
      options?.onSuccess?.(...args);
    },
  });
}
