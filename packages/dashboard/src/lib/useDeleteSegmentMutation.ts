import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CompletionStatus,
  DeleteSegmentRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { SEGMENTS_QUERY_KEY } from "./useSegmentsQuery"; // Assuming SEGMENTS_QUERY_KEY is exported from here

// Define the mutation function type
type DeleteSegmentMutationFn = (segmentId: string) => Promise<void>;

export function useDeleteSegmentMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, string>, // string is segmentId
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, string> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: DeleteSegmentMutationFn = async (id) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for segment deletion");
    }
    const workspaceId = workspace.value.id;

    await axios.delete(`${baseApiUrl}/segments/v2`, {
      params: {
        workspaceId,
        id,
      } satisfies DeleteSegmentRequest,
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

      // Invalidate the main segments query to refresh the list
      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        queryClient.invalidateQueries({
          queryKey: [SEGMENTS_QUERY_KEY, { workspaceId }],
        });
        // Optionally invalidate specific segment query if needed, but list invalidation is usually sufficient
      }
    },
  });

  return mutation;
}
