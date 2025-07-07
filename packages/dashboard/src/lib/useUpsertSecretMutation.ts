import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CompletionStatus,
  UpsertSecretV2Request,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { SECRETS_QUERY_KEY } from "./useListSecretsQuery";

export type UpsertSecretMutationParams = Omit<
  UpsertSecretV2Request,
  "workspaceId"
>;

type UpsertSecretMutationFn = (
  data: UpsertSecretMutationParams,
) => Promise<void>;

export function useUpsertSecretMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, UpsertSecretMutationParams>,
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, UpsertSecretMutationParams> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: UpsertSecretMutationFn = async (data) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for secret mutation");
    }
    const workspaceId = workspace.value.id;

    await axios.put(
      `${baseApiUrl}/secrets/v2`,
      {
        ...data,
        workspaceId,
      } satisfies UpsertSecretV2Request,
      {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      },
    );
  };

  const mutation = useMutation<void, AxiosError, UpsertSecretMutationParams>({
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
