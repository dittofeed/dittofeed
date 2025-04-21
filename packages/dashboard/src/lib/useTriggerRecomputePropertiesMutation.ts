import {
  useMutation,
  UseMutationOptions,
  useQueryClient,
} from "@tanstack/react-query";
import axios from "axios";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  EmptyResponse,
  TriggerRecomputeRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { COMPUTED_PROPERTY_PERIODS_QUERY_KEY } from "./useComputePropertiesQuery";

export const TRIGGER_RECOMPUTE_PROPERTIES_MUTATION_KEY = [
  "triggerRecomputeProperties",
];

export function useTriggerRecomputePropertiesMutation(
  options?: UseMutationOptions<
    EmptyResponse,
    Error,
    Omit<TriggerRecomputeRequest, "workspaceId">
  >,
) {
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);
  const queryClient = useQueryClient();

  const mutationFn = async (
    params: Omit<TriggerRecomputeRequest, "workspaceId">,
  ): Promise<EmptyResponse> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }

    const { id: workspaceId } = workspace.value;
    const response = await axios.post(
      `${apiBase}/api/computed-properties/trigger-recompute`,
      {
        ...params,
        workspaceId,
      },
    );

    schemaValidate(response.data, EmptyResponse);
    return response.data;
  };

  return useMutation<
    EmptyResponse,
    Error,
    Omit<TriggerRecomputeRequest, "workspaceId">
  >({
    mutationFn,
    mutationKey: TRIGGER_RECOMPUTE_PROPERTIES_MUTATION_KEY,
    ...options,
    onSuccess: (...args) => {
      // Invalidate the computed properties query on success
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({
        queryKey: [COMPUTED_PROPERTY_PERIODS_QUERY_KEY],
      });
      queryClient.invalidateQueries({
        queryKey: ["users"],
      });
      queryClient.invalidateQueries({
        queryKey: ["usersCount"],
      });
      options?.onSuccess?.(...args);
    },
  });
}
