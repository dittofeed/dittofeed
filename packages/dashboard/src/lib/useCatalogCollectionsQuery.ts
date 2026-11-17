import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import axios from "axios";
import { ReadCatalogCollectionsResponse } from "isomorphic-lib/src/catalog";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { CompletionStatus } from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const CATALOG_COLLECTIONS_QUERY_KEY = "catalog-collections";

/**
 * Lists saved collections. A collection is a named, reusable product query that
 * templates render through `{% catalog_collection "<name>" as items %}`.
 */
export function useCatalogCollectionsQuery(
  options?: Omit<
    UseQueryOptions<ReadCatalogCollectionsResponse>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<ReadCatalogCollectionsResponse> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for catalog collections query");
  }

  const workspaceId = workspace.value.id;

  return useQuery<ReadCatalogCollectionsResponse>({
    queryKey: [CATALOG_COLLECTIONS_QUERY_KEY, { workspaceId }],
    queryFn: async () => {
      const response = await axios.get(`${baseApiUrl}/catalogs/collections`, {
        params: { workspaceId },
        headers: authHeaders,
      });
      return unwrap(
        schemaValidateWithErr(response.data, ReadCatalogCollectionsResponse),
      );
    },
    ...options,
  });
}
