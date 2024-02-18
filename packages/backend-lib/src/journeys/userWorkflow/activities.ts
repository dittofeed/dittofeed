import {
  EmailProvider,
  JourneyStatus,
  SegmentAssignment,
} from "@prisma/client";
import { MailDataRequired } from "@sendgrid/mail";
import escapeHTML from "escape-html";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import {
  FCM_SECRET_NAME,
  SUBSCRIPTION_SECRET_NAME,
} from "isomorphic-lib/src/constants";
import { getNodeId } from "isomorphic-lib/src/journeys";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { err, ok, Result } from "neverthrow";
import * as R from "remeda";
import { omit } from "remeda";
import { v5 as uuidv5 } from "uuid";

import { submitTrack } from "../../apps/track";
import { sendNotification } from "../../destinations/fcm";
import {
  ResendRequiredData,
  sendMail as sendEmailResend,
} from "../../destinations/resend";
import { sendMail as sendEmailSendgrid } from "../../destinations/sendgrid";
import {
  sendSms as sendSmsTwilio,
  TwilioRestException,
} from "../../destinations/twilio";
import { renderLiquid } from "../../liquid";
import logger from "../../logger";
import { findMessageTemplate, sendMessage } from "../../messageTemplates";
import prisma from "../../prisma";
import {
  getSubscriptionGroupDetails,
  getSubscriptionGroupWithAssignment,
} from "../../subscriptionGroups";
import {
  BackendMessageSendResult,
  BadWorkspaceConfigurationType,
  ChannelType,
  EmailProviderType,
  InternalEventType,
  JourneyNode,
  JourneyNodeType,
  JSONValue,
  KnownTrackData,
  MessageTemplateResource,
  SmsProviderSecret,
  SmsProviderType,
  SubscriptionGroupType,
  TrackData,
} from "../../types";
import {
  assignmentAsString,
  findAllUserPropertyAssignments,
} from "../../userProperties";

export { findNextLocalizedTime } from "../../dates";
export { findAllUserPropertyAssignments } from "../../userProperties";

type SendWithTrackingValue = [boolean, KnownTrackData | null];

interface BaseSendParams {
  userId: string;
  workspaceId: string;
  runId: string;
  nodeId: string;
  templateId: string;
  journeyId: string;
  messageId: string;
  subscriptionGroupId?: string;
  channel: ChannelType;
}
interface SendWithTrackingParams<C> extends BaseSendParams {
  getChannelConfig: ({
    workspaceId,
  }: {
    workspaceId: string;
  }) => Promise<Result<C, SendWithTrackingValue>>;
  channelSend: (
    params: BaseSendParams & {
      channelConfig: C;
      identifier: string;
      messageTemplate: MessageTemplateResource;
      subscriptionSecret: string;
      userPropertyAssignments: Awaited<
        ReturnType<typeof findAllUserPropertyAssignments>
      >;
    },
  ) => Promise<SendWithTrackingValue>;
}

type TrackingProperties = BaseSendParams & {
  journeyStatus?: JourneyStatus;
};

function buildSendValueFactory(trackingProperties: TrackingProperties) {
  const innerTrackingProperties = {
    ...R.omit(trackingProperties, ["userId", "workspaceId", "messageId"]),
  };

  return function buildSendValue(
    success: boolean,
    event: InternalEventType,
    properties?: TrackData["properties"],
  ): SendWithTrackingValue {
    return [
      success,
      {
        event,
        messageId: trackingProperties.messageId,
        userId: trackingProperties.userId,
        properties: {
          ...innerTrackingProperties,
          ...properties,
        },
      },
    ];
  };
}

