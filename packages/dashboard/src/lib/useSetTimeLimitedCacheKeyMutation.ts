import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CompletionStatus,
  SetTimeLimitedCacheRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const TIME_LIMITED_CACHE_ENTRY_QUERY_KEY = "timeLimitedCacheEntry";

// Type for the variables passed to the mutate function (excluding workspaceId)
export type SetTimeLimitedCacheKeyMutationInput = Omit<
  SetTimeLimitedCacheRequest,
  "workspaceId"
>;

// Define the mutation function type
type SetTimeLimitedCacheMutationFn = (
  input: SetTimeLimitedCacheKeyMutationInput,
) => Promise<void>;

export function useSetTimeLimitedCacheKeyMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, SetTimeLimitedCacheKeyMutationInput>,
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, SetTimeLimitedCacheKeyMutationInput> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: SetTimeLimitedCacheMutationFn = async (input) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for setting cache key");
    }
    const workspaceId = workspace.value.id;

    const apiRequest: SetTimeLimitedCacheRequest = {
      ...input,
      workspaceId,
    };

    await axios.post(`${baseApiUrl}/time-limited-cache/set`, apiRequest, {
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
    });
  };

  const mutation = useMutation<
    void,
    AxiosError,
    SetTimeLimitedCacheKeyMutationInput
  >({
    mutationFn,
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);

      // Invalidate queries related to the cache entry that was set.
      // workspaceId is now available from the closure or can be re-derived if needed
      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        queryClient.invalidateQueries({
          queryKey: [
            TIME_LIMITED_CACHE_ENTRY_QUERY_KEY,
            workspaceId,
            variables.key,
          ],
        });
      }
    },
  });

  return mutation;
}
