import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  IntegrationResource,
  UpsertIntegrationResource,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const INTEGRATIONS_QUERY_KEY = "integrations";

export type UpdateIntegrationMutationParams = Omit<
  UpsertIntegrationResource,
  "workspaceId"
>;

type UpdateIntegrationMutationFn = (
  data: UpdateIntegrationMutationParams,
) => Promise<IntegrationResource>;

export function useUpdateIntegrationMutation(
  options?: Omit<
    UseMutationOptions<
      IntegrationResource,
      AxiosError,
      UpdateIntegrationMutationParams
    >,
    "mutationFn"
  >,
): UseMutationResult<
  IntegrationResource,
  AxiosError,
  UpdateIntegrationMutationParams
> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: UpdateIntegrationMutationFn = async (data) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for integration mutation");
    }
    const { id: workspaceId } = workspace.value;

    const response = await axios.put(
      `${baseApiUrl}/integrations`,
      {
        ...data,
        workspaceId,
      } satisfies UpsertIntegrationResource,
      {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      },
    );

    const validatedData = unwrap(
      schemaValidateWithErr(response.data, IntegrationResource),
    );

    return validatedData;
  };

  const mutation = useMutation<
    IntegrationResource,
    AxiosError,
    UpdateIntegrationMutationParams
  >({
    mutationFn,
    ...options,
    onSuccess: (savedData, variables, context) => {
      options?.onSuccess?.(savedData, variables, context);

      if (workspace.type === CompletionStatus.Successful) {
        const { id: workspaceId } = workspace.value;
        if (savedData.id) {
          queryClient.invalidateQueries({
            queryKey: [
              INTEGRATIONS_QUERY_KEY,
              { workspaceId, ids: [savedData.id] },
            ],
          });
        }
        queryClient.invalidateQueries({
          queryKey: [INTEGRATIONS_QUERY_KEY, { workspaceId }],
        });
      }
    },
  });

  return mutation;
}
