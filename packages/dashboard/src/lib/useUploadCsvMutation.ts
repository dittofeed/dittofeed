import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  MANUAL_SEGMENT_APPEND_HEADER,
  SEGMENT_ID_HEADER,
  WORKSPACE_ID_HEADER,
} from "isomorphic-lib/src/constants";
import { CompletionStatus } from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { SEGMENTS_QUERY_KEY } from "./useSegmentsQuery";
import { USERS_COUNT_QUERY_KEY } from "./useUsersCountQuery";
import { USERS_QUERY_KEY } from "./useUsersQuery";

export interface UploadCsvMutationParams {
  segmentId: string;
  data: FormData;
  append?: boolean;
}

// Define the mutation function type
type UploadCsvMutationFn = (params: UploadCsvMutationParams) => Promise<void>;

export function useUploadCsvMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, UploadCsvMutationParams>,
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, UploadCsvMutationParams> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: UploadCsvMutationFn = async ({
    segmentId,
    data,
    append,
  }) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for CSV upload");
    }
    const workspaceId = workspace.value.id;

    await axios.post(`${baseApiUrl}/segments/upload-csv`, data, {
      headers: {
        ...authHeaders,
        [WORKSPACE_ID_HEADER]: workspaceId,
        [SEGMENT_ID_HEADER]: segmentId,
        [MANUAL_SEGMENT_APPEND_HEADER]: String(Boolean(append)),
        // Axios will automatically set Content-Type to multipart/form-data for FormData
      },
    });
  };

  const mutation = useMutation<void, AxiosError, UploadCsvMutationParams>({
    mutationFn,
    ...options,
    onSuccess: (responseData, variables, context) => {
      options?.onSuccess?.(responseData, variables, context);

      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        // Invalidate the specific segment query
        queryClient.invalidateQueries({
          queryKey: [
            SEGMENTS_QUERY_KEY,
            { workspaceId, ids: [variables.segmentId] },
          ],
        });
        // Invalidate the general segments list query
        queryClient.invalidateQueries({
          queryKey: [SEGMENTS_QUERY_KEY, { workspaceId }],
        });
        // Invalidate users and users count queries
        queryClient.invalidateQueries({
          queryKey: [USERS_QUERY_KEY, workspaceId],
        });
        queryClient.invalidateQueries({
          queryKey: [USERS_COUNT_QUERY_KEY, workspaceId],
        });
      }
    },
  });

  return mutation;
}
