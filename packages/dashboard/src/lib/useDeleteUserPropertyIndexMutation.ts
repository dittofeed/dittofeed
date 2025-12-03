import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { CompletionStatus } from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { USER_PROPERTY_INDICES_QUERY_KEY } from "./useUserPropertyIndicesQuery";

export interface DeleteUserPropertyIndexParams {
  userPropertyId: string;
}

export function useDeleteUserPropertyIndexMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, DeleteUserPropertyIndexParams>,
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, DeleteUserPropertyIndexParams> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async ({
    userPropertyId,
  }: DeleteUserPropertyIndexParams): Promise<void> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const workspaceId = workspace.value.id;

    await axios.delete(`${baseApiUrl}/user-property-indices`, {
      data: { workspaceId, userPropertyId },
      headers: { "Content-Type": "application/json", ...authHeaders },
    });
  };

  return useMutation({
    mutationFn,
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);
      if (workspace.type === CompletionStatus.Successful) {
        queryClient.invalidateQueries({
          queryKey: [
            USER_PROPERTY_INDICES_QUERY_KEY,
            { workspaceId: workspace.value.id },
          ],
        });
      }
    },
  });
}
