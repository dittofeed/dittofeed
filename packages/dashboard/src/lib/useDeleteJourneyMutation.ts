import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CompletionStatus,
  DeleteJourneyRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { JOURNEYS_QUERY_KEY } from "./constants";

// Define the mutation function type
type DeleteJourneyMutationFn = (journeyId: string) => Promise<void>;

export function useDeleteJourneyMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, string>, // string is journeyId
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, string> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: DeleteJourneyMutationFn = async (id) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for journey deletion");
    }
    const workspaceId = workspace.value.id;

    await axios.delete(`${baseApiUrl}/journeys`, {
      data: {
        workspaceId,
        id,
      } satisfies DeleteJourneyRequest,
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
      options?.onSuccess?.(data, variables, context);

      // Invalidate the main journeys query to refresh the list
      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        queryClient.invalidateQueries({
          queryKey: [JOURNEYS_QUERY_KEY, { workspaceId }],
        });
      }
    },
  });

  return mutation;
}
