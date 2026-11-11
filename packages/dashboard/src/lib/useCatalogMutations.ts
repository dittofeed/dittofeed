import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CatalogErrorResponse,
  DeleteCatalogCollectionRequest,
  DeleteCatalogRequest,
  PreviewCatalogCollectionRequest,
  PreviewCatalogCollectionResponse,
  SyncCatalogRequest,
  SyncCatalogResponse,
  UpsertCatalogCollectionResource,
  UpsertCatalogCollectionResponse,
  UpsertCatalogResource,
  UpsertCatalogResponse,
} from "isomorphic-lib/src/catalog";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { CompletionStatus } from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { CATALOG_COLLECTIONS_QUERY_KEY } from "./useCatalogCollectionsQuery";
import { CATALOG_ITEMS_QUERY_KEY } from "./useCatalogItemsQuery";
import { CATALOG_QUERY_KEY } from "./useCatalogQuery";
import { CATALOGS_QUERY_KEY } from "./useCatalogsQuery";
import { CATALOG_SYNC_RUNS_QUERY_KEY } from "./useCatalogSyncRunsQuery";

/**
 * Catalog mutations live together because they all invalidate the same small
 * set of caches; splitting them one file per verb hid that relationship.
 */

function useWorkspaceId(hookName: string): string {
  const { workspace } = useAppStorePick(["workspace"]);
  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error(`Workspace not available for ${hookName}`);
  }
  return workspace.value.id;
}

export function useUpsertCatalogMutation(
  options?: Omit<
    UseMutationOptions<
      UpsertCatalogResponse,
      AxiosError<CatalogErrorResponse>,
      Omit<UpsertCatalogResource, "workspaceId">
    >,
    "mutationFn"
  >,
): UseMutationResult<
  UpsertCatalogResponse,
  AxiosError<CatalogErrorResponse>,
  Omit<UpsertCatalogResource, "workspaceId">
> {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId("catalog mutation");
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  return useMutation<
    UpsertCatalogResponse,
    AxiosError<CatalogErrorResponse>,
    Omit<UpsertCatalogResource, "workspaceId">
  >({
    mutationFn: async (data) => {
      const response = await axios.put(
        `${baseApiUrl}/catalogs`,
        { ...data, workspaceId },
        { headers: { "Content-Type": "application/json", ...authHeaders } },
      );
      return unwrap(
        schemaValidateWithErr(response.data, UpsertCatalogResponse),
      );
    },
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);
      queryClient.invalidateQueries({
        queryKey: [CATALOGS_QUERY_KEY, { workspaceId }],
      });
      queryClient.invalidateQueries({
        queryKey: [CATALOG_QUERY_KEY, { workspaceId }],
      });
    },
  });
}

export function useDeleteCatalogMutation(
  options?: Omit<
    UseMutationOptions<undefined, AxiosError<CatalogErrorResponse>, string>,
    "mutationFn"
  >,
): UseMutationResult<undefined, AxiosError<CatalogErrorResponse>, string> {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId("catalog delete");
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  return useMutation<undefined, AxiosError<CatalogErrorResponse>, string>({
    mutationFn: async (name) => {
      // The route declares a DELETE body, so the name travels in `data` rather
      // than the query string.
      await axios.delete(`${baseApiUrl}/catalogs`, {
        data: { workspaceId, name } satisfies DeleteCatalogRequest,
        headers: { "Content-Type": "application/json", ...authHeaders },
      });
      return undefined;
    },
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);
      queryClient.invalidateQueries({
        queryKey: [CATALOGS_QUERY_KEY, { workspaceId }],
      });
      queryClient.invalidateQueries({
        queryKey: [CATALOG_QUERY_KEY, { workspaceId }],
      });
    },
  });
}

export function useSyncCatalogMutation(
  options?: Omit<
    UseMutationOptions<
      SyncCatalogResponse,
      AxiosError<CatalogErrorResponse>,
      string
    >,
    "mutationFn"
  >,
): UseMutationResult<
  SyncCatalogResponse,
  AxiosError<CatalogErrorResponse>,
  string
