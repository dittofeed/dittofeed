import {
  Channel,
  EmailProvider,
  JourneyStatus,
  SegmentAssignment,
} from "@prisma/client";
import escapeHTML from "escape-html";
import { FCM_SECRET_NAME } from "isomorphic-lib/src/constants";
import { err, ok, Result } from "neverthrow";
import * as R from "remeda";

import { submitTrack } from "../../apps";
import { sendNotification } from "../../destinations/fcm";
import { sendMail as sendEmailSendgrid } from "../../destinations/sendgrid";
import { renderLiquid } from "../../liquid";
import logger from "../../logger";
import { findMessageTemplate } from "../../messageTemplates";
import prisma from "../../prisma";
import { getSubscriptionGroupWithAssignment } from "../../subscriptionGroups";
import {
  EmailProviderType,
  InternalEventType,
  JourneyNode,
  JourneyNodeType,
  KnownTrackData,
  MessageNodeVariantType,
  MessageTemplateResource,
  SubscriptionGroupType,
  TemplateResourceType,
  TrackData,
} from "../../types";
import { findAllUserPropertyAssignments } from "../../userProperties";

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
  channelName: string;
}
interface SendParams<C> extends BaseSendParams {
  getChannelConfig: ({
    workspaceId,
  }: {
    workspaceId: string;
  }) => Promise<Result<C, SendWithTrackingValue>>;
  channelSend: (
    params: BaseSendParams & {
      channel: Channel;
      channelConfig: C;
      identifier: string;
      messageTemplate: MessageTemplateResource;
      userPropertyAssignments: Awaited<
        ReturnType<typeof findAllUserPropertyAssignments>
      >;
    }
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
    properties?: TrackData["properties"]
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
  params: SendParams<C>
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
    channelName,
  } = params;
  const [
    messageTemplateResult,
    userPropertyAssignments,
    journey,
    subscriptionGroup,
    channelConfig,
    channel,
  ] = await Promise.all([
    findMessageTemplate({
      id: templateId,
      isEmail: channelName === "email",
    }),
    findAllUserPropertyAssignments({ userId, workspaceId }),
    prisma().journey.findUnique({ where: { id: journeyId } }),
    subscriptionGroupId
      ? getSubscriptionGroupWithAssignment({ userId, subscriptionGroupId })
      : null,
    getChannelConfig({ workspaceId }),
    prisma().channel.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: channelName,
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
    channelName,
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
      "malformed message template"
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
        }
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

  if (journey.status !== "Running") {
    return buildSendValue(false, InternalEventType.MessageSkipped);
  }

  if (!channel) {
    logger().error(
      {
        channel: channelName,
        workspaceId,
      },
      "channel not found"
    );
    return [false, null];
  }

  const identifier = userPropertyAssignments[channel.identifier];

  if (!identifier) {
    return buildSendValue(false, InternalEventType.BadWorkspaceConfiguration, {
      identifier,
      identifierKey: channel.identifier,
      message: "Identifier not found.",
    });
  }

  if (channelConfig.isErr()) {
    return channelConfig.error;
  }

  return channelSend({
    channelConfig: channelConfig.value,
    channel,
    messageTemplate,
    identifier,
    userPropertyAssignments,
    ...baseParams,
  });
}

interface MobilePushChannelConfig {
  fcmKey: string;
}

async function sendMobilePushWithPayload(
  params: BaseSendParams
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

      if (!fcmKey) {
        return err(
          buildSendValue(false, InternalEventType.BadWorkspaceConfiguration, {
            message: "FCM key not found",
          })
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
    }) {
      const render = (template?: string) =>
        template &&
        renderLiquid({
          userProperties: userPropertyAssignments,
          template,
          workspaceId,
          identifierKey: channel.identifier,
        });

      if (messageTemplate.definition.type !== TemplateResourceType.MobilePush) {
        return buildSendValue(
          false,
          InternalEventType.BadWorkspaceConfiguration,
          {
            message: "Message template is not a mobile push template",
          }
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
          }
        );
      }

      const fcmMessageId = await sendNotification({
        key: channelConfig.fcmKey,
        token: identifier,
        notification: {
          title,
          body,
          imageUrl: messageTemplate.definition.imageUrl,
        },
        android: messageTemplate.definition.android,
      });
      return buildSendValue(true, InternalEventType.MessageSent, {
        fcmMessageId,
      });
    },
  });
}