async function sendWithTracking<C>(
  params: SendWithTrackingParams<C>,
): Promise<SendWithTrackingValue> {
  const {
    journeyId,
    templateId,
    workspaceId,
    userId,
    runId,
    nodeId,
    messageId,
    subscriptionGroupId,
    getChannelConfig,
    channelSend,
    channel,
  } = params;
  const [
    messageTemplateResult,
    userPropertyAssignments,
    journey,
    subscriptionGroup,
    channelConfig,
    subscriptionSecret,
  ] = await Promise.all([
    findMessageTemplate({
      id: templateId,
      channel,
    }),
    findAllUserPropertyAssignments({ userId, workspaceId }),
    prisma().journey.findUnique({ where: { id: journeyId } }),
    subscriptionGroupId
      ? getSubscriptionGroupWithAssignment({ userId, subscriptionGroupId })
      : null,
    getChannelConfig({ workspaceId }),
    prisma().secret.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: SUBSCRIPTION_SECRET_NAME,
        },
      },
    }),
  ]);
  const baseParams = {
    journeyId,
    templateId,
    workspaceId,
    userId,
    runId,
    nodeId,
    messageId,
    subscriptionGroupId,
    channel,
  };
  const trackingProperties = {
    ...baseParams,
    journeyStatus: journey?.status,
  };

  const buildSendValue = buildSendValueFactory(trackingProperties);

  if (messageTemplateResult.isErr()) {
    logger().error(
      {
        ...trackingProperties,
        error: messageTemplateResult.error,
      },
      "malformed message template",
    );
    return [false, null];
  }

  const messageTemplate = messageTemplateResult.value;
  if (!messageTemplate) {
    return buildSendValue(false, InternalEventType.BadWorkspaceConfiguration, {
      message: "message template not found",
    });
  }

  if (!journey) {
    return buildSendValue(false, InternalEventType.BadWorkspaceConfiguration, {
      message: "journey not found",
    });
  }

  if (subscriptionGroupId) {
    if (!subscriptionGroup) {
      return buildSendValue(
        false,
        InternalEventType.BadWorkspaceConfiguration,
        {
          message: "subscription group not found",
        },
      );
    }

    const segmentAssignment =
      subscriptionGroup.Segment[0]?.SegmentAssignment[0];

    if (
      segmentAssignment?.inSegment === false ||
      (segmentAssignment === undefined &&
        subscriptionGroup.type === SubscriptionGroupType.OptIn)
    ) {
      // TODO this should skip message, but not cause user to drop out of journey. return value should not be simple boolean
      return buildSendValue(false, InternalEventType.MessageSkipped, {
        SubscriptionGroupType: subscriptionGroup.type,
        inSubscriptionGroupSegment: String(!!segmentAssignment?.inSegment),
        message: "User is not in subscription group",
      });
    }
  }

  if (!(journey.status === "Running" || journey.status === "Broadcast")) {
    return buildSendValue(false, InternalEventType.MessageSkipped);
  }

  const identifierKey = CHANNEL_IDENTIFIERS[channel];
  const identifier = assignmentAsString(userPropertyAssignments, identifierKey);

  if (!identifier) {
    return buildSendValue(false, InternalEventType.BadWorkspaceConfiguration, {
      identifier,
      identifierKey,
      message: "Identifier not found.",
    });
  }

  if (channelConfig.isErr()) {
    return channelConfig.error;
  }

  if (!subscriptionSecret?.value) {
    logger().error("subscription secret not found");
    return [false, null];
  }

  return channelSend({
    channelConfig: channelConfig.value,
    messageTemplate,
    identifier,
    userPropertyAssignments,
    subscriptionSecret: subscriptionSecret.value,
    ...baseParams,
  });
}

interface MobilePushChannelConfig {
  fcmKey: string;
}

