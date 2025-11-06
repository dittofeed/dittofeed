import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  CompletionStatus,
  SavedSegmentResource,
  SegmentStatus,
  UpdateSegmentStatusRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { SEGMENTS_QUERY_KEY } from "./useSegmentsQuery";

export interface SegmentStatusUpdate {
  status: SegmentStatus;
}

// Mutation hook for updating segment status
export function useSegmentStatusMutation(segmentId: string) {
  const { workspace } = useAppStorePick(["workspace"]);
  const queryClient = useQueryClient();
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (update: SegmentStatusUpdate) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const workspaceId = workspace.value.id;
    const requestData: UpdateSegmentStatusRequest = {
      workspaceId,
      id: segmentId,
      status: update.status,
    };

    const response = await axios.patch<SavedSegmentResource>(
      `${baseApiUrl}/segments/status`,
      requestData,
      { headers: authHeaders },
    );
    return response.data;
  };

  return useMutation<SavedSegmentResource, Error, SegmentStatusUpdate>({
    mutationFn,
    // Always refetch after error or success to ensure consistency
    onSettled: () => {
      if (workspace.type !== CompletionStatus.Successful) {
        return;
      }
      const workspaceId = workspace.value.id;
      const queryKey = [SEGMENTS_QUERY_KEY, { workspaceId }];
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