export async function sendMobilePush(
  params: Omit<BaseSendParams, "channelName">
): Promise<boolean> {
  const [sent, trackData] = await sendMobilePushWithPayload({
    ...params,
    channelName: "mobile",
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
  params: BaseSendParams
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
          })
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
    }) {
      const render = (template: string) =>
        template &&
        renderLiquid({
          userProperties: userPropertyAssignments,
          template,
          workspaceId,
          identifierKey: channel.identifier,
        });

      if (messageTemplate.definition.type !== TemplateResourceType.Email) {
        return buildSendValue(
          false,
          InternalEventType.BadWorkspaceConfiguration,
          {
            message: "Message template is not a mobile push template",
          }
        );
      }
      let from: string;
      let subject: string;
      let body: string;
      try {
        from = escapeHTML(render(messageTemplate.definition.from));
        subject = escapeHTML(render(messageTemplate.definition.subject));
        body = render(messageTemplate.definition.body);
      } catch (e) {
        const error = e as Error;
        return buildSendValue(
          false,
          InternalEventType.BadWorkspaceConfiguration,
          {
            message: `render failure: ${error.message}`,
          }
        );
      }

      switch (channelConfig.emailProvider.type) {
        case EmailProviderType.Sendgrid: {
          // TODO distinguish between retryable and non-retryable errors
          const result = await sendEmailSendgrid({
            mailData: {
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
            },
            apiKey: channelConfig.emailProvider.apiKey,
          });

          if (result.isErr()) {
            logger().error({ err: result.error });
            return buildSendValue(false, InternalEventType.MessageFailure, {
              message: `Failed to send message to sendgrid: ${result.error.message}`,
            });
          }

          return buildSendValue(true, InternalEventType.MessageSent);
        }
        default: {
          return buildSendValue(
            false,
            InternalEventType.BadWorkspaceConfiguration,
            {
              message: `Unknown email provider type: ${channelConfig.emailProvider.type}`,
            }
          );
        }
      }
    },
  });
}

export async function sendEmail(
  params: Omit<BaseSendParams, "channelName">
): Promise<boolean> {
  const [sent, trackData] = await sendEmailWithPayload({
    ...params,
    channelName: "email",
  });
  if (trackData) {
    await submitTrack({ workspaceId: params.workspaceId, data: trackData });
  }
  return sent;
}

export async function isRunnable({
  userId,
  journeyId,
}: {
  journeyId: string;
  userId: string;
}): Promise<boolean> {
  const previousExitEvent = await prisma().userJourneyEvent.findFirst({
    where: {
      journeyId,
      userId,
      type: JourneyNodeType.ExitNode,
    },
  });
  return previousExitEvent === null;
}

export async function onNodeProcessed({
  journeyStartedAt,
  userId,
  node,
  journeyId,
}: {
  journeyStartedAt: number;
  journeyId: string;
  userId: string;
  node: JourneyNode;
}) {
  const journeyStartedAtDate = new Date(journeyStartedAt);
  await prisma().userJourneyEvent.upsert({
    where: {
      journeyId_userId_type_journeyStartedAt: {
        journeyStartedAt: journeyStartedAtDate,
        journeyId,
        userId,
        type: node.type,
      },
    },
    update: {},
    create: {
      journeyStartedAt: journeyStartedAtDate,
      journeyId,
      userId,
      type: node.type,
    },
  });
}

export type OnNodeProcessed = typeof onNodeProcessed;

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