export async function sendSmsWithPayload(
  params: BaseSendParams,
): Promise<SendWithTrackingValue> {
  const buildSendValue = buildSendValueFactory(params);

  return sendWithTracking<SmsProviderSecret>({
    ...params,
    async getChannelConfig({ workspaceId }) {
      const smsProvider = await prisma().defaultSmsProvider.findUnique({
        where: {
          workspaceId,
        },
        include: {
          smsProvider: {
            include: {
              secret: true,
            },
          },
        },
      });
      const smsConfig = smsProvider?.smsProvider.secret.configValue;
      if (!smsConfig) {
        return err(
          buildSendValue(false, InternalEventType.BadWorkspaceConfiguration, {
            message: "SMS provider not found",
          }),
        );
      }
      const parsedConfigResult = schemaValidateWithErr(
        smsConfig,
        SmsProviderSecret,
      );
      if (parsedConfigResult.isErr()) {
        return err(
          buildSendValue(false, InternalEventType.BadWorkspaceConfiguration, {
            message: `SMS provider config is invalid: ${parsedConfigResult.error.message}`,
          }),
        );
      }
      return ok(parsedConfigResult.value);
    },
    async channelSend({
      workspaceId,
      channel,
      messageTemplate,
      userPropertyAssignments,
      channelConfig,
      identifier,
      subscriptionSecret,
    }) {
      const render = (template?: string) =>
        template &&
        renderLiquid({
          userProperties: userPropertyAssignments,
          template,
          workspaceId,
          identifierKey: CHANNEL_IDENTIFIERS[channel],
          subscriptionGroupId: params.subscriptionGroupId,
          secrets: {
            [SUBSCRIPTION_SECRET_NAME]: subscriptionSecret,
          },
        });

      if (messageTemplate.definition?.type !== ChannelType.Sms) {
        return buildSendValue(
          false,
          InternalEventType.BadWorkspaceConfiguration,
          {
            message: "Message template is not a sms template",
          },
        );
      }
      let body: string | undefined;
      try {
        body = render(messageTemplate.definition.body);
      } catch (e) {
        const error = e as Error;
        return buildSendValue(
          false,
          InternalEventType.BadWorkspaceConfiguration,
          {
            message: `render failure: ${error.message}`,
          },
        );
      }

      if (!body) {
        return buildSendValue(false, InternalEventType.MessageSkipped, {
          message: "SMS body is empty",
        });
      }

      switch (channelConfig.type) {
        case SmsProviderType.Twilio: {
          if (
            !channelConfig.accountSid ||
            !channelConfig.messagingServiceSid ||
            !channelConfig.authToken
          ) {
            return buildSendValue(
              false,
              InternalEventType.BadWorkspaceConfiguration,
              {
                message: "Twilio config is invalid",
              },
            );
          }
          const smsResult = await sendSmsTwilio({
            body,
            to: identifier,
            accountSid: channelConfig.accountSid,
            messagingServiceSid: channelConfig.messagingServiceSid,
            authToken: channelConfig.authToken,
          });

          if (smsResult.isErr()) {
            logger().error({ err: smsResult.error }, "failed to send sms");
            return buildSendValue(false, InternalEventType.MessageFailure, {
              message: `Failed to send sms: ${smsResult.error.message}`,
              error: {
                stack: smsResult.error.stack,
                ...(smsResult.error instanceof TwilioRestException
                  ? R.pick(smsResult.error, [
                      "status",
                      "code",
                      "moreInfo",
                      "details",
                    ])
                  : undefined),
              },
            });
          }

          return buildSendValue(true, InternalEventType.MessageSent, {
            body,
            to: identifier,
            sid: smsResult.value.sid,
          });
        }
        default: {
          const smsType: never = channelConfig.type as never;
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          assertUnreachable(smsType, `unknown sms provider type ${smsType}`);
        }
      }
    },
  });
}

export type SendParams = Omit<BaseSendParams, "channel">;

export async function sendSms(params: SendParams): Promise<boolean> {
  const [sent, trackData] = await sendSmsWithPayload({
    ...params,
    channel: ChannelType.Sms,
  });
  if (trackData) {
    await submitTrack({ workspaceId: params.workspaceId, data: trackData });
  }
  return sent;
}

