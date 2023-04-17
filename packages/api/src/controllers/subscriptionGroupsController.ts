import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { ValueError } from "@sinclair/typebox/errors";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import {
  SubscriptionGroupResource,
  UpsertSubscriptionGroupResource,
  UserUploadRow,
  WorkspaceId,
} from "backend-lib/src/types";
import csvParser from "csv-parser";
import { FastifyInstance } from "fastify";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { Readable } from "stream";

const bufferToStream = (buffer: Buffer): Readable => {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
};

// eslint-disable-next-line @typescript-eslint/require-await
export default async function subscriptionGroupsController(
  fastify: FastifyInstance
) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Create or update a journey.",
        body: UpsertSubscriptionGroupResource,
        response: {
          200: SubscriptionGroupResource,
        },
      },
    },
    async (request, reply) => {
      const { id, name, type, workspaceId } = request.body;

      await prisma().subscriptionGroup.upsert({
        where: {
          id,
        },
        create: {
          name,
          type,
          workspaceId,
          id,
        },
        update: {
          name,
          type,
        },
      });

      const resource: SubscriptionGroupResource = {
        id,
        name,
        workspaceId,
        type,
      };
      return reply.status(200).send(resource);
    }
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/upload-csv",
    {
      schema: {
        headers: Type.Object({
          [WORKSPACE_ID_HEADER]: WorkspaceId,
        }),
      },
    },
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({
          message: "Missing file.",
        });
      }

      // Convert the file buffer to a readable stream
      const csvStream = bufferToStream(await data.toBuffer());
      const workspaceId = request.headers[WORKSPACE_ID_HEADER];

      // Parse the CSV stream into a JavaScript object with an array of rows
      try {
        await new Promise<UserUploadRow[]>((resolve, reject) => {
          const parsingErrors: ValueError[] = [];
          const rows: UserUploadRow[] = [];

          csvStream
            .pipe(csvParser({ headers: true }))
            .on("data", (row) => {
              const parsed = schemaValidate(row, UserUploadRow);
              if (parsed.isOk()) {
                rows.push(parsed.value);
              } else {
                parsed.error.forEach((error) => parsingErrors.push(error));
              }
            })
            .on("end", () => {
              logger().debug(
                `Parsed ${rows.length} rows for workspace: ${workspaceId}`
              );
              if (parsingErrors.length) {
                reject(parsingErrors);
              } else {
                resolve(rows);
              }
            })
            .on("error", (error) => {
              reject(error);
            });
        });
        const response = await reply.status(200).send();
        return response;
      } catch (e) {
        return reply.status(400).send();
      }
    }
  );
}
