import { SegmentAssignment } from "@prisma/client";
import escapeHTML from "escape-html";
import { renderWithUserProperties } from "isomorphic-lib/src/liquid";
import { UndefinedVariableError } from "liquidjs";

import { sendMail as sendEmailSendgrid } from "../../destinations/sendgrid";
import prisma from "../../prisma";
import {
  EmailProviderType,
  InternalEventType,
  JourneyNode,
  JourneyNodeType,
  MessageNodeVariantType,
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
}

async function sendEmailWithPayload({
  journeyId,
  templateId,
  workspaceId,
  userId,
  runId,
  nodeId,
  messageId,
}: SendEmailParams): Promise<[boolean, InternalEvent]> {
  const journey = await prisma().journey.findUnique({
    where: {
      id: journeyId,
    },
  });
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
        },
      },
    ];
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
        },
      },
    ];
  }

  const [defaultEmailProvider, emailTemplate, userProperties] =
    await Promise.all([
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
      }),
    ]);

  if (!emailTemplate) {
    return [
      false,
      {
        event: InternalEventType.BadWorkspaceConfiguration,
        messageId,
        userId,
        properties: {
          templateId,
          message: "Template not found",
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
          templateId,
          message: "Template not found",
        },
      },
    ];
  }

  const render = (template: string) =>
    renderWithUserProperties({ userProperties, template });

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
          cause: err.message,
          message: "Failed to render template",
          templateId,
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
          message: "Missing default email provider",
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
        },
        apiKey: defaultEmailProvider.emailProvider.apiKey,
      });
      if (result.isErr()) {
        return [
          false,
          {
            event: InternalEventType.MessageFailure,
            userId,
            messageId,
            properties: {
              runId,
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
            runId,
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