export async function sendMobilePushWithPayload(
  params: BaseSendParams,
): Promise<SendWithTrackingValue> {
  const buildSendValue = buildSendValueFactory(params);

  return sendWithTracking<MobilePushChannelConfig>({
    ...params,
    async getChannelConfig({ workspaceId }) {
      const fcmKey = await prisma().secret.findUnique({
        where: {
          workspaceId_name: {
            workspaceId,
            name: FCM_SECRET_NAME,
          },
        },
      });

      if (!fcmKey?.value) {
        return err(
          buildSendValue(false, InternalEventType.BadWorkspaceConfiguration, {
            message: "FCM key not found",
          }),
        );
      }
      return ok({ fcmKey: fcmKey.value });
    },
    async channelSend({
      workspaceId,
      channel,
      messageTemplate,
      userPropertyAssignments,
      channelConfig,
      identifier,
      subscriptionSecret,
    }) {
      const render = (template?: string) =>
        template &&
        renderLiquid({
          userProperties: userPropertyAssignments,
          template,
          workspaceId,
          identifierKey: CHANNEL_IDENTIFIERS[channel],
          subscriptionGroupId: params.subscriptionGroupId,
          secrets: {
            [SUBSCRIPTION_SECRET_NAME]: subscriptionSecret,
          },
        });

      if (messageTemplate.definition?.type !== ChannelType.MobilePush) {
        return buildSendValue(
          false,
          InternalEventType.BadWorkspaceConfiguration,
          {
            message: "Message template is not a mobile push template",
          },
        );
      }
      let title: string | undefined;
      let body: string | undefined;
      try {
        title = render(messageTemplate.definition.title);
        body = render(messageTemplate.definition.body);
      } catch (e) {
        const error = e as Error;
        return buildSendValue(
          false,
          InternalEventType.BadWorkspaceConfiguration,
          {
            message: `render failure: ${error.message}`,
          },
        );
      }

      const { imageUrl } = messageTemplate.definition;
      const token = identifier;
      const fcmMessageId = await sendNotification({
        key: channelConfig.fcmKey,
        token,
        notification: {
          title,
          body,
          imageUrl,
        },
        android: messageTemplate.definition.android,
      });
      return buildSendValue(true, InternalEventType.MessageSent, {
        fcmMessageId,
        title,
        body,
        imageUrl,
        token,
        android: messageTemplate.definition.android,
      });
    },
  });
}

export async function sendMobilePush(params: SendParams): Promise<boolean> {
  const [sent, trackData] = await sendMobilePushWithPayload({
    ...params,
    channel: ChannelType.MobilePush,
  });
  if (trackData) {
    await submitTrack({ workspaceId: params.workspaceId, data: trackData });
  }
  return sent;
}

interface EmailChannelConfig {
  emailProvider: EmailProvider;
}

