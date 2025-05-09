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
  RenderMessageTemplateRequest,
  RenderMessageTemplateResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const RENDER_TEMPLATE_QUERY_KEY_PREFIX = "renderTemplate";

// Define a type for the query key to ensure stability and specificity
// Params are stringified to ensure stability for the query key
export type RenderTemplateQueryKey = readonly [
  typeof RENDER_TEMPLATE_QUERY_KEY_PREFIX,
  string, // workspaceId
  string, // stable string representation of relevant RenderMessageTemplateRequest parts
];

export type UseRenderTemplateQueryOptions = Omit<
  UseQueryOptions<
    RenderMessageTemplateResponse,
    Error,
    RenderMessageTemplateResponse,
    RenderTemplateQueryKey
  >,
  "queryKey" | "queryFn"
>;

export function useRenderTemplateQuery(
  // Pass only the parts of RenderMessageTemplateRequest that can change and define the query
  // workspaceId will be sourced from the store
  params: Omit<RenderMessageTemplateRequest, "workspaceId"> | null,
  options?: UseRenderTemplateQueryOptions,
): UseQueryResult<RenderMessageTemplateResponse> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  // Create a stable string key from the variable parts of the request
  // This is crucial for correct query caching and re-fetching.
  // Only include parts that, when changed, should trigger a new render.
  const stableParamsKey = params
    ? JSON.stringify({
        channel: params.channel,
        userProperties: params.userProperties,
        tags: params.tags, // Ensure tags are consistently ordered or stringified if they vary
        contents: params.contents,
      })
    : "null";

  const queryKey: RenderTemplateQueryKey = [
    RENDER_TEMPLATE_QUERY_KEY_PREFIX,
    workspace.type === CompletionStatus.Successful ? workspace.value.id : "",
    stableParamsKey,
  ];

  const queryFn = async (): Promise<RenderMessageTemplateResponse> => {
    if (workspace.type !== CompletionStatus.Successful || !params) {
      // This state should ideally be handled by the `enabled` option
      throw new Error("Workspace or parameters not available for rendering");
    }
    const workspaceId = workspace.value.id;

    const fullRequestParams: RenderMessageTemplateRequest = {
      ...params,
      workspaceId,
    };

    const response = await axios.post<RenderMessageTemplateResponse>(
      `${baseApiUrl}/content/templates/render`,
      fullRequestParams,
      {
        headers: authHeaders,
      },
    );
    return unwrap(
      schemaValidateWithErr(response.data, RenderMessageTemplateResponse),
    );
  };

  const enabled =
    !!params &&
    workspace.type === CompletionStatus.Successful &&
    (options?.enabled === undefined || options.enabled);

  return useQuery({
    queryKey,
    queryFn,
    ...options,
    enabled,
  });
}
