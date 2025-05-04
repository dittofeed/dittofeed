import { UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import {
  GetMessageTemplatesRequest,
  MessageTemplateResource,
} from "isomorphic-lib/src/types";

import { useMessageTemplatesQuery } from "./useMessageTemplatesQuery";

// Define the specific desired output type for the data property
type SelectedData = MessageTemplateResource | null;

// Define the type fetched by the underlying query (array of templates)
type FetchedData = MessageTemplateResource[];

/**
 * Custom hook for fetching a single message template by ID using the underlying
 * useMessageTemplatesQuery hook.
 * Returns the message template resource directly, or null if not found/loading/error.
 */
export function useMessageTemplateQuery(
  // The ID of the message template to fetch
  templateId?: string,
  // Optional query options, excluding queryKey, queryFn, and select.
  // Caller can control 'enabled' directly.
  options?: Omit<
    UseQueryOptions<FetchedData, Error, SelectedData>,
    "queryKey" | "queryFn" | "select"
  >,
): UseQueryResult<SelectedData> {
  // Prepare the params for the underlying hook
  const params: Omit<GetMessageTemplatesRequest, "workspaceId"> = {
    ids: templateId ? [templateId] : [],
  };

  // Disable the query if templateId is not provided or if explicitly disabled by caller
  const enabled = templateId !== undefined && options?.enabled !== false;

  // Call the existing hook, explicitly providing generic types
  // TQueryFnData = FetchedData, TError = Error, TData = SelectedData
  const queryResult = useMessageTemplatesQuery<SelectedData>(params, {
    ...options,
    enabled,
    // Use select to pick the single template from the array
    select: (data: FetchedData | undefined): SelectedData => {
      if (!data) {
        return null;
      }
      // Since we queried by ID, we expect at most one result
      const template = data.find((t) => t.id === templateId);
      return template ?? null; // Return the found template or null
    },
  });

  // queryResult should now correctly be UseQueryResult<SelectedData, Error>
  return queryResult;
}