> {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId("catalog sync");
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  return useMutation<
    SyncCatalogResponse,
    AxiosError<CatalogErrorResponse>,
    string
  >({
    mutationFn: async (catalogName) => {
      const response = await axios.post(
        `${baseApiUrl}/catalogs/items/sync`,
        { workspaceId, catalogName } satisfies SyncCatalogRequest,
        { headers: { "Content-Type": "application/json", ...authHeaders } },
      );
      return unwrap(schemaValidateWithErr(response.data, SyncCatalogResponse));
    },
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);
      queryClient.invalidateQueries({
        queryKey: [CATALOG_QUERY_KEY, { workspaceId }],
      });
      queryClient.invalidateQueries({
        queryKey: [CATALOG_ITEMS_QUERY_KEY, { workspaceId }],
      });
      queryClient.invalidateQueries({
        queryKey: [CATALOG_SYNC_RUNS_QUERY_KEY, { workspaceId }],
      });
      // A pull can change which items a collection matches.
      queryClient.invalidateQueries({
        queryKey: [CATALOG_COLLECTIONS_QUERY_KEY, { workspaceId }],
      });
    },
  });
}

export function useUpsertCatalogCollectionMutation(
  options?: Omit<
    UseMutationOptions<
      UpsertCatalogCollectionResponse,
      AxiosError<CatalogErrorResponse>,
      Omit<UpsertCatalogCollectionResource, "workspaceId">
    >,
    "mutationFn"
  >,
): UseMutationResult<
  UpsertCatalogCollectionResponse,
  AxiosError<CatalogErrorResponse>,
  Omit<UpsertCatalogCollectionResource, "workspaceId">
> {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId("catalog collection mutation");
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  return useMutation<
    UpsertCatalogCollectionResponse,
    AxiosError<CatalogErrorResponse>,
    Omit<UpsertCatalogCollectionResource, "workspaceId">
  >({
    mutationFn: async (data) => {
      const response = await axios.put(
        `${baseApiUrl}/catalogs/collections`,
        { ...data, workspaceId },
        { headers: { "Content-Type": "application/json", ...authHeaders } },
      );
      return unwrap(
        schemaValidateWithErr(response.data, UpsertCatalogCollectionResponse),
      );
    },
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);
      queryClient.invalidateQueries({
        queryKey: [CATALOG_COLLECTIONS_QUERY_KEY, { workspaceId }],
      });
    },
  });
}

export function useDeleteCatalogCollectionMutation(
  options?: Omit<
    UseMutationOptions<undefined, AxiosError<CatalogErrorResponse>, string>,
    "mutationFn"
  >,
): UseMutationResult<undefined, AxiosError<CatalogErrorResponse>, string> {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId("catalog collection delete");
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  return useMutation<undefined, AxiosError<CatalogErrorResponse>, string>({
    mutationFn: async (name) => {
      await axios.delete(`${baseApiUrl}/catalogs/collections`, {
        data: { workspaceId, name } satisfies DeleteCatalogCollectionRequest,
        headers: { "Content-Type": "application/json", ...authHeaders },
      });
      return undefined;
    },
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);
      queryClient.invalidateQueries({
        queryKey: [CATALOG_COLLECTIONS_QUERY_KEY, { workspaceId }],
      });
    },
  });
}

/**
 * Runs a collection definition without saving it. Preview is how an author
 * confirms a filter selects the products they meant before a send goes out.
 */
export function usePreviewCatalogCollectionMutation(
  options?: Omit<
    UseMutationOptions<
      PreviewCatalogCollectionResponse,
      AxiosError<CatalogErrorResponse>,
      Omit<PreviewCatalogCollectionRequest, "workspaceId">
    >,
    "mutationFn"
  >,
): UseMutationResult<
  PreviewCatalogCollectionResponse,
  AxiosError<CatalogErrorResponse>,
  Omit<PreviewCatalogCollectionRequest, "workspaceId">
> {
  const workspaceId = useWorkspaceId("catalog collection preview");
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  return useMutation<
    PreviewCatalogCollectionResponse,
    AxiosError<CatalogErrorResponse>,
    Omit<PreviewCatalogCollectionRequest, "workspaceId">
  >({
    mutationFn: async (data) => {
      const response = await axios.post(
        `${baseApiUrl}/catalogs/collections/preview`,
        { ...data, workspaceId },
        { headers: { "Content-Type": "application/json", ...authHeaders } },
      );
      return unwrap(
        schemaValidateWithErr(response.data, PreviewCatalogCollectionResponse),
      );
    },
    ...options,
  });
}
