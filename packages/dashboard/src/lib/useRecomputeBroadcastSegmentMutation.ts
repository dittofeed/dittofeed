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
  RecomputeBroadcastSegmentRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";

export const RECOMPUTE_BROADCAST_SEGMENT_MUTATION_KEY = [
  "recomputeBroadcastSegment",
];

export function useRecomputeBroadcastSegmentMutation(
  options?: UseMutationOptions<
    EmptyResponse,
    Error,
    Omit<RecomputeBroadcastSegmentRequest, "workspaceId">
  >,
) {
  const queryClient = useQueryClient();
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);

  const mutationFn = async (
    params: Omit<RecomputeBroadcastSegmentRequest, "workspaceId">,
  ): Promise<EmptyResponse> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }

    const { id: workspaceId } = workspace.value;
    const response = await axios.put(
      `${apiBase}/api/broadcasts/recompute-segment`,
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
    Omit<RecomputeBroadcastSegmentRequest, "workspaceId">
  >({
    mutationFn,
    mutationKey: RECOMPUTE_BROADCAST_SEGMENT_MUTATION_KEY,
    ...options,
    onSuccess: (...args) => {
      // Invalidate the computed properties query on success
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({
        queryKey: [RECOMPUTE_BROADCAST_SEGMENT_MUTATION_KEY],
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
