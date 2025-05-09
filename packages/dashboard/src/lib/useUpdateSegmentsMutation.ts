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
  SavedSegmentResource,
  UpsertSegmentResource,
  UpsertSegmentValidationError,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { SEGMENTS_QUERY_KEY } from "./useSegmentsQuery";

export type UpdateSegmentMutationParams = Omit<
  UpsertSegmentResource,
  "workspaceId"
>;

// Define the mutation function type
type UpdateSegmentMutationFn = (
  data: UpdateSegmentMutationParams,
) => Promise<SavedSegmentResource>;

export function useUpdateSegmentsMutation(
  options?: Omit<
    UseMutationOptions<
      SavedSegmentResource,
      AxiosError<UpsertSegmentValidationError>,
      UpdateSegmentMutationParams
    >,
    "mutationFn"
  >,
): UseMutationResult<
  SavedSegmentResource,
  AxiosError<UpsertSegmentValidationError>,
  UpdateSegmentMutationParams
> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: UpdateSegmentMutationFn = async (data) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for segment mutation");
    }
    const workspaceId = workspace.value.id;

    const response = await axios.put(
      `${baseApiUrl}/segments`,
      {
        ...data,
        workspaceId,
      } satisfies UpsertSegmentResource,
      {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      },
    );

    // Validate the response data using the SavedSegmentResource type itself
    const validatedData = unwrap(
      schemaValidateWithErr(response.data, SavedSegmentResource),
    );

    return validatedData;
  };

  const mutation = useMutation<
    SavedSegmentResource,
    AxiosError<UpsertSegmentValidationError>,
    UpdateSegmentMutationParams
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
              SEGMENTS_QUERY_KEY,
              workspaceId,
              { ids: [savedData.id] },
            ],
          });
        }
        queryClient.invalidateQueries({
          queryKey: [SEGMENTS_QUERY_KEY, workspaceId],
        });
      }
    },
  });

  return mutation;
}
