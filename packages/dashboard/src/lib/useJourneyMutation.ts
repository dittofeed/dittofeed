import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  CompletionStatus,
  SavedJourneyResource,
  UpsertJourneyResource,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { JOURNEYS_QUERY_KEY } from "./constants";

interface JourneyUpdate {
  journey: SavedJourneyResource;
  update: Partial<Omit<UpsertJourneyResource, "workspaceId" | "id">>;
}

// Mutation hook for upserting journeys
export function useJourneyMutation(journeyId: string) {
  const { workspace } = useAppStorePick(["workspace"]);
  const queryClient = useQueryClient();
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async ({ journey, update }: JourneyUpdate) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const workspaceId = workspace.value.id;
    const requestData: UpsertJourneyResource = {
      ...journey,
      ...update,
      workspaceId,
      id: journeyId,
    };

    const response = await axios.put<SavedJourneyResource>(
      `${baseApiUrl}/journeys`,
      requestData,
      { headers: authHeaders },
    );
    return response.data;
  };

  return useMutation<SavedJourneyResource, Error, JourneyUpdate>({
    mutationFn,
    // Always refetch after error or success to ensure consistency
    onSettled: () => {
      if (workspace.type !== CompletionStatus.Successful) {
        return;
      }
      const workspaceId = workspace.value.id;
      const queryKey = [JOURNEYS_QUERY_KEY, { workspaceId }];
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