// TODO write test
async function sendEmailWithPayload(
  params: BaseSendParams,
): Promise<SendWithTrackingValue> {
  const buildSendValue = buildSendValueFactory(params);

  return sendWithTracking<EmailChannelConfig>({
    ...params,
    async getChannelConfig({ workspaceId }) {
      const defaultEmailProvider =
        await prisma().defaultEmailProvider.findUnique({
          where: {
            workspaceId,
          },
          include: { emailProvider: true },
        });

      if (!defaultEmailProvider?.emailProvider) {
        return err(
          buildSendValue(false, InternalEventType.BadWorkspaceConfiguration, {
            message: "Default email provider not found",
          }),
        );
      }
      return ok({ emailProvider: defaultEmailProvider.emailProvider });
    },
    async channelSend({
      workspaceId,
      channel,
      messageTemplate,
      userPropertyAssignments,
      channelConfig,
      identifier,
      journeyId,
      runId,
      messageId,
      userId,
      templateId,
      nodeId,
      subscriptionSecret,
    }) {
      const render = (template: string, mjml?: boolean) =>
        template &&
        renderLiquid({
          userProperties: userPropertyAssignments,
          template,
          workspaceId,
          mjml,
          identifierKey: CHANNEL_IDENTIFIERS[channel],
          subscriptionGroupId: params.subscriptionGroupId,
          secrets: {
            [SUBSCRIPTION_SECRET_NAME]: subscriptionSecret,
          },
        });

      if (messageTemplate.definition?.type !== ChannelType.Email) {
        return buildSendValue(
          false,
          InternalEventType.BadWorkspaceConfiguration,
          {
            message: "Message template is not a mobile push template",
          },
        );
      }
      let from: string;
      let subject: string;
      let body: string;
      let replyTo: string | undefined;
      try {
        from = escapeHTML(render(messageTemplate.definition.from));
        subject = escapeHTML(render(messageTemplate.definition.subject));
        body = render(messageTemplate.definition.body, true);
        if (messageTemplate.definition.replyTo) {
          replyTo = render(messageTemplate.definition.replyTo);
        }
      } catch (e) {
        const error = e as Error;
        return buildSendValue(
          false,
          InternalEventType.BadWorkspaceConfiguration,
          {
            message: `render failure: ${error.message}`,
          },
        );
      }

      switch (channelConfig.emailProvider.type) {
        case EmailProviderType.Sendgrid: {
          const headers: Record<string, string> = {};
          const mailData: MailDataRequired = {
            to: identifier,
            from,
            subject,
            html: body,
            customArgs: {
              journeyId,
              runId,
              messageId,
              userId,
              workspaceId,
              templateId,
              nodeId,
            },
            headers,
          };
          if (replyTo) {
            mailData.replyTo = replyTo;
          }
          if (!channelConfig.emailProvider.apiKey) {
            throw new Error("Missing sendgrid api key");
          }
          // TODO distinguish between retryable and non-retryable errors
          const result = await sendEmailSendgrid({
            mailData,
            apiKey: channelConfig.emailProvider.apiKey,
          });

          if (result.isErr()) {
            logger().error({ err: result.error });
            return buildSendValue(false, InternalEventType.MessageFailure, {
              message: `Failed to send message to sendgrid: ${result.error.message}`,
              error: {
                stack: result.error.stack,
                responseBody: result.error.response.body,
              },
            });
          }

          return buildSendValue(true, InternalEventType.MessageSent, {
            from,
            to: identifier,
            body,
            subject,
            replyTo,
          });
        }
        case EmailProviderType.Resend: {
          const headers: Record<string, string> = {};
          const mailData: ResendRequiredData = {
            to: identifier,
            from,
            subject,
            html: body,
            tags: [
              { name: "journeyId", value: journeyId },
              { name: "runId", value: runId },
              { name: "messageId", value: messageId },
              { name: "userId", value: userId },
              { name: "workspaceId", value: workspaceId },
              { name: "templateId", value: templateId },
              { name: "nodeId", value: nodeId },
            ],
            headers,
          };
          if (replyTo) {
            mailData.reply_to = replyTo;
          }
          if (!channelConfig.emailProvider.apiKey) {
            throw new Error("Missing resend api key");
          }

          const result = await sendEmailResend({
            mailData,
            apiKey: channelConfig.emailProvider.apiKey,
          });

          if (result.isErr()) {
            logger().error({ err: result.error });
            return buildSendValue(false, InternalEventType.MessageFailure, {
              message: `Failed to send message to resend: ${result.error.message}`,
              error: {
                responseBody: result.error,
              },
            });
          }

          return buildSendValue(true, InternalEventType.MessageSent, {
            from,
            to: identifier,
            body,
            subject,
            replyTo,
          });
        }
        default: {
          return buildSendValue(
            false,
            InternalEventType.BadWorkspaceConfiguration,
            {
              message: `Unknown email provider type: ${channelConfig.emailProvider.type}`,
            },
          );
        }
      }
    },
  });
}

export interface SendParamsV2 extends SendParams {
  channel: ChannelType;
  context?: Record<string, JSONValue>;
}

async function sendMessageInner({
  userId,
  workspaceId,
  runId,
  nodeId,
  templateId,
  journeyId,
  messageId,
  subscriptionGroupId,
  channel,
  context,
}: SendParamsV2): Promise<BackendMessageSendResult> {
  const [userPropertyAssignments, journey, subscriptionGroup] =
    await Promise.all([
      findAllUserPropertyAssignments({ userId, workspaceId, context }),
      prisma().journey.findUnique({ where: { id: journeyId } }),
      subscriptionGroupId
        ? getSubscriptionGroupWithAssignment({ userId, subscriptionGroupId })
        : null,
    ]);

  const subscriptionGroupDetails = subscriptionGroup
    ? getSubscriptionGroupDetails(subscriptionGroup)
    : undefined;

  if (!journey) {
    return err({
      type: InternalEventType.BadWorkspaceConfiguration,
      variant: {
        type: BadWorkspaceConfigurationType.JourneyNotFound,
      },
    });
  }

  if (!(journey.status === "Running" || journey.status === "Broadcast")) {
    return ok({
      type: InternalEventType.MessageSkipped,
      message: "Journey is not running",
    });
  }

  const result = await sendMessage({
    workspaceId,
    channel,
    useDraft: false,
    templateId,
    userPropertyAssignments,
    subscriptionGroupDetails,
    messageTags: {
      runId,
      nodeId,
      journeyId,
      messageId,
      userId,
      channel,
    },
  });
  return result;
}

