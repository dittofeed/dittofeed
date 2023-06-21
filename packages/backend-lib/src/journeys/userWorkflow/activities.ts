import { Channel, JourneyStatus, SegmentAssignment } from "@prisma/client";
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
import { InternalEvent, trackInternalEvents } from "../../userEvents";
import { findAllUserPropertyAssignments } from "../../userProperties";

export { findAllUserPropertyAssignments } from "../../userProperties";

interface SendEmailParams {
  userId: string;
  workspaceId: string;
  runId: string;
  nodeId: string;
  templateId: string;
  journeyId: string;
  messageId: string;
  subscriptionGroupId?: string;
}

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
    findMessageTemplate({ id: templateId }),
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
      message: "Message template not found",
    });
  }

  if (!journey) {
    return buildSendValue(false, InternalEventType.BadWorkspaceConfiguration, {
      message: "Journey not found",
    });
  }

  if (subscriptionGroupId) {
    if (!subscriptionGroup) {
      return buildSendValue(
        false,
        InternalEventType.BadWorkspaceConfiguration,
        {
          message: "Subscription group not found",
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
      const title = render(messageTemplate.definition.title);
      const body = render(messageTemplate.definition.body);

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

export async function sendMobilePush(params: BaseSendParams): Promise<boolean> {
  const [sent, trackData] = await sendMobilePushWithPayload(params);
  if (trackData) {
    await submitTrack({ workspaceId: params.workspaceId, data: trackData });
  }
  return sent;
}

// TODO write test
async function sendEmailWithPayload({
  journeyId,
  templateId,
  workspaceId,
  userId,
  runId,
  nodeId,
  messageId,
  subscriptionGroupId,
}: SendEmailParams): Promise<[boolean, InternalEvent]> {
  const [
    journey,
    subscriptionGroup,
    defaultEmailProvider,
    emailTemplate,
    userProperties,
  ] = await Promise.all([
    prisma().journey.findUnique({
      where: {
        id: journeyId,
      },
    }),
    subscriptionGroupId
      ? prisma().subscriptionGroup.findUnique({
          where: {
            id: subscriptionGroupId,
          },
          include: {
            Segment: {
              include: {
                SegmentAssignment: {
                  where: {
                    userId,
                  },
                },
              },
            },
          },
        })
      : null,
    prisma().defaultEmailProvider.findUnique({
      where: {
        workspaceId,
      },
      include: { emailProvider: true },
    }),
    prisma().emailTemplate.findUnique({
      where: {
        id: templateId,
      },
    }),
    findAllUserPropertyAssignments({
      userId,
      workspaceId,
    }),
  ]);
  if (!journey) {
    return [
      false,
      {
        event: InternalEventType.BadWorkspaceConfiguration,
        messageId,
        userId,
        properties: {
          journeyId,
          message: "Journey not found",
          templateId,
          runId,
          messageType: MessageNodeVariantType.Email,
          nodeId,
          userId,
          workspaceId,
        },
      },
    ];
  }
  if (subscriptionGroupId) {
    if (!subscriptionGroup) {
      return [
        false,
        {
          event: InternalEventType.BadWorkspaceConfiguration,
          messageId,
          userId,
          properties: {
            journeyId,
            message: "Subscription group not found",
            subscriptionGroupId,
            templateId,
            runId,
            messageType: MessageNodeVariantType.Email,
            nodeId,
            userId,
            workspaceId,
          },
        },
      ];
    }
    const segmentAssignment =
      subscriptionGroup.Segment[0]?.SegmentAssignment[0];

    if (
      segmentAssignment?.inSegment === false ||
      (segmentAssignment === undefined &&
        subscriptionGroup.type === SubscriptionGroupType.OptIn)
    ) {
      // TODO this should skip message, but not cause user to drop out of journey. return value should not be simple boolean
      return [
        false,
        {
          event: InternalEventType.MessageSkipped,
          messageId,
          userId,
          properties: {
            journeyStatus: journey.status,
            subscriptionGroupId,
            SubscriptionGroupType: subscriptionGroup.type,
            inSubscriptionGroupSegment: String(!!segmentAssignment?.inSegment),
            message: "User is not in subscription group",
            journeyId,
            templateId,
            runId,
            messageType: MessageNodeVariantType.Email,
            nodeId,
            userId,
            workspaceId,
          },
        },
      ];
    }
  }
  if (journey.status !== "Running") {
    return [
      false,
      {
        event: InternalEventType.MessageSkipped,
        messageId,
        userId,
        properties: {
          journeyStatus: journey.status,
          message: "Journey is not running",
          journeyId,
          templateId,
          runId,
          messageType: MessageNodeVariantType.Email,
          nodeId,
          userId,
          workspaceId,
        },
      },
    ];
  }

  if (!emailTemplate) {
    return [
      false,
      {
        event: InternalEventType.BadWorkspaceConfiguration,
        messageId,
        userId,
        properties: {
          journeyId,
          message: "Template not found",
          templateId,
          runId,
          messageType: MessageNodeVariantType.Email,
          nodeId,
          userId,
          workspaceId,
        },
      },
    ];
  }
  if (!userProperties.email) {
    return [
      false,
      {
        event: InternalEventType.MessageSkipped,
        messageId,
        userId,
        properties: {
          journeyId,
          templateId,
          message: "User missing the email property",
          runId,
          messageType: MessageNodeVariantType.Email,
          nodeId,
          userId,
          workspaceId,
        },
      },
    ];
  }

  const render = (template: string) =>
    renderLiquid({
      userProperties,
      template,
      workspaceId,
      identifierKey: "email",
    });

  let from: string;
  let subject: string;
  let body: string;
  try {
    from = escapeHTML(render(emailTemplate.from));
    subject = escapeHTML(render(emailTemplate.subject));
    body = render(emailTemplate.body);
  } catch (e) {
    const err = e as Error;

    return [
      false,
      {
        event: InternalEventType.BadWorkspaceConfiguration,
        messageId,
        userId,
        properties: {
          journeyId,
          cause: err.message,
          message: "Failed to render template",
          templateId,
          runId,
          messageType: MessageNodeVariantType.Email,
          nodeId,
          userId,
          workspaceId,
        },
      },
    ];
  }
  const to = userProperties.email;

  if (!defaultEmailProvider) {
    return [
      false,
      {
        event: InternalEventType.BadWorkspaceConfiguration,
        messageId,
        userId,
        properties: {
          journeyId,
          message: "Missing default email provider",
          runId,
          messageType: MessageNodeVariantType.Email,
          nodeId,
          userId,
          to,
          from,
          subject,
          body,
          workspaceId,
          templateId,
        },
      },
    ];
  }

  switch (defaultEmailProvider.emailProvider.type) {
    case EmailProviderType.Sendgrid: {
      const result = await sendEmailSendgrid({
        mailData: {
          to,
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
        apiKey: defaultEmailProvider.emailProvider.apiKey,
      });
      if (result.isErr()) {
        logger().debug({ err: result.error });
        return [
          false,
          {
            event: InternalEventType.MessageFailure,
            userId,
            messageId,
            properties: {
              journeyId,
              runId,
              error: result.error.message,
              message: "Failed to send message to sendgrid.",
              messageType: MessageNodeVariantType.Email,
              emailProvider: defaultEmailProvider.emailProvider.type,
              nodeId,
              userId,
              to,
              from,
              subject,
              body,
              workspaceId,
              templateId,
            },
          },
        ];
      }

      return [
        true,
        {
          event: InternalEventType.MessageSent,
          userId,
          messageId,
          properties: {
            messageType: MessageNodeVariantType.Email,
            emailProvider: defaultEmailProvider.emailProvider.type,
            nodeId,
            userId,
            to,
            from,
            subject,
            body,
            templateId,
            runId,
            workspaceId,
            journeyId,
          },
        },
      ];
    }
  }

  return [
    false,
    {
      event: InternalEventType.BadWorkspaceConfiguration,
      messageId,
      userId,
      properties: {
        provider: defaultEmailProvider.emailProvider.type,
        message: "Unknown email provider type",
        runId,
        workspaceId,
        journeyId,
      },
    },
  ];
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const { workspaceId } = params;
  const [sentMessage, internalUserEvent] = await sendEmailWithPayload(params);

  await trackInternalEvents({
    workspaceId,
    events: [internalUserEvent],
  });
  return sentMessage;
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
