import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  BroadcastResourceV2,
  CompletionStatus,
  GetBroadcastsResponse,
  UpsertBroadcastV2Request,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";

// Type for the variables passed to the mutation function when creating a broadcast
type CreateBroadcastVariables = { name: string } & Partial<
  Omit<UpsertBroadcastV2Request, "workspaceId" | "id">
>;

export function useCreateBroadcastMutation() {
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);
  const queryClient = useQueryClient();

  const mutationFn = async (
    createData: CreateBroadcastVariables,
  ): Promise<BroadcastResourceV2> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for broadcast creation.");
    }
    const workspaceId = workspace.value.id;
    // Generate a new UUID for the broadcast ID client-side

    const requestData: UpsertBroadcastV2Request = {
      workspaceId,
      ...createData,
    };

    const response = await axios.put<BroadcastResourceV2>(
      `${apiBase}/api/broadcasts/v2`,
      requestData,
    );
    return response.data;
  };

  return useMutation<
    BroadcastResourceV2, // TData (data returned by mutationFn)
    Error, // TError
    CreateBroadcastVariables, // TVariables (data passed to mutationFn)
    unknown // TContext (not using context here)
  >({
    mutationFn,
    onSuccess: (data) => {
      // data is the BroadcastResourceV2 returned by the server
      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        const queryKey = ["broadcasts", { ids: [data.id], workspaceId }];

        // Add the newly created broadcast to the cache for its specific query key
        // GetBroadcastsResponse is BroadcastResourceAllVersions[]
        queryClient.setQueryData<GetBroadcastsResponse>(queryKey, [data]);
      }
    },
    onError: (error) => {
      console.error("Create broadcast mutation failed:", error);
      // TODO: Add user-facing error feedback (e.g., snackbar)
    },
    onSettled: (data) => {
      // data is BroadcastResourceV2 | undefined (if successful)
      // error is Error | null (if failed)
      if (workspace.type !== CompletionStatus.Successful) {
        console.warn(
          "Workspace not available, skipping query invalidation on settle for create broadcast.",
        );
        return;
      }
      const workspaceId = workspace.value.id;

      // If creation was successful, invalidate the specific query for the new broadcast
      if (data?.id) {
        const specificQueryKey = [
          "broadcasts",
          { ids: [data.id], workspaceId },
        ];
        queryClient.invalidateQueries({ queryKey: specificQueryKey });
      }

      // Always invalidate the general list of broadcasts for the workspace
      // This ensures any list displaying broadcasts will refetch and show the new one.
      const listQueryKey = ["broadcasts", { workspaceId }];
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
  });
}
