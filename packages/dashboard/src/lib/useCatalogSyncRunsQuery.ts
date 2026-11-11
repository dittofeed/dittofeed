import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import axios from "axios";
import { ReadCatalogSyncRunsResponse } from "isomorphic-lib/src/catalog";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { CompletionStatus } from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const CATALOG_SYNC_RUNS_QUERY_KEY = "catalog-sync-runs";

/**
 * Lists recent sync runs of a catalog. This is how an operator distinguishes
 * "the feed is fine" from "the feed has been failing since Tuesday".
 */
export function useCatalogSyncRunsQuery(
  params: { catalogName: string | undefined; limit?: number },
  options?: Omit<
    UseQueryOptions<ReadCatalogSyncRunsResponse>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<ReadCatalogSyncRunsResponse> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for catalog sync runs query");
  }

  const workspaceId = workspace.value.id;

  return useQuery<ReadCatalogSyncRunsResponse>({
    queryKey: [CATALOG_SYNC_RUNS_QUERY_KEY, { ...params, workspaceId }],
    queryFn: async () => {
      const response = await axios.get(`${baseApiUrl}/catalogs/sync-runs`, {
        params: { ...params, workspaceId },
        headers: authHeaders,
      });
      return unwrap(
        schemaValidateWithErr(response.data, ReadCatalogSyncRunsResponse),
      );
    },
    enabled: Boolean(params.catalogName),
    ...options,
  });
}
