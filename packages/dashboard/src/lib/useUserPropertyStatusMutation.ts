import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  CompletionStatus,
  SavedUserPropertyResource,
  UpdateUserPropertyStatusRequest,
  UserPropertyStatus,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { USER_PROPERTIES_QUERY_KEY } from "./useUserPropertiesQuery";

export interface UserPropertyStatusUpdate {
  status: UserPropertyStatus;
}

// Mutation hook for updating user property status
export function useUserPropertyStatusMutation(userPropertyId: string) {
  const { workspace } = useAppStorePick(["workspace"]);
  const queryClient = useQueryClient();
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (update: UserPropertyStatusUpdate) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const workspaceId = workspace.value.id;
    const requestData: UpdateUserPropertyStatusRequest = {
      workspaceId,
      id: userPropertyId,
      status: update.status,
    };

    const response = await axios.patch<SavedUserPropertyResource>(
      `${baseApiUrl}/user-properties/status`,
      requestData,
      { headers: authHeaders },
    );
    return response.data;
  };

  return useMutation<
    SavedUserPropertyResource,
    Error,
    UserPropertyStatusUpdate
  >({
    mutationFn,
    // Always refetch after error or success to ensure consistency
    onSettled: () => {
      if (workspace.type !== CompletionStatus.Successful) {
        return;
      }
      const workspaceId = workspace.value.id;
      const queryKey = [USER_PROPERTIES_QUERY_KEY, { workspaceId }];
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
