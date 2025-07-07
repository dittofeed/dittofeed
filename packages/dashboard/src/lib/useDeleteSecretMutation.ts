import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CompletionStatus,
  DeleteSecretV2Request,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { SECRETS_QUERY_KEY } from "./useListSecretsQuery";

type DeleteSecretMutationFn = (secretName: string) => Promise<void>;

export function useDeleteSecretMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, string>, // string is secretName
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, string> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: DeleteSecretMutationFn = async (name) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for secret deletion");
    }
    const workspaceId = workspace.value.id;

    await axios.delete(`${baseApiUrl}/secrets/v2`, {
      params: {
        workspaceId,
        name,
      } satisfies DeleteSecretV2Request,
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
          queryKey: [SECRETS_QUERY_KEY, { workspaceId }],
        });
      }
    },
  });

  return mutation;
}
