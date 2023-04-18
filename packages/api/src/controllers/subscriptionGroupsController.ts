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
import { findUserIdsByUserProperty } from "backend-lib/src/userEvents";
import csvParser from "csv-parser";
import { FastifyInstance } from "fastify";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { Readable } from "stream";
import { v4 as uuid } from "uuid";

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
        const rows = await new Promise<UserUploadRow[]>((resolve, reject) => {
          const parsingErrors: ValueError[] = [];
          const uploadedRows: UserUploadRow[] = [];

          csvStream
            .pipe(csvParser({ headers: true }))
            .on("data", (row) => {
              const parsed = schemaValidate(row, UserUploadRow);
              if (parsed.isOk()) {
                uploadedRows.push(parsed.value);
              } else {
                parsed.error.forEach((error) => parsingErrors.push(error));
              }
            })
            .on("end", () => {
              logger().debug(
                `Parsed ${uploadedRows.length} rows for workspace: ${workspaceId}`
              );
              if (parsingErrors.length) {
                reject(parsingErrors);
              } else {
                resolve(uploadedRows);
              }
            })
            .on("error", (error) => {
              reject(error);
            });
        });

        const emailsWithoutIds: Set<string> = new Set<string>();

        for (const row of rows) {
          if (row.email && !row.id) {
            emailsWithoutIds.add(row.email as string);
          }
        }

        const missingUserIdsByEmail = await findUserIdsByUserProperty({
          userPropertyName: "email",
          workspaceId,
          valueSet: emailsWithoutIds,
        });

        const events = [];
        for (const row of rows) {
          const userIds = missingUserIdsByEmail[row.email as string];
          const userId =
            (row.id as string | undefined) ??
            (userIds?.length ? userIds[0] : uuid());
        }

        const response = await reply.status(200).send();
        return response;
      } catch (e) {
        return reply.status(400).send({
          message: "misformatted file",
        });
      }
    }
  );
}
