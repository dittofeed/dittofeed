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
  SavedUserPropertyResource,
  UpsertUserPropertyResource,
  UpsertUserPropertyError,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { USER_PROPERTIES_QUERY_KEY } from "./useUserPropertiesQuery";

export type UpsertUserPropertyMutationParams = Omit<
  UpsertUserPropertyResource,
  "workspaceId"
>;

type UpsertUserPropertyMutationFn = (
  data: UpsertUserPropertyMutationParams,
) => Promise<SavedUserPropertyResource>;

export function useUpsertUserPropertyMutation(
  options?: Omit<
    UseMutationOptions<
      SavedUserPropertyResource,
      AxiosError<UpsertUserPropertyError>,
      UpsertUserPropertyMutationParams
    >,
    "mutationFn"
  >,
): UseMutationResult<
  SavedUserPropertyResource,
  AxiosError<UpsertUserPropertyError>,
  UpsertUserPropertyMutationParams
> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: UpsertUserPropertyMutationFn = async (data) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for user property mutation");
    }
    const workspaceId = workspace.value.id;

    const response = await axios.put(
      `${baseApiUrl}/user-properties`,
      {
        ...data,
        workspaceId,
      } satisfies UpsertUserPropertyResource,
      {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      },
    );

    const validatedData = unwrap(
      schemaValidateWithErr(response.data, SavedUserPropertyResource),
    );

    return validatedData;
  };

  const mutation = useMutation<
    SavedUserPropertyResource,
    AxiosError<UpsertUserPropertyError>,
    UpsertUserPropertyMutationParams
  >({
    mutationFn,
    ...options,
    onSuccess: (savedData, variables, context) => {
      options?.onSuccess?.(savedData, variables, context);

      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        if (savedData.id) {
          queryClient.invalidateQueries({
            queryKey: [
              USER_PROPERTIES_QUERY_KEY,
              { workspaceId, ids: [savedData.id] },
            ],
          });
        }
        queryClient.invalidateQueries({
          queryKey: [USER_PROPERTIES_QUERY_KEY, { workspaceId }],
        });
      }
    },
  });

  return mutation;
}