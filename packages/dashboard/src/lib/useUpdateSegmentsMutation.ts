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
import { SEGMENTS_QUERY_KEY } from "./useSegmentsQuery";

// Define the mutation function type
type UpdateSegmentMutationFn = (
  data: UpsertSegmentResource,
) => Promise<SavedSegmentResource>;

export function useUpdateSegmentsMutation(
  options?: Omit<
    UseMutationOptions<
      SavedSegmentResource,
      AxiosError<UpsertSegmentValidationError>,
      UpsertSegmentResource
    >,
    "mutationFn"
  >,
): UseMutationResult<
  SavedSegmentResource,
  AxiosError<UpsertSegmentValidationError>,
  UpsertSegmentResource
> {
  const queryClient = useQueryClient();
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);

  const mutationFn: UpdateSegmentMutationFn = async (data) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for segment mutation");
    }
    const workspaceId = workspace.value.id;

    const response = await axios.put(
      `${apiBase}/api/segments`,
      {
        ...data,
        workspaceId,
      },
      {
        headers: {
          "Content-Type": "application/json",
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
    UpsertSegmentResource
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
