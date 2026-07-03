import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  CompletionStatus,
  RecomputeSegmentRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { COMPUTED_PROPERTY_PERIODS_QUERY_KEY } from "./useComputedPropertyPeriodsQuery";
import { SEGMENTS_QUERY_KEY } from "./useSegmentsQuery";

export interface RecomputeSegmentMutationParams {
  id: string;
}

export function useRecomputeSegmentMutation() {
  const { workspace } = useAppStorePick(["workspace"]);
  const queryClient = useQueryClient();
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async ({
    id,
  }: RecomputeSegmentMutationParams): Promise<undefined> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const requestData: RecomputeSegmentRequest = {
      workspaceId: workspace.value.id,
      id,
    };

    await axios.post(`${baseApiUrl}/segments/recompute`, requestData, {
      headers: authHeaders,
    });
    return undefined;
  };

  return useMutation<undefined, Error, RecomputeSegmentMutationParams>({
    mutationFn,
    onSettled: () => {
      if (workspace.type !== CompletionStatus.Successful) {
        return;
      }
      const workspaceId = workspace.value.id;
      queryClient.invalidateQueries({
        queryKey: [SEGMENTS_QUERY_KEY, { workspaceId }],
      });
      queryClient.invalidateQueries({
        queryKey: [COMPUTED_PROPERTY_PERIODS_QUERY_KEY],
      });
    },
  });
}
