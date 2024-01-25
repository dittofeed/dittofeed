import fastifyMultipart from "@fastify/multipart";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import {
  buildSubscriptionChangeEvent,
  subscriptionGroupToResource,
  upsertSubscriptionGroup,
} from "backend-lib/src/subscriptionGroups";
import {
  CsvUploadValidationError,
  DeleteSubscriptionGroupRequest,
  EmptyResponse,
  SubscriptionChange,
  SubscriptionGroupResource,
  UpsertSubscriptionGroupResource,
  UserUploadRow,
  UserUploadRowErrors,
  WorkspaceId,
} from "backend-lib/src/types";
import {
  findUserIdsByUserProperty,
  InsertUserEvent,
  insertUserEvents,
} from "backend-lib/src/userEvents";
import csvParser from "csv-parser";
import { FastifyInstance } from "fastify";
import {
  SUBSRIPTION_GROUP_ID_HEADER,
  WORKSPACE_ID_HEADER,
} from "isomorphic-lib/src/constants";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";
import { omit } from "remeda";
import { Readable } from "stream";
import { v4 as uuid } from "uuid";

type CsvParseResult = Result<
  UserUploadRow[],
  Error | UserUploadRowErrors[] | string
>;

// eslint-disable-next-line @typescript-eslint/require-await
export default async function subscriptionGroupsController(
  fastify: FastifyInstance,
) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/",
    {
      schema: {
        description: "Create or update a subscription group.",
        tags: ["Subscription Groups"],
        body: UpsertSubscriptionGroupResource,
        response: {
          200: SubscriptionGroupResource,
          400: CsvUploadValidationError,
        },
      },
    },
    async (request, reply) => {
      const result = await upsertSubscriptionGroup(request.body);
      if (result.isErr()) {
        return reply.status(400).send({
          message: result.error.message,
        });
      }
      const resource = subscriptionGroupToResource(result.value);
      return reply.status(200).send(resource);
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
            [SUBSRIPTION_GROUP_ID_HEADER]: Type.String(),
          }),
        },
      },
      async (request, reply) => {
        const csvStream = Readable.from(request.body.csv);
        const workspaceId = request.headers[WORKSPACE_ID_HEADER];
        const subscriptionGroupId =
          request.headers[SUBSRIPTION_GROUP_ID_HEADER];

        // Parse the CSV stream into a JavaScript object with an array of rows
        const rows: CsvParseResult = await new Promise<CsvParseResult>(
          (resolve) => {
            const parsingErrors: UserUploadRowErrors[] = [];
            const uploadedRows: UserUploadRow[] = [];

            let i = 0;
            csvStream
              .pipe(csvParser())
              .on("headers", (headers: string[]) => {
                if (!headers.includes("id") && !headers.includes("email")) {
                  resolve(err('csv must have "id" or "email" headers'));
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
                    error: 'row must have a non-empty "email" or "id" field',
                  };
                  parsingErrors.push(errors);
                  return;
                }

                const { value } = parsed;
                if (value.email.length === 0 && value.id.length === 0) {
                  const errors = {
                    row: rowNumber,
                    error: 'row must have a non-empty "email" or "id" field',
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
          },
        );
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

        const missingUserIdsByEmail = await findUserIdsByUserProperty({
          userPropertyName: "email",
          workspaceId,
          valueSet: emailsWithoutIds,
        });

        const userEvents: InsertUserEvent[] = [];
        const currentTime = new Date();
        const timestamp = currentTime.toISOString();

        for (const row of rows.value) {
          const userIds = missingUserIdsByEmail[row.email];
          const userId =
            (row.id as string | undefined) ??
            (userIds?.length ? userIds[0] : uuid());

          if (!userId) {
            continue;
          }

          const identifyEvent: InsertUserEvent = {
            messageId: uuid(),
            messageRaw: JSON.stringify({
              userId,
              timestamp,
              type: "identify",
              traits: omit(row, ["id"]),
            }),
          };

          const trackEvent = buildSubscriptionChangeEvent({
            userId,
            currentTime,
            subscriptionGroupId,
            action: SubscriptionChange.Subscribe,
          });

          userEvents.push(trackEvent);
          userEvents.push(identifyEvent);
        }
        await insertUserEvents({
          workspaceId,
          userEvents,
        });

        const response = await reply.status(200).send();
        return response;
      },
    );
  });

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/",
    {
      schema: {
        description:
          "Delete a subscription group and its corresponding segment.",
        tags: ["Subscription Groups"],
        body: DeleteSubscriptionGroupRequest,
        response: {
          204: EmptyResponse,
          400: Type.Object({
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      await prisma().subscriptionGroup.delete({
        where: {
          id: request.body.id,
        },
      });
      return reply.status(204).send();
    },
  );
}
