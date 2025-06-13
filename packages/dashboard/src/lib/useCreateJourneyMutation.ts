import {
  useMutation,
  UseMutationOptions,
  useQueryClient,
} from "@tanstack/react-query";
import axios from "axios";
import {
  CompletionStatus,
  SavedJourneyResource,
  UpsertJourneyResource,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { JOURNEYS_QUERY_KEY } from "./constants";

type CreateJourneyVariables = Omit<UpsertJourneyResource, "workspaceId" | "id">;

type CreateJourneyHookOptions = Omit<
  UseMutationOptions<SavedJourneyResource, Error, CreateJourneyVariables>,
  "mutationFn"
>;

export function useCreateJourneyMutation(hookOpts?: CreateJourneyHookOptions) {
  const { workspace } = useAppStorePick(["workspace"]);
  const queryClient = useQueryClient();
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (
    createData: CreateJourneyVariables,
  ): Promise<SavedJourneyResource> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for journey creation.");
    }
    const workspaceId = workspace.value.id;

    const requestData: Omit<UpsertJourneyResource, "id"> = {
      workspaceId,
      ...createData,
    };

    const response = await axios.put<SavedJourneyResource>(
      `${baseApiUrl}/journeys`,
      requestData,
      { headers: authHeaders },
    );
    return response.data;
  };

  const {
    onSuccess: userOnSuccess,
    onSettled: userOnSettled,
    ...restHookOpts
  } = hookOpts ?? {};

  return useMutation<SavedJourneyResource, Error, CreateJourneyVariables>({
    mutationFn,
    onSuccess: (data, variables, context) => {
      userOnSuccess?.(data, variables, context);
    },
    onSettled: (data, error, variables, context) => {
      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        queryClient.invalidateQueries({
          queryKey: [JOURNEYS_QUERY_KEY, { workspaceId }],
        });
      }
      userOnSettled?.(data, error, variables, context);
    },
    ...restHookOpts,
  });
}
