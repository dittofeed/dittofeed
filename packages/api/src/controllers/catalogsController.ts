import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  deleteCatalog,
  deleteCatalogCollection,
  deleteCatalogItems,
  listCatalogCollections,
  listCatalogItems,
  listCatalogs,
  previewCatalogCollection,
  upsertCatalog,
  upsertCatalogCollection,
  upsertCatalogItems,
} from "backend-lib/src/catalogs";
import { FastifyInstance } from "fastify";
import {
  CatalogError,
  DeleteCatalogCollectionRequest,
  DeleteCatalogItemsRequest,
  DeleteCatalogItemsResponse,
  DeleteCatalogRequest,
  PreviewCatalogCollectionRequest,
  PreviewCatalogCollectionResponse,
  ReadCatalogCollectionsRequest,
  ReadCatalogCollectionsResponse,
  ReadCatalogItemsRequest,
  ReadCatalogItemsResponse,
  ReadCatalogsRequest,
  ReadCatalogsResponse,
  UpsertCatalogCollectionResource,
  UpsertCatalogCollectionResponse,
  UpsertCatalogItemsRequest,
  UpsertCatalogItemsResponse,
  UpsertCatalogResource,
  UpsertCatalogResponse,
} from "isomorphic-lib/src/catalog";
import { EmptyResponse } from "isomorphic-lib/src/types";

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

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Create or rename a catalog.",
        tags: ["Catalogs"],
        body: UpsertCatalogResource,
        response: {
          200: UpsertCatalogResponse,
          400: CatalogError,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, name } = request.body;
      const catalog = await upsertCatalog({ workspaceId, name });
      return reply.status(200).send({ catalog });
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
          404: CatalogError,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, name } = request.body;
      const result = await deleteCatalog({ workspaceId, name });
      if (result.isErr()) {
        return reply.status(404).send(result.error);
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
          404: CatalogError,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, catalogName, limit, cursor } = request.query;
      const result = await listCatalogItems({
        workspaceId,
        catalogName,
        limit,
        cursor,
      });
      if (result.isErr()) {
        return reply.status(404).send(result.error);
      }
      return reply.status(200).send(result.value);
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
          400: CatalogError,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, catalogName, items, replace } = request.body;
      const result = await upsertCatalogItems({
        workspaceId,
        catalogName,
        items,
        replace,
      });
      if (result.isErr()) {
        return reply.status(400).send(result.error);
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
          404: CatalogError,
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
        return reply.status(404).send(result.error);
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
          400: CatalogError,
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
        return reply.status(400).send(result.error);
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
          404: CatalogError,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, name } = request.body;
      const result = await deleteCatalogCollection({ workspaceId, name });
      if (result.isErr()) {
        return reply.status(404).send(result.error);
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
          404: CatalogError,
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
        return reply.status(404).send(result.error);
      }
      return reply.status(200).send(result.value);
    },
  );
}
