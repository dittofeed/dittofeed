import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CompletionStatus,
  UserPropertyIndexType,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { USER_PROPERTY_INDICES_QUERY_KEY } from "./useUserPropertyIndicesQuery";

export interface UpsertUserPropertyIndexParams {
  userPropertyId: string;
  type: UserPropertyIndexType;
}

export function useUpsertUserPropertyIndexMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, UpsertUserPropertyIndexParams>,
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, UpsertUserPropertyIndexParams> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (
    data: UpsertUserPropertyIndexParams,
  ): Promise<void> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available");
    }
    const workspaceId = workspace.value.id;

    await axios.put(
      `${baseApiUrl}/user-property-indices`,
      { workspaceId, userPropertyId: data.userPropertyId, type: data.type },
      { headers: { "Content-Type": "application/json", ...authHeaders } },
    );
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
