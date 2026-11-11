import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import axios from "axios";
import { ReadCatalogsResponse } from "isomorphic-lib/src/catalog";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { CompletionStatus } from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const CATALOGS_QUERY_KEY = "catalogs";

/**
 * Lists every catalog in the workspace, including the freshness columns that
 * tell an operator whether the data behind a product block is current.
 */
export function useCatalogsQuery(
  options?: Omit<UseQueryOptions<ReadCatalogsResponse>, "queryKey" | "queryFn">,
): UseQueryResult<ReadCatalogsResponse> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for catalogs query");
  }

  const workspaceId = workspace.value.id;

  return useQuery<ReadCatalogsResponse>({
    queryKey: [CATALOGS_QUERY_KEY, { workspaceId }],
    queryFn: async () => {
      const response = await axios.get(`${baseApiUrl}/catalogs`, {
        params: { workspaceId },
        headers: authHeaders,
      });
      return unwrap(schemaValidateWithErr(response.data, ReadCatalogsResponse));
    },
    ...options,
  });
}
