import fastifyMultipart from "@fastify/multipart";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import prisma, { Prisma } from "backend-lib/src/prisma";
import { buildSegmentsFile, upsertSegment } from "backend-lib/src/segments";
import { FastifyInstance } from "fastify";
import {
  SEGMENT_ID_HEADER,
  WORKSPACE_ID_HEADER,
} from "isomorphic-lib/src/constants";
import {
  CsvUploadValidationError,
  DeleteSegmentRequest,
  EmptyResponse,
  SavedSegmentResource,
  SegmentDefinition,
  SegmentNodeType,
  UpsertSegmentResource,
  UserUploadRow,
  UserUploadRowErrors,
  WorkspaceId,
} from "isomorphic-lib/src/types";
import { Readable } from "stream";
import { CsvParseResult } from "../types";
import csvParser from "csv-parser";
import { err, ok } from "neverthrow";
import {
  schemaValidate,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import logger from "backend-lib/src/logger";
import { InsertUserEvent } from "backend-lib/src/userEvents";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function segmentsController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Create or update a user segment.",
        tags: ["Segments"],
        body: UpsertSegmentResource,
        response: {
          200: SavedSegmentResource,
        },
      },
    },
    async (request, reply) => {
      const resource = await upsertSegment(request.body);
      return reply.status(200).send(resource);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description: "Delete a segment.",
        tags: ["Segments"],
        body: DeleteSegmentRequest,
        response: {
          204: EmptyResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.body;

      try {
        await prisma().segmentAssignment.deleteMany({
          where: {
            segmentId: id,
          },
        });
        await prisma().segment.delete({
          where: {
            id,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          switch (e.code) {
            case "P2025":
              return reply.status(404).send();
            case "P2023":
              return reply.status(404).send();
          }
        }
        throw e;
      }

      return reply.status(204).send();
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/download",
    {
      schema: {
        description: "Download a csv containing segment assignments.",
        tags: ["Segments"],
        querystring: Type.Object({
          workspaceId: Type.String(),
        }),
        200: {
          type: "string",
          format: "binary",
        },
      },
    },

    async (request, reply) => {
      const { fileName, fileContent } = await buildSegmentsFile({
        workspaceId: request.query.workspaceId,
      });
      return reply
        .header("Content-Disposition", `attachment; filename=${fileName}`)
        .type("text/csv")
        .send(fileContent);
    },
  );

  await fastify.register(async (fastifyInner) => {
    await fastify.register(fastifyMultipart, {
      attachFieldsToBody: "keyValues",
    });

    fastifyInner.withTypeProvider<TypeBoxTypeProvider>().post(
      "/upload-csv",
      {
        schema: {
          // TODO upload files to S3 and use a presigned URL
          tags: ["Subscription Groups"],
          body: Type.Object({
            csv: Type.String(),
          }),
          headers: Type.Object({
            [WORKSPACE_ID_HEADER]: WorkspaceId,
            [SEGMENT_ID_HEADER]: Type.String(),
          }),
        },
      },
      async (request, reply) => {
        const csvStream = Readable.from(request.body.csv);
        const workspaceId = request.headers[WORKSPACE_ID_HEADER];
        const segmentId = request.headers[SEGMENT_ID_HEADER];

        // Parse the CSV stream into a JavaScript object with an array of rows
        const csvPromise = new Promise<CsvParseResult>((resolve) => {
          const parsingErrors: UserUploadRowErrors[] = [];
          const uploadedRows: UserUploadRow[] = [];

          let i = 0;
          csvStream
            .pipe(csvParser())
            .on("headers", (headers: string[]) => {
              if (!headers.includes("id")) {
                resolve(err('csv must have "id" header'));
                csvStream.destroy(); // This will stop the parsing process
              }
            })
            .on("data", (row: unknown) => {
              if (row instanceof Object && Object.keys(row).length === 0) {
                return;
              }
              const parsed = schemaValidate(row, UserUploadRow);
              const rowNumber = i;
              i += 1;

              if (parsed.isErr()) {
                const errors = {
                  row: rowNumber,
                  error: 'row must have a non-empty "id" field',
                };
                parsingErrors.push(errors);
                return;
              }

              const { value } = parsed;
              if (value.email.length === 0 && value.id.length === 0) {
                const errors = {
                  row: rowNumber,
                  error: 'row must have a non-empty "id" field',
                };
                parsingErrors.push(errors);
                return;
              }

              uploadedRows.push(parsed.value);
            })
            .on("end", () => {
              logger().debug(
                `Parsed ${uploadedRows.length} rows for workspace: ${workspaceId}`,
              );
              if (parsingErrors.length) {
                resolve(err(parsingErrors));
              } else {
                resolve(ok(uploadedRows));
              }
            })
            .on("error", (error) => {
              resolve(err(error));
            });
        });
        const [rows, segment] = await Promise.all([
          csvPromise,
          prisma().segment.findUnique({
            where: {
              id: segmentId,
            },
          }),
        ]);
        const definitionResult = schemaValidateWithErr(
          segment?.definition,
          SegmentDefinition,
        );
        if (definitionResult.isErr()) {
          logger().error(
            {
              segmentId,
              definition: segment?.definition,
            },
            "segment definition is invalid",
          );
          return reply.status(500);
        }
        const definition = definitionResult.value;
        if (definition.entryNode.type !== SegmentNodeType.Manual) {
          return reply.status(400).send({
            message: "segment must have a manual entry node",
          });
        }

        if (rows.isErr()) {
          if (rows.error instanceof Error) {
            const errorResponse: CsvUploadValidationError = {
              message: `misformatted file: ${rows.error.message}`,
            };
            return reply.status(400).send(errorResponse);
          }

          if (rows.error instanceof Array) {
            const errorResponse: CsvUploadValidationError = {
              message: "csv rows contained errors",
              rowErrors: rows.error,
            };
            return reply.status(400).send(errorResponse);
          }

          const errorResponse: CsvUploadValidationError = {
            message: rows.error,
          };
          return reply.status(400).send(errorResponse);
        }

        const emailsWithoutIds: Set<string> = new Set<string>();

        for (const row of rows.value) {
          if (row.email && !row.id) {
            emailsWithoutIds.add(row.email);
          }
        }

        const currentTime = new Date();
        const timestamp = currentTime.toISOString();

        const response = await reply.status(200).send();
        return response;
      },
    );
  });
}
