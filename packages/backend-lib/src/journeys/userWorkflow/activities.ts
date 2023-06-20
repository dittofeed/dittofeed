import { SegmentAssignment } from "@prisma/client";
import { Static, Type } from "@sinclair/typebox";
import escapeHTML from "escape-html";
import { credential } from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { FCM_SECRET_NAME } from "isomorphic-lib/src/constants";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";

import { submitTrack } from "../../apps";
import { sendMail as sendEmailSendgrid } from "../../destinations/sendgrid";
import { liquidEngine, renderLiquid } from "../../liquid";
import logger from "../../logger";
import { findMessageTemplate } from "../../messageTemplates";
import prisma from "../../prisma";
import {
  EmailProviderType,
  InternalEventType,
  JourneyNode,
  JourneyNodeType,
  KnownTrackData,
  MessageNodeVariantType,
  SubscriptionGroupType,
  TemplateResourceType,
} from "../../types";
import { InternalEvent, trackInternalEvents } from "../../userEvents";
import { findAllUserPropertyAssignments } from "../../userProperties";

export { findAllUserPropertyAssignments } from "../../userProperties";

const FcmKey = Type.Object({
  projectId: Type.String(),
  clientEmail: Type.String(),
  privateKey: Type.String(),
});

type FcmKey = Static<typeof FcmKey>;

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

// FIXME dedupe
interface SendMobilePushParams {
  userId: string;
  workspaceId: string;
  runId: string;
  nodeId: string;
  templateId: string;
  journeyId: string;
  messageId: string;
  subscriptionGroupId?: string;
}

async function sendMobilePushWithPayload({
  journeyId,
  templateId,
  workspaceId,
  userId,
  runId,
  nodeId,
  messageId,
  subscriptionGroupId,
}: SendMobilePushParams): Promise<[boolean, KnownTrackData | null]> {
  const [
    messageTemplateResult,
    userPropertyAssignments,
    journey,
    subscriptionGroup,
    fcmKey,
  ] = await Promise.all([
    findMessageTemplate({ id: templateId }),
    findAllUserPropertyAssignments({
      userId,
      workspaceId,
    }),
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
    prisma().secret.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: FCM_SECRET_NAME,
        },
      },
    }),
  ]);
  if (messageTemplateResult.isErr()) {
    logger().error(
      {
        templateId,
        error: messageTemplateResult.error,
      },
      "malformed message template"
    );
    return [false, null];
  }
  const messageTemplate = messageTemplateResult.value;
  if (!messageTemplate) {
    return [
      false,
      {
        event: InternalEventType.BadWorkspaceConfiguration,
        messageId,
        userId,
        properties: {
          journeyId,
          message: "Message template not found",
          templateId,
          runId,
          messageType: MessageNodeVariantType.MobilePush,
          nodeId,
        },
      },
    ];
  }
  if (messageTemplate.definition.type !== TemplateResourceType.MobilePush) {
    logger().error(
      {
        templateId,
      },
      "tried to send non-mobile push template as mobile push"
    );
    return [false, null];
  }

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
          messageType: MessageNodeVariantType.MobilePush,
          nodeId,
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
            messageType: MessageNodeVariantType.MobilePush,
            nodeId,
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
            messageType: MessageNodeVariantType.MobilePush,
            nodeId,
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
          messageType: MessageNodeVariantType.MobilePush,
          nodeId,
          userId,
          workspaceId,
        },
      },
    ];
  }

  if (!userPropertyAssignments.deviceToken) {
    return [
      false,
      {
        event: InternalEventType.BadWorkspaceConfiguration,
        messageId,
        userId,
        properties: {
          journeyId,
          message: "Device token not found",
          templateId,
          runId,
          messageType: MessageNodeVariantType.MobilePush,
          nodeId,
          userId,
          workspaceId,
        },
      },
    ];
  }

  if (!fcmKey) {
    return [
      false,
      {
        event: InternalEventType.BadWorkspaceConfiguration,
        messageId,
        userId,
        properties: {
          journeyId,
          message: "Messaging channel secret not found",
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

  const fcmKeyValue = schemaValidate(JSON.parse(fcmKey.value), FcmKey);
  if (fcmKeyValue.isErr()) {
    return [
      false,
      {
        event: InternalEventType.BadWorkspaceConfiguration,
        messageId,
        userId,
        properties: {
          journeyId,
          message: `Messaging channel secret malformed: ${fcmKeyValue.error}`,
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
  const app = initializeApp({
    credential: credential.cert(fcmKeyValue.value),
    // databaseURL: "https://production-dittofeed.firebaseio.com",
  });
  const messaging = getMessaging(app);

  const render = (template?: string) =>
    template &&
    renderLiquid({
      userProperties: userPropertyAssignments,
      template,
      workspaceId,
      identifierKey: "deviceToken",
    });
  const title = render(messageTemplate.definition.title);
  const body = render(messageTemplate.definition.body);

  const fcmMessageId = await messaging.send({
    token: userPropertyAssignments.deviceToken,
    notification: {
      title,
      body,
      imageUrl: messageTemplate.definition.imageUrl,
    },
  });

  // FIXME consolidate with other send method
  return [
    true,
    {
      event: InternalEventType.MessageSent,
      userId,
      messageId,
      properties: {
        journeyId,
        templateId,
        workspaceId,
        runId,
        nodeId,
        subscriptionGroupId,
        fcmMessageId,
      },
    },
  ];
}

export async function sendMobilePush(
  params: SendMobilePushParams
): Promise<boolean> {
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
