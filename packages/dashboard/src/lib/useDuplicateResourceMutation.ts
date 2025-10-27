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
  DuplicateResourceRequest,
  DuplicateResourceResponse,
  DuplicateResourceTypeEnum,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { JOURNEYS_QUERY_KEY } from "./constants";
import { BROADCASTS_QUERY_KEY } from "./useBroadcastsQuery";
import { SEGMENTS_QUERY_KEY } from "./useSegmentsQuery";
import { USER_PROPERTIES_QUERY_KEY } from "./useUserPropertiesQuery";

const MESSAGE_TEMPLATES_QUERY_KEY = "messageTemplates";

export type DuplicateResourceMutationParams = Omit<
  DuplicateResourceRequest,
  "workspaceId"
>;

type DuplicateResourceMutationFn = (
  data: DuplicateResourceMutationParams,
) => Promise<DuplicateResourceResponse>;

export function useDuplicateResourceMutation(
  options?: Omit<
    UseMutationOptions<
      DuplicateResourceResponse,
      AxiosError,
      DuplicateResourceMutationParams
    >,
    "mutationFn"
  >,
): UseMutationResult<
  DuplicateResourceResponse,
  AxiosError,
  DuplicateResourceMutationParams
> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: DuplicateResourceMutationFn = async (data) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for resource duplication");
    }
    const workspaceId = workspace.value.id;

    const response = await axios.post(
      `${baseApiUrl}/resources/duplicate`,
      {
        ...data,
        workspaceId,
      } satisfies DuplicateResourceRequest,
      {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      },
    );

    const validatedData = unwrap(
      schemaValidateWithErr(response.data, DuplicateResourceResponse),
    );

    return validatedData;
  };

  const mutation = useMutation<
    DuplicateResourceResponse,
    AxiosError,
    DuplicateResourceMutationParams
  >({
    mutationFn,
    ...options,
    onSuccess: (savedData, variables, context) => {
      options?.onSuccess?.(savedData, variables, context);

      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;

        // Invalidate the appropriate query based on resource type
        switch (variables.resourceType) {
          case DuplicateResourceTypeEnum.Segment:
            if (savedData.id) {
              queryClient.invalidateQueries({
                queryKey: [
                  SEGMENTS_QUERY_KEY,
                  { workspaceId, ids: [savedData.id] },
                ],
              });
            }
            queryClient.invalidateQueries({
              queryKey: [SEGMENTS_QUERY_KEY, { workspaceId }],
            });
            break;
          case DuplicateResourceTypeEnum.MessageTemplate:
            if (savedData.id) {
              queryClient.invalidateQueries({
                queryKey: [
                  MESSAGE_TEMPLATES_QUERY_KEY,
                  { workspaceId, ids: [savedData.id] },
                ],
              });
            }
            queryClient.invalidateQueries({
              queryKey: [MESSAGE_TEMPLATES_QUERY_KEY, { workspaceId }],
            });
            break;
          case DuplicateResourceTypeEnum.Journey:
            if (savedData.id) {
              queryClient.invalidateQueries({
                queryKey: [
                  JOURNEYS_QUERY_KEY,
                  { workspaceId, ids: [savedData.id] },
                ],
              });
            }
            queryClient.invalidateQueries({
              queryKey: [JOURNEYS_QUERY_KEY, { workspaceId }],
            });
            break;
          case DuplicateResourceTypeEnum.Broadcast:
            if (savedData.id) {
              queryClient.invalidateQueries({
                queryKey: [
                  BROADCASTS_QUERY_KEY,
                  { workspaceId, ids: [savedData.id] },
                ],
              });
            }
            queryClient.invalidateQueries({
              queryKey: [BROADCASTS_QUERY_KEY, { workspaceId }],
            });
            break;
          case DuplicateResourceTypeEnum.UserProperty:
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
            break;
        }
      }
    },
  });

  return mutation;
}
