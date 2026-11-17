import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import axios from "axios";
import { UpsertCatalogResponse } from "isomorphic-lib/src/catalog";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { CompletionStatus } from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const CATALOG_QUERY_KEY = "catalog";

/**
 * Reads one catalog. `name` is undefined while the route is still resolving, in
 * which case the request is not fired.
 */
export function useCatalogQuery(
  name: string | undefined,
  options?: Omit<
    UseQueryOptions<UpsertCatalogResponse>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<UpsertCatalogResponse> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for catalog query");
  }

  const workspaceId = workspace.value.id;

  return useQuery<UpsertCatalogResponse>({
    queryKey: [CATALOG_QUERY_KEY, { workspaceId, name }],
    queryFn: async () => {
      const response = await axios.get(`${baseApiUrl}/catalogs/one`, {
        params: { workspaceId, name },
        headers: authHeaders,
      });
      return unwrap(
        schemaValidateWithErr(response.data, UpsertCatalogResponse),
      );
    },
    enabled: Boolean(name),
    ...options,
  });
}
