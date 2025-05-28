import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { renderLiquid, RenderLiquidOptions } from "backend-lib/src/liquid";
import logger from "backend-lib/src/logger";
import {
  enrichMessageTemplate,
  sendMessage,
  SendMessageParameters,
  upsertMessageTemplate,
} from "backend-lib/src/messaging";
import { Secret } from "backend-lib/src/types";
import { randomUUID } from "crypto";
import { and, eq, inArray, SQL } from "drizzle-orm";
import { toMjml } from "emailo/src/toMjml";
import { FastifyInstance } from "fastify";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import { SecretNames } from "isomorphic-lib/src/constants";
import { defaultEmailDefinition } from "isomorphic-lib/src/email";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { defaultSmsDefinition } from "isomorphic-lib/src/sms";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  BadWorkspaceConfigurationType,
  BaseMessageResponse,
  ChannelType,
  DefaultEmailProviderResource,
  DeleteMessageTemplateRequest,
  EmailContentsType,
  EmailProviderType,
  EmptyResponse,
  GetMessageTemplatesRequest,
  GetMessageTemplatesResponse,
  InternalEventType,
  JourneyDefinition,
  JourneyNodeType,
  JsonResultType,
  MessageSkippedType,
  MessageTags,
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  MessageTemplateTestRequest,
  MessageTemplateTestResponse,
  RenderMessageTemplateRequest,
  RenderMessageTemplateResponse,
  RenderMessageTemplateResponseContent,
  RenderMessageTemplateType,
  ResetMessageTemplateResource,
  UpsertMessageTemplateResource,
  UpsertMessageTemplateValidationError,
  WebhookSecret,
} from "isomorphic-lib/src/types";
import { DEFAULT_WEBHOOK_DEFINITION } from "isomorphic-lib/src/webhook";
import * as R from "remeda";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function contentController(fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/templates/render",
    {
      schema: {
        description: "Render message template.",
        tags: ["Content"],
        body: RenderMessageTemplateRequest,
        response: {
          200: RenderMessageTemplateResponse,
          500: BaseMessageResponse,
        },
      },
    },
    async (request, reply) => {
      const {
        contents,
        workspaceId,
        subscriptionGroupId,
        channel,
        userProperties,
        tags,
      } = request.body;
      const tagsWithMessageId: MessageTags = {
        ...(tags ?? {}),
        messageId: tags?.messageId ?? randomUUID(),
      };

      const secretNames = [SecretNames.Subscription];
      if (channel === ChannelType.Webhook) {
        secretNames.push(SecretNames.Webhook);
      }

      const secrets = (
        await db().query.secret.findMany({
          where: and(
            eq(schema.secret.workspaceId, workspaceId),
            inArray(schema.secret.name, secretNames),
          ),
        })
      ).reduce((acc, secret) => {
        acc.set(secret.name, secret);
        return acc;
      }, new Map<string, Secret>());

      const templateSecrets: Record<string, string> = {};
      const subscriptionSecret = secrets.get(SecretNames.Subscription)?.value;
      if (subscriptionSecret) {
        templateSecrets[SecretNames.Subscription] = subscriptionSecret;
      }
      const webhookSecret = secrets.get(SecretNames.Webhook)?.configValue;
      if (webhookSecret) {
        const validated = schemaValidateWithErr(webhookSecret, WebhookSecret);
        if (validated.isErr()) {
          return reply.status(500).send({
            message: "Invalid webhook secret configuration",
          });
        }
        Object.entries(R.omit(validated.value, ["type"])).forEach(([key]) => {
          // don't render actual secret value
          templateSecrets[key] = "**********";
        });
      }

      let identifierKey: string | undefined;
      if (channel !== ChannelType.Webhook) {
        identifierKey = CHANNEL_IDENTIFIERS[channel];
      }

      const responseContents: RenderMessageTemplateResponse["contents"] =
        R.mapValues(contents, (content) => {
          let value: RenderMessageTemplateResponseContent;
          let template: string;

          if (content.type !== RenderMessageTemplateType.Emailo) {
            template = content.value;
          } else {
            const mjml = toMjml({ content: content.value, mode: "render" });
            template = mjml;
          }
          const options: RenderLiquidOptions = {
            workspaceId,
            subscriptionGroupId,
            userProperties,
            identifierKey,
            secrets: templateSecrets,
            template,
            mjml:
              content.type === RenderMessageTemplateType.Mjml ||
              content.type === RenderMessageTemplateType.Emailo,
            tags: tagsWithMessageId,
          };
          try {
            const rendered = renderLiquid(options);
            value = {
              type: JsonResultType.Ok,
              value: rendered,
            };
          } catch (e) {
            const err = e as Error;
            value = {
              type: JsonResultType.Err,
              err: err.message,
            };
          }
          return value;
        });

      return reply.status(200).send({
        contents: responseContents,
      });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().get(
    "/templates",
    {
      schema: {
        description: "Get message templates",
        tags: ["Content"],
        querystring: GetMessageTemplatesRequest,
        response: {
          200: GetMessageTemplatesResponse,
        },
      },
    },
    async (request, reply) => {
      const conditions: SQL[] = [
        eq(schema.messageTemplate.workspaceId, request.query.workspaceId),
      ];
      if (request.query.ids) {
        conditions.push(inArray(schema.messageTemplate.id, request.query.ids));
      }
      if (request.query.resourceType) {
        conditions.push(
          eq(schema.messageTemplate.resourceType, request.query.resourceType),
        );
      }
      const templateModels = await db().query.messageTemplate.findMany({
        where: and(...conditions),
      });
      const templates = templateModels.map((t) =>
        unwrap(enrichMessageTemplate(t)),
      );
      return reply.status(200).send({ templates });
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/templates",
    {
      schema: {
        description: "Create or update message template",
        tags: ["Content"],
        body: UpsertMessageTemplateResource,
        response: {
          200: MessageTemplateResource,
          400: UpsertMessageTemplateValidationError,
        },
      },
    },
    async (request, reply) => {
      const resource = await upsertMessageTemplate(request.body);
      if (resource.isErr()) {
        return reply.status(400).send(resource.error);
      }
      return reply.status(200).send(resource.value);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().put(
    "/templates/reset",
    {
      schema: {
        description: "Create or update message template",
        tags: ["Content"],
        body: ResetMessageTemplateResource,
        response: {
          200: MessageTemplateResource,
          400: UpsertMessageTemplateValidationError,
        },
      },
    },
    async (request, reply) => {
      let definition: MessageTemplateResourceDefinition;
      const { workspaceId, emailContentsType } = request.body;
      switch (request.body.type) {
        case ChannelType.Email: {
          const defaultEmailProvider =
            (await db().query.defaultEmailProvider.findFirst({
              where: eq(schema.defaultEmailProvider.workspaceId, workspaceId),
            })) as DefaultEmailProviderResource | null;

          definition = defaultEmailDefinition({
            emailProvider: defaultEmailProvider ?? undefined,
            emailContentsType: emailContentsType ?? EmailContentsType.Code,
          });
          break;
        }
        case ChannelType.Sms: {
          definition = defaultSmsDefinition();
          break;
        }
        case ChannelType.Webhook: {
          definition = DEFAULT_WEBHOOK_DEFINITION;
          break;
        }
        case ChannelType.MobilePush: {
          throw new Error("Mobile push templates unimplemented");
        }
      }
      const result = await upsertMessageTemplate({
        ...request.body,
        definition,
      });
      if (result.isErr()) {
        return reply.status(400).send(result.error);
      }
      const resource = result.value;
      const { journeyMetadata } = request.body;
      if (journeyMetadata) {
        const { journeyId, nodeId } = journeyMetadata;
        await db().transaction(async (tx) => {
          const journey = await tx.query.journey.findFirst({
            where: eq(schema.journey.id, journeyId),
          });
          if (!journey) {
            return;
          }
          const definitionResult = schemaValidateWithErr(
            journey.definition,
            JourneyDefinition,
          );
          if (definitionResult.isErr()) {
            return;
          }
          const journeyDefinition = definitionResult.value;
          const node = journeyDefinition.nodes.find((n) => n.id === nodeId);

          if (!node || node.type !== JourneyNodeType.MessageNode) {
            return;
          }
          node.variant.type = request.body.type;

          await tx
            .update(schema.journey)
            .set({
              definition: journeyDefinition,
            })
            .where(eq(schema.journey.id, journeyId));
        });
      }
      return reply.status(200).send(resource);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().post(
    "/templates/test",
    {
      schema: {
        description: "Send a test message for a message template.",
        tags: ["Content"],
        body: MessageTemplateTestRequest,
        response: {
          200: MessageTemplateTestResponse,
        },
      },
    },
    async (request, reply) => {
      const messageTags: MessageTags = {
        ...(request.body.tags ?? {}),
        messageId: request.body.tags?.messageId ?? randomUUID(),
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const userId = request.body.userProperties.id;
      if (typeof userId === "string") {
        messageTags.userId = userId;
      }
      const baseSendMessageParams: Omit<
        SendMessageParameters,
        "provider" | "channel"
      > = {
        workspaceId: request.body.workspaceId,
        templateId: request.body.templateId,
        userId: messageTags.userId ?? "test-user",
        userPropertyAssignments: request.body.userProperties,
        useDraft: true,
        messageTags,
      };
      let sendMessageParams: SendMessageParameters;
      switch (request.body.channel) {
        case ChannelType.Email: {
          sendMessageParams = {
            ...baseSendMessageParams,
            channel: request.body.channel,
            providerOverride: request.body.provider,
          };
          break;
        }
        case ChannelType.Sms: {
          sendMessageParams = {
            ...baseSendMessageParams,
            providerOverride: request.body.provider,
            channel: request.body.channel,
            disableCallback: true,
          };
          break;
        }
        case ChannelType.MobilePush: {
          sendMessageParams = {
            ...baseSendMessageParams,
            provider: request.body.provider,
            channel: request.body.channel,
          };
          break;
        }
        case ChannelType.Webhook: {
          sendMessageParams = {
            ...baseSendMessageParams,
            channel: request.body.channel,
          };
          break;
        }
        default:
          assertUnreachable(request.body);
      }
      const result = await sendMessage(sendMessageParams);
      if (result.isOk()) {
        return reply.status(200).send({
          type: JsonResultType.Ok,
          value: result.value,
        });
      }
      if (
        result.error.type === InternalEventType.MessageSkipped &&
        result.error.variant.type === MessageSkippedType.MissingIdentifier
      ) {
        return reply.status(200).send({
          type: JsonResultType.Err,
          err: {
            suggestions: [
              `Missing identifying user property value: ${result.error.variant.identifierKey}`,
            ],
          },
        });
      }
      if (result.error.type === InternalEventType.MessageFailure) {
        switch (result.error.variant.type) {
          case ChannelType.Webhook: {
            const { response, code } = result.error.variant;
            const suggestions = [
              "The webhook failed, check your request configuration and try again.",
            ];
            if (code) {
              suggestions.push(`Webhook responded with status: ${code}`);
            }
            return reply.status(200).send({
              type: JsonResultType.Err,
              err: {
                suggestions,
                responseData: response
                  ? JSON.stringify(response, null, 2)
                  : undefined,
              },
            });
          }
          case ChannelType.Email: {
            const { type } = result.error.variant.provider;
            switch (type) {
              case EmailProviderType.Sendgrid: {
                const { body, status } = result.error.variant.provider;
                const suggestions: string[] = [];
                if (status) {
                  suggestions.push(`Sendgrid responded with status: ${status}`);
                  if (status === 403) {
                    suggestions.push(
                      "Is the configured email domain authorized in sengrid?",
                    );
                  }
                }
                return reply.status(200).send({
                  type: JsonResultType.Err,
                  err: {
                    suggestions,
                    responseData: body,
                  },
                });
              }
              case EmailProviderType.Resend: {
                const { message } = result.error.variant.provider;
                const suggestions: string[] = [];
                suggestions.push(message);
                return reply.status(200).send({
                  type: JsonResultType.Err,
                  err: {
                    suggestions,
                    responseData: message,
                  },
                });
              }
              case EmailProviderType.Smtp: {
                return reply.status(200).send({
                  type: JsonResultType.Err,
                  err: {
                    suggestions: [
                      "Failed to send email. Check your SMTP settings.",
                    ],
                    responseData: result.error.variant.provider.message,
                  },
                });
              }
              case EmailProviderType.AmazonSes: {
                const { message } = result.error.variant.provider;
                const suggestions: string[] = [];
                if (message) {
                  suggestions.push(message);
                }
                return reply.status(200).send({
                  type: JsonResultType.Err,
                  err: {
                    suggestions,
                    responseData: message,
                  },
                });
              }
              case EmailProviderType.PostMark: {
                const { message } = result.error.variant.provider;
                const suggestions: string[] = [];
                suggestions.push(message);
                return reply.status(200).send({
                  type: JsonResultType.Err,
                  err: {
                    suggestions,
                    responseData: message,
                  },
                });
              }
              case EmailProviderType.MailChimp: {
                const { message } = result.error.variant.provider;
                const suggestions: string[] = [];
                suggestions.push(message);
                return reply.status(200).send({
                  type: JsonResultType.Err,
                  err: {
                    suggestions,
                    responseData: message,
                  },
                });
              }
              case EmailProviderType.Gmail: {
                throw new Error("Gmail is not supported in test mode");
              }
              default: {
                assertUnreachable(type);
              }
            }
          }
        }
      }
      if (result.error.type === InternalEventType.BadWorkspaceConfiguration) {
        if (
          result.error.variant.type ===
          BadWorkspaceConfigurationType.MessageServiceProviderMisconfigured
        ) {
          return reply.status(200).send({
            type: JsonResultType.Err,
            err: {
              suggestions: [
                [
                  "Unable to send message, because your message service provider is not configured correctly",
                  result.error.variant.message,
                ].join(" - "),
              ],
            },
          });
        }

        if (
          result.error.variant.type ===
          BadWorkspaceConfigurationType.MessageServiceProviderNotFound
        ) {
          return reply.status(200).send({
            type: JsonResultType.Err,
            err: {
              suggestions: [
                `Unable to send message, because you haven't configured a message service provider.`,
              ],
            },
          });
        }
      }
      logger().error(result.error, "Unexpected error sending test message");
      return reply.status(500);
    },
  );

  fastify.withTypeProvider<TypeBoxTypeProvider>().delete(
    "/templates",
    {
      schema: {
        description: "Delete a message template.",
        tags: ["Content"],
        body: DeleteMessageTemplateRequest,
        response: {
          204: EmptyResponse,
          404: EmptyResponse,
        },
      },
    },
    async (request, reply) => {
      const { id, workspaceId } = request.body;

      const result = await db()
        .delete(schema.messageTemplate)
        .where(
          and(
            eq(schema.messageTemplate.id, id),
            eq(schema.messageTemplate.workspaceId, workspaceId),
          ),
        )
        .returning();

      if (result.length === 0) {
        return reply.status(404).send();
      }
      return reply.status(204).send();
    },
  );
}
