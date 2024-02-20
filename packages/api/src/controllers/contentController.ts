import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { renderLiquid } from "backend-lib/src/liquid";
import logger from "backend-lib/src/logger";
import {
  sendMessage,
  SendMessageParameters,
  upsertMessageTemplate,
} from "backend-lib/src/messageTemplates";
import prisma from "backend-lib/src/prisma";
import { Prisma } from "backend-lib/src/types";
import { FastifyInstance } from "fastify";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import { SUBSCRIPTION_SECRET_NAME } from "isomorphic-lib/src/constants";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  BadWorkspaceConfigurationType,
  ChannelType,
  DeleteMessageTemplateRequest,
  EmailProviderType,
  EmptyResponse,
  InternalEventType,
  JsonResultType,
  MessageSkippedType,
  MessageTemplateResource,
  MessageTemplateTestRequest,
  MessageTemplateTestResponse,
  RenderMessageTemplateRequest,
  RenderMessageTemplateResponse,
  RenderMessageTemplateResponseContent,
  UpsertMessageTemplateResource,
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
      } = request.body;

      const secrets = await prisma().secret.findMany({
        where: {
          workspaceId,
          name: {
            in: [SUBSCRIPTION_SECRET_NAME],
          },
        },
      });

      const templateSecrets: Record<string, string> = {};
      for (const secret of secrets) {
        if (!secret.value) {
          continue;
        }
        templateSecrets[secret.name] = secret.value;
      }

      const identifierKey = CHANNEL_IDENTIFIERS[channel];

      const responseContents: RenderMessageTemplateResponse["contents"] =
        R.mapValues(contents, (content) => {
          let value: RenderMessageTemplateResponseContent;
          try {
            const rendered = renderLiquid({
              workspaceId,
              template: content.value,
              mjml: content.mjml,
              subscriptionGroupId,
              userProperties,
              identifierKey,
              secrets: templateSecrets,
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
      const messageTags: Record<string, string> = {
        channel: request.body.channel,
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
            provider: request.body.provider,
          };
          break;
        }
        case ChannelType.Sms: {
          sendMessageParams = {
            ...baseSendMessageParams,
            provider: request.body.provider,
            channel: request.body.channel,
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
        if (result.error.variant.type === ChannelType.Email) {
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
              break;
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
          404: {},
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
