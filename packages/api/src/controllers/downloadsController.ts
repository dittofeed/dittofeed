import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { Client } from "@temporalio/client";
import { randomUUID } from "crypto";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import logger from "backend-lib/src/logger";
import { csvDownloadWorkflow, generateCsvDownloadWorkflowId } from "backend-lib/src/downloads/csvDownloadWorkflow";
import { and, eq, desc } from "drizzle-orm";
import { FastifyInstance } from "fastify";

export interface CreateDownloadRequest {
  workspaceId: string;
  downloadType: string;
  name: string;
}

export interface CreateDownloadResponse {
  downloadId: string;
}

export interface GetDownloadsRequest {
  workspaceId: string;
  workspaceMemberId: string;
}

export interface GetDownloadsResponse {
  downloads: Array<{
    id: string;
    name: string;
    status: string;
    downloadUrl?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface GetDownloadRequest {
  downloadId: string;
}

export interface GetDownloadResponse {
  id: string;
  name: string;
  status: string;
  downloadUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const CreateDownloadRequestSchema = Type.Object({
  workspaceId: Type.String(),
  downloadType: Type.String(),
  name: Type.String(),
});

const CreateDownloadResponseSchema = Type.Object({
  downloadId: Type.String(),
});

const GetDownloadsRequestSchema = Type.Object({
  workspaceId: Type.String(),
  workspaceMemberId: Type.String(),
});

const GetDownloadsResponseSchema = Type.Object({
  downloads: Type.Array(
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      status: Type.String(),
      downloadUrl: Type.Optional(Type.String()),
      error: Type.Optional(Type.String()),
      createdAt: Type.String(),
      updatedAt: Type.String(),
    }),
  ),
});

const GetDownloadResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  status: Type.String(),
  downloadUrl: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

// eslint-disable-next-line @typescript-eslint/require-await
export default async function downloadsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/",
    {
      schema: {
        description: "Create a new download.",
        tags: ["Downloads"],
        body: CreateDownloadRequestSchema,
        response: {
          200: CreateDownloadResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, downloadType, name } = request.body;
      const downloadId = randomUUID();

      logger().info("Creating new download", {
        downloadId,
        workspaceId,
        downloadType,
        name,
      });

      // Validate download type
      const validDownloadTypes = ["segments", "users", "events"];
      if (!validDownloadTypes.includes(downloadType)) {
        return reply.status(400).send("Invalid download type");
      }

      // Get workspace member ID from headers or request context
      // Note: This would typically come from authentication middleware
      const workspaceMemberId = request.headers["workspace-member-id"] as string;
      if (!workspaceMemberId) {
        return reply.status(401).send("Workspace member ID is required");
      }

      try {
        // Create download record
        await db().insert(schema.download).values({
          id: downloadId,
          workspaceId,
          workspaceMemberId,
          name,
          status: "PENDING",
        });

        // Start Temporal workflow
        const client = new Client();
        const workflowId = generateCsvDownloadWorkflowId(downloadId);
        
        await client.workflow.start(csvDownloadWorkflow, {
          taskQueue: "default",
          workflowId,
          args: [
            {
              downloadId,
              workspaceId,
              downloadType,
            },
          ],
        });

        logger().info("Started CSV download workflow", {
          downloadId,
          workspaceId,
          downloadType,
          workflowId,
        });

        return reply.status(200).send({ downloadId });
      } catch (error) {
        logger().error("Failed to create download", {
          downloadId,
          workspaceId,
          downloadType,
          err: error,
        });
        return reply.status(500).send("Failed to create download");
      }
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/",
    {
      schema: {
        description: "Get all downloads for a workspace member.",
        tags: ["Downloads"],
        querystring: GetDownloadsRequestSchema,
        response: {
          200: GetDownloadsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, workspaceMemberId } = request.query;

      const downloadModels = await db().query.download.findMany({
        where: and(
          eq(schema.download.workspaceId, workspaceId),
          eq(schema.download.workspaceMemberId, workspaceMemberId),
        ),
        orderBy: [desc(schema.download.createdAt)],
        limit: 100, // Limit to most recent 100 downloads
      });

      const downloads = downloadModels.map((download) => ({
        id: download.id,
        name: download.name,
        status: download.status,
        downloadUrl: download.downloadUrl ?? undefined,
        error: download.error ?? undefined,
        createdAt: download.createdAt.toISOString(),
        updatedAt: download.updatedAt.toISOString(),
      }));

      return reply.status(200).send({ downloads });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/:downloadId",
    {
      schema: {
        description: "Get a specific download by ID.",
        tags: ["Downloads"],
        params: Type.Object({
          downloadId: Type.String(),
        }),
        response: {
          200: GetDownloadResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { downloadId } = request.params;

      const download = await db().query.download.findFirst({
        where: eq(schema.download.id, downloadId),
      });

      if (!download) {
        return reply.status(404).send({
          error: "Download not found",
        });
      }

      return reply.status(200).send({
        id: download.id,
        name: download.name,
        status: download.status,
        downloadUrl: download.downloadUrl ?? undefined,
        error: download.error ?? undefined,
        createdAt: download.createdAt.toISOString(),
        updatedAt: download.updatedAt.toISOString(),
      });
    },
  );
}