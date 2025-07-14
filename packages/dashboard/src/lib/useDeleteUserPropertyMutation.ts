import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CompletionStatus,
  DeleteUserPropertyRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { USER_PROPERTIES_QUERY_KEY } from "./useUserPropertiesQuery";

type DeleteUserPropertyMutationFn = (userPropertyId: string) => Promise<void>;

export function useDeleteUserPropertyMutation(
  options?: Omit<UseMutationOptions<void, AxiosError, string>, "mutationFn">,
): UseMutationResult<void, AxiosError, string> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: DeleteUserPropertyMutationFn = async (id) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for user property deletion");
    }
    const workspaceId = workspace.value.id;

    await axios.delete(`${baseApiUrl}/user-properties`, {
      data: {
        workspaceId,
        id,
      } satisfies DeleteUserPropertyRequest,
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

      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        queryClient.invalidateQueries({
          queryKey: [USER_PROPERTIES_QUERY_KEY, { workspaceId }],
        });
      }
    },
  });

  return mutation;
}
