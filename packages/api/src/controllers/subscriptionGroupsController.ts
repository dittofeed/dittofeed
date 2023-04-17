import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import prisma from "backend-lib/src/prisma";
import {
  SubscriptionGroupResource,
  UpsertSubscriptionGroupResource,
} from "backend-lib/src/types";
import { FastifyInstance } from "fastify";
import csvParser from "csv-parser";
import { Readable } from "stream";
import logger from "backend-lib/src/logger";

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

  fastify
    .withTypeProvider<TypeBoxTypeProvider>()
    .post("/upload-csv", {}, async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({
          message: "Missing file.",
        });
      }
      const { workspaceId } = request.body as { workspaceId: string };

      // Convert the file buffer to a readable stream
      const csvStream = bufferToStream(await data.toBuffer());

      const rows: any[] = [];

      // Parse the CSV stream into a JavaScript object with an array of rows
      await new Promise<void>((resolve, reject) => {
        csvStream
          .pipe(csvParser())
          .on("data", (row) => rows.push(row))
          .on("end", () => {
            logger().debug(
              `Parsed ${rows.length} rows for workspace: ${workspaceId}`
            );
            resolve();
          })
          .on("error", (error) => {
            reject(error);
          });
      });

      return { statusCode: 200 };
    });
}
