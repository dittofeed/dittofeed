import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  completeCatalogSync,
  deleteCatalog,
  deleteCatalogCollection,
  deleteCatalogItems,
  listCatalogCategories,
  listCatalogCollections,
  listCatalogItems,
  listCatalogs,
  listCatalogSyncRuns,
  previewCatalogCollection,
  readCatalog,
  upsertCatalog,
  upsertCatalogCollection,
  upsertCatalogItems,
} from "backend-lib/src/catalogs";
import { syncCatalog } from "backend-lib/src/catalogSync";
import { FastifyInstance } from "fastify";
import {
  CatalogError,
  CatalogErrorResponse,
  CompleteCatalogSyncRequest,
  CompleteCatalogSyncResponse,
  DeleteCatalogCollectionRequest,
  DeleteCatalogItemsRequest,
  DeleteCatalogItemsResponse,
  DeleteCatalogRequest,
  PreviewCatalogCollectionRequest,
  PreviewCatalogCollectionResponse,
  ReadCatalogCategoriesRequest,
  ReadCatalogCategoriesResponse,
  ReadCatalogCollectionsRequest,
  ReadCatalogCollectionsResponse,
  ReadCatalogItemsRequest,
  ReadCatalogItemsResponse,
  ReadCatalogsRequest,
  ReadCatalogsResponse,
  ReadCatalogSyncRunsRequest,
  ReadCatalogSyncRunsResponse,
  SyncCatalogRequest,
  SyncCatalogResponse,
  UpsertCatalogCollectionResource,
  UpsertCatalogCollectionResponse,
  UpsertCatalogItemsRequest,
  UpsertCatalogItemsResponse,
  UpsertCatalogResource,
  UpsertCatalogResponse,
} from "isomorphic-lib/src/catalog";
import { EmptyResponse } from "isomorphic-lib/src/types";

const errorResponses = {
  400: CatalogErrorResponse,
  404: CatalogErrorResponse,
  409: CatalogErrorResponse,
};

