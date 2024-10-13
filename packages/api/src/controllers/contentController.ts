import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { renderLiquid, RenderLiquidOptions } from "backend-lib/src/liquid";
import logger from "backend-lib/src/logger";
import {
  enrichMessageTemplate,
  sendMessage,
  SendMessageParameters,
  upsertMessageTemplate,
} from "backend-lib/src/messaging";
import { defaultEmailDefinition } from "backend-lib/src/messaging/email";
import { defaultSmsDefinition } from "backend-lib/src/messaging/sms";
import { DEFAULT_WEBHOOK_DEFINITION } from "backend-lib/src/messaging/webhook";
import prisma from "backend-lib/src/prisma";
import { Prisma, Secret } from "backend-lib/src/types";
import { randomUUID } from "crypto";
import { FastifyInstance } from "fastify";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import { SecretNames } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  BadWorkspaceConfigurationType,
  BaseMessageResponse,
  ChannelType,
  DefaultEmailProviderResource,
  DeleteMessageTemplateRequest,
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
  WebhookSecret,
} from "isomorphic-lib/src/types";
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
        await prisma().secret.findMany({
          where: {
            workspaceId,
            name: {
              in: secretNames,
            },
          },
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

      let identifierKey: string;
      if (channel === ChannelType.Webhook) {
        if (
          contents.identifierKey?.type === RenderMessageTemplateType.PlainText
        ) {
          identifierKey = contents.identifierKey.value;
        } else {
          throw new Error("Invalid webhook render content type");
        }
      } else {
        identifierKey = CHANNEL_IDENTIFIERS[channel];
      }

      const responseContents: RenderMessageTemplateResponse["contents"] =
        R.mapValues(contents, (content) => {
          let value: RenderMessageTemplateResponseContent;
          const baseOptions: Omit<RenderLiquidOptions, "template"> = {
            workspaceId,
            subscriptionGroupId,
            userProperties,
            identifierKey,
            secrets: templateSecrets,
            tags: tagsWithMessageId,
          };
          try {
            const rendered = renderLiquid({
              workspaceId,
              subscriptionGroupId,
              userProperties,
              identifierKey,
              secrets: templateSecrets,
              tags: tagsWithMessageId,
            });
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
      const templateModels = await prisma().messageTemplate.findMany({
        where: {
          workspaceId: request.query.workspaceId,
        },
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
        },
      },
    },
    async (request, reply) => {
      const resource = await upsertMessageTemplate(request.body);
      return reply.status(200).send(resource);
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
        },
      },
    },
    async (request, reply) => {
      let definition: MessageTemplateResourceDefinition;
      const { workspaceId } = request.body;
      switch (request.body.type) {
        case ChannelType.Email: {
          const defaultEmailProvider =
            (await prisma().defaultEmailProvider.findUnique({
              where: {
                workspaceId,
              },
            })) as DefaultEmailProviderResource | null;

          definition = defaultEmailDefinition(
            defaultEmailProvider ?? undefined,
          );
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
      logger().debug(
        {
          body: request.body,
        },
        "loc1 upserting template for reset",
      );
      const resource = await upsertMessageTemplate({
        ...request.body,
        definition,
      });
      const { journeyMetadata } = request.body;
      if (journeyMetadata) {
        const { journeyId, nodeId } = journeyMetadata;
        await prisma().$transaction(async (tx) => {
          const journey = await tx.journey.findUnique({
            where: {
              id: journeyId,
            },
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

          await tx.journey.update({
            where: {
              id: journeyId,
            },
            data: {
              definition: journeyDefinition,
            },
          });
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
      const { id } = request.body;

      try {
        await prisma().messageTemplate.delete({
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
}
