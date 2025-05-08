import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import axios from "axios";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  GetMessageTemplatesRequest,
  GetMessageTemplatesResponse,
} from "isomorphic-lib/src/types";

import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { useAppStorePick } from "./appStore";

/**
 * Custom hook for fetching message templates using the GET /api/templates endpoint
 */
export function useMessageTemplatesQuery<
  TData = GetMessageTemplatesResponse["templates"],
>(
  params?: Omit<GetMessageTemplatesRequest, "workspaceId">,
  options?: Omit<
    UseQueryOptions<
      GetMessageTemplatesResponse["templates"], // Query function returns MessageTemplateResource[]
      Error,
      TData
    >,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for message templates query");
  }

  const workspaceId = workspace.value.id;
  // Include workspaceId and any other params in the query key
  const queryKey = ["messageTemplates", { ...params, workspaceId }];
  const baseApiUrl = useBaseApiUrl();

  const queryResult = useQuery<
    GetMessageTemplatesResponse["templates"], // Query function returns MessageTemplateResource[]
    Error,
    TData
  >({
    queryKey,
    queryFn: async (): Promise<GetMessageTemplatesResponse["templates"]> => {
      try {
        const response = await axios.get(`${baseApiUrl}/content/templates`, {
          params: {
            ...params,
            workspaceId,
          },
          headers: authHeaders,
        });

        const validatedResponse = unwrap(
          schemaValidateWithErr(response.data, GetMessageTemplatesResponse),
        );
        // The endpoint returns { templates: [...] }, so we extract the array
        return validatedResponse.templates;
      } catch (error) {
        console.error("Failed to fetch message templates", error);
        // Re-throw or handle error as appropriate for your application
        throw error;
      }
    },
    ...options,
  });

  return queryResult;
}