function errorStatus(error: CatalogError): 400 | 404 | 409 {
  switch (error.code) {
    case "notFound":
      return 404;
    case "conflict":
      return 409;
    default:
      return 400;
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
export default async function catalogsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "List catalogs in a workspace.",
        tags: ["Catalogs"],
        querystring: ReadCatalogsRequest,
        response: {
          200: ReadCatalogsResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.query;
      const catalogs = await listCatalogs({ workspaceId });
      return reply.status(200).send({ catalogs });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/one",
    {
      schema: {
        description: "Read a single catalog, including its sync freshness.",
        tags: ["Catalogs"],
        querystring: DeleteCatalogRequest,
        response: {
          200: UpsertCatalogResponse,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, name } = request.query;
      const result = await readCatalog({ workspaceId, name });
      if (result.isErr()) {
        return reply.status(errorStatus(result.error)).send(result.error);
      }
      return reply.status(200).send({ catalog: result.value });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Create or update a catalog.",
        tags: ["Catalogs"],
        body: UpsertCatalogResource,
        response: {
          200: UpsertCatalogResponse,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const {
        workspaceId,
        name,
        sourceType,
        currency,
        locale,
        sourceUrl,
        feedFormat,
        syncIntervalMinutes,
        syncEnabled,
      } = request.body;
      const result = await upsertCatalog({
        workspaceId,
        name,
        sourceType,
        currency,
        locale,
        sourceUrl,
        feedFormat,
        syncIntervalMinutes,
        syncEnabled,
      });
      if (result.isErr()) {
        return reply.status(errorStatus(result.error)).send(result.error);
      }
      return reply.status(200).send({ catalog: result.value });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description: "Delete a catalog and all of its items and collections.",
        tags: ["Catalogs"],
        body: DeleteCatalogRequest,
        response: {
          204: EmptyResponse,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, name } = request.body;
      const result = await deleteCatalog({ workspaceId, name });
      if (result.isErr()) {
        return reply.status(errorStatus(result.error)).send(result.error);
      }
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/items",
    {
      schema: {
        description: "List items in a catalog.",
        tags: ["Catalogs"],
        querystring: ReadCatalogItemsRequest,
        response: {
          200: ReadCatalogItemsResponse,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const {
        workspaceId,
        catalogName,
        limit,
        cursor,
        itemType,
        parentItemId,
        status,
      } = request.query;
      const result = await listCatalogItems({
        workspaceId,
        catalogName,
        limit,
        cursor,
        itemType,
        parentItemId,
        status,
      });
      if (result.isErr()) {
        return reply.status(errorStatus(result.error)).send(result.error);
      }
      return reply.status(200).send(result.value);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/categories",
    {
      schema: {
        description: "List the category names present in a catalog.",
        tags: ["Catalogs"],
        querystring: ReadCatalogCategoriesRequest,
        response: {
          200: ReadCatalogCategoriesResponse,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, catalogName } = request.query;
      const result = await listCatalogCategories({ workspaceId, catalogName });
      if (result.isErr()) {
        return reply.status(errorStatus(result.error)).send(result.error);
      }
      return reply.status(200).send({ categories: result.value });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/sync-runs",
    {
      schema: {
        description:
          "List recent sync runs for a catalog, so a stale or failing feed is visible.",
        tags: ["Catalogs"],
        querystring: ReadCatalogSyncRunsRequest,
        response: {
          200: ReadCatalogSyncRunsResponse,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, catalogName, limit } = request.query;
      const result = await listCatalogSyncRuns({
        workspaceId,
        catalogName,
        limit,
      });
      if (result.isErr()) {
        return reply.status(errorStatus(result.error)).send(result.error);
      }
      return reply.status(200).send({ runs: result.value });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/items",
    {
      schema: {
        description:
          "Create or update catalog items. Set `replace` to delete items missing from the request.",
        tags: ["Catalogs"],
        body: UpsertCatalogItemsRequest,
        response: {
          200: UpsertCatalogItemsResponse,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, catalogName, items, kind, replace, syncId } =
        request.body;
      const result = await upsertCatalogItems({
        workspaceId,
        catalogName,
        items,
        kind,
        replace,
        syncId,
      });
      if (result.isErr()) {
        return reply.status(errorStatus(result.error)).send(result.error);
      }
      return reply.status(200).send(result.value);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/items/complete",
    {
      schema: {
        description:
          "Finish a chunked catalog sync. Items the sync did not mention are archived rather than deleted, and removed once the stale grace period expires. Refuses to run when no item carries `syncId`, to protect against a mistyped id.",
        tags: ["Catalogs"],
        body: CompleteCatalogSyncRequest,
        response: {
          200: CompleteCatalogSyncResponse,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, catalogName, syncId } = request.body;
      const result = await completeCatalogSync({
        workspaceId,
        catalogName,
        syncId,
      });
      if (result.isErr()) {
        return reply.status(errorStatus(result.error)).send(result.error);
      }
      return reply.status(200).send(result.value);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/items/sync",
    {
      schema: {
        description:
          "Pull a feed-sourced catalog now instead of waiting for the scheduler. Fetches `sourceUrl`, upserts the items, and archives items the feed no longer carries. A failed pull leaves the catalog untouched and marks it stale.",
        tags: ["Catalogs"],
        body: SyncCatalogRequest,
        response: {
          200: SyncCatalogResponse,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, catalogName } = request.body;
      const result = await syncCatalog({ workspaceId, catalogName });
      if (result.isErr()) {
        const code: CatalogError["code"] =
          result.error.code === "notFound" ? "notFound" : "invalid";
        return reply
          .status(code === "notFound" ? 404 : 400)
          .send({ code, message: result.error.message });
      }
      return reply.status(200).send(result.value);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/items",
    {
      schema: {
        description: "Delete items from a catalog.",
        tags: ["Catalogs"],
        body: DeleteCatalogItemsRequest,
        response: {
          200: DeleteCatalogItemsResponse,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, catalogName, itemIds } = request.body;
      const result = await deleteCatalogItems({
        workspaceId,
        catalogName,
        itemIds,
      });
      if (result.isErr()) {
        return reply.status(errorStatus(result.error)).send(result.error);
      }
      return reply.status(200).send(result.value);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/collections",
    {
      schema: {
        description: "List catalog collections in a workspace.",
        tags: ["Catalogs"],
        querystring: ReadCatalogCollectionsRequest,
        response: {
          200: ReadCatalogCollectionsResponse,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.query;
      const collections = await listCatalogCollections({ workspaceId });
      return reply.status(200).send({ collections });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/collections",
    {
      schema: {
        description: "Create or update a catalog collection.",
        tags: ["Catalogs"],
        body: UpsertCatalogCollectionResource,
        response: {
          200: UpsertCatalogCollectionResponse,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, name, catalogName, definition } = request.body;
      const result = await upsertCatalogCollection({
        workspaceId,
        name,
        catalogName,
        definition,
      });
      if (result.isErr()) {
        return reply.status(errorStatus(result.error)).send(result.error);
      }
      return reply.status(200).send({ collection: result.value });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/collections",
    {
      schema: {
        description: "Delete a catalog collection.",
        tags: ["Catalogs"],
        body: DeleteCatalogCollectionRequest,
        response: {
          204: EmptyResponse,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, name } = request.body;
      const result = await deleteCatalogCollection({ workspaceId, name });
      if (result.isErr()) {
        return reply.status(errorStatus(result.error)).send(result.error);
      }
      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/collections/preview",
    {
      schema: {
        description:
          "Render a catalog collection definition without saving it.",
        tags: ["Catalogs"],
        body: PreviewCatalogCollectionRequest,
        response: {
          200: PreviewCatalogCollectionResponse,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, catalogName, definition } = request.body;
      const result = await previewCatalogCollection({
        workspaceId,
        catalogName,
        definition,
      });
      if (result.isErr()) {
        return reply.status(errorStatus(result.error)).send(result.error);
      }
      return reply.status(200).send(result.value);
    },
  );
}