export async function sendMessageV2(params: SendParamsV2): Promise<boolean> {
  const { messageId, userId, journeyId, nodeId, templateId, runId } = params;
  const sendResult = await sendMessageInner(params);
  let shouldContinue: boolean;
  let event: InternalEventType;
  let trackingProperties: TrackData["properties"] = {
    journeyId,
    nodeId,
    templateId,
    runId,
  };

  if (sendResult.isErr()) {
    shouldContinue = false;
    event = sendResult.error.type;

    trackingProperties = {
      ...trackingProperties,
      ...omit(sendResult.error, ["type"]),
    };
  } else {
    shouldContinue = true;
    event = sendResult.value.type;

    trackingProperties = {
      ...trackingProperties,
      ...omit(sendResult.value, ["type"]),
    };
  }

  const trackData: TrackData = {
    userId,
    messageId,
    event,
    properties: trackingProperties,
  };

  await submitTrack({
    workspaceId: params.workspaceId,
    data: trackData,
  });
  return shouldContinue;
}

export async function sendEmail(params: SendParams): Promise<boolean> {
  const [sent, trackData] = await sendEmailWithPayload({
    ...params,
    channel: ChannelType.Email,
  });
  if (trackData) {
    await submitTrack({ workspaceId: params.workspaceId, data: trackData });
  }
  return sent;
}

export async function isRunnable({
  userId,
  journeyId,
  eventKey,
}: {
  journeyId: string;
  userId: string;
  eventKey?: string;
}): Promise<boolean> {
  const [previousExitEvent, journey] = await Promise.all([
    prisma().userJourneyEvent.findFirst({
      where: {
        journeyId,
        userId,
        eventKey,
        type: JourneyNodeType.ExitNode,
      },
    }),
    prisma().journey.findUnique({
      where: {
        id: journeyId,
      },
    }),
  ]);
  return previousExitEvent === null || !!journey?.canRunMultiple;
}

export async function onNodeProcessedV2({
  journeyStartedAt,
  userId,
  node,
  journeyId,
  workspaceId,
  eventKey,
}: {
  journeyStartedAt: number;
  journeyId: string;
  userId: string;
  node: JourneyNode;
  workspaceId: string;
  eventKey?: string;
}) {
  const journeyStartedAtDate = new Date(journeyStartedAt);
  const nodeId = getNodeId(node);
  const messageIdName = [
    journeyStartedAt,
    journeyId,
    userId,
    node.type,
    nodeId,
  ].join("-");
  await Promise.all([
    prisma().userJourneyEvent.createMany({
      data: [
        {
          journeyStartedAt: journeyStartedAtDate,
          journeyId,
          userId,
          type: node.type,
          nodeId,
          eventKey,
        },
      ],
      skipDuplicates: true,
    }),
    submitTrack({
      workspaceId,
      data: {
        userId,
        event: InternalEventType.JourneyNodeProcessed,
        messageId: uuidv5(messageIdName, workspaceId),
        properties: {
          journeyId,
          journeyStartedAt,
          type: node.type,
          nodeId,
        },
      },
    }),
  ]);
}

export function getSegmentAssignment({
  workspaceId,
  segmentId,
  userId,
}: {
  workspaceId: string;
  segmentId: string;
  userId: string;
}): Promise<SegmentAssignment | null> {
  return prisma().segmentAssignment.findUnique({
    where: {
      workspaceId_userId_segmentId: {
        workspaceId,
        segmentId,
        userId,
      },
    },
  });
}
