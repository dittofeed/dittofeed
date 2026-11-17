import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import axios from "axios";
import {
  ReadCatalogItemsRequest,
  ReadCatalogItemsResponse,
} from "isomorphic-lib/src/catalog";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { CompletionStatus } from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const CATALOG_ITEMS_QUERY_KEY = "catalog-items";

/**
 * Lists items of a catalog. Items are paged by cursor and default to published,
 * non-archived rows, so a catalog with archived leftovers still reads correctly.
 */
export function useCatalogItemsQuery(
  params: Omit<ReadCatalogItemsRequest, "workspaceId"> | undefined,
  options?: Omit<
    UseQueryOptions<ReadCatalogItemsResponse>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<ReadCatalogItemsResponse> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for catalog items query");
  }

  const workspaceId = workspace.value.id;

  return useQuery<ReadCatalogItemsResponse>({
    queryKey: [CATALOG_ITEMS_QUERY_KEY, { ...params, workspaceId }],
    queryFn: async () => {
      const response = await axios.get(`${baseApiUrl}/catalogs/items`, {
        params: { ...params, workspaceId },
        headers: authHeaders,
      });
      return unwrap(
        schemaValidateWithErr(response.data, ReadCatalogItemsResponse),
      );
    },
    enabled: Boolean(params?.catalogName),
    ...options,
  });
}
