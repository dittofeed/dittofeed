import { randomUUID } from "node:crypto";

import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import prisma from "../prisma";
import {
  AmazonSesBounceEvent,
  AmazonSesBounceSubType,
  AmazonSesBounceType,
  AmazonSesNotificationType,
  AmazonSNSEventTypes,
  AmazonSNSNotificationEvent,
} from "../types";
import { handleSesNotification } from "./amazonses";

describe("webhooksController", () => {
  // let workspace: Workspace;

  beforeEach(async () => {
    await prisma().workspace.create({
      data: {
        name: `test-${randomUUID()}`,
      },
    });
  });

  describe("handleSesNotification", () => {
    it("it should work with a bounce event", async () => {
      const encodedMessage = JSON.stringify({
        eventType: AmazonSesNotificationType.Bounce,
        bounce: {
          feedbackId:
            "010001888dc9cc1d-99a6fe5a-801e-4631-b0cf-c1f49c6dd999-000000",
          bounceType: AmazonSesBounceType.Transient,
          bounceSubType: AmazonSesBounceSubType.MailboxFull,
          bouncedRecipients: [
            {
              emailAddress: "john.smith123@gmail.com",
              action: "failed",
              status: "4.4.7",
              diagnosticCode:
                "smtp; 554 4.4.7 Message expired: unable to deliver in 840 minutes.<452-4.2.2 The recipient's inbox is out of storage space. Please direct the<CRLF>452-4.2.2 recipient to<CRLF>452 4.2.2  https://support.google.com/mail/?p=OverQuotaTemp xx88yy99zz357-sample414si719007585a.670 - gsmtp>",
            },
          ],
          timestamp: "2024-11-30T15:56:37.407Z",
          remoteMtaIp: "192.168.1.100",
          reportingMTA: "dns; mail-server-01.example.com",
        },
        mail: {
          timestamp: "2024-11-30T01:56:36.827Z",
          source: "Customer Support <support@example.com>",
          sourceArn: "arn:aws:ses:us-east-1:123456789012:identity/example.com",
          sendingAccountId: "123456789012",
          messageId:
            "010001888ac8bf5b-99942de2-5785-4fc9-bc3e-3e9e599e9999-000000",
          destination: ["john.smith123@gmail.com"],
          headersTruncated: false,
          headers: [
            {
              name: "From",
              value: "Customer Support <support@example.com>",
            },
            {
              name: "To",
              value: "john.smith123@gmail.com",
            },
            {
              name: "Subject",
              value: "Check Your Credit Report Today - Special Offer!",
            },
            {
              name: "MIME-Version",
              value: "1.0",
            },
            {
              name: "Content-Type",
              value: "text/html; charset=UTF-8",
            },
            {
              name: "Content-Transfer-Encoding",
              value: "quoted-printable",
            },
            {
              name: "List-Unsubscribe-Post",
              value: "List-Unsubscribe=One-Click",
            },
            {
              name: "List-Unsubscribe",
              value:
                "<https://app.example.com/unsubscribe?w=abcd1234-5678-90ef-ghij-klmnopqrstuv&i=john.smith123%40gmail.com&ik=email&h=11aa22bb33cc44dd55ee66ff77gg88hh99ii00jj11kk22ll33mm44nn55oo&s=sample-id-12345&sub=0>",
            },
            {
              name: "List-ID",
              value: "Default - Email <marketing-list-001.example.com>>",
            },
          ],
          commonHeaders: {
            from: ["Customer Support <support@example.com>"],
            to: ["john.smith123@gmail.com"],
            messageId:
              "010001888ac8bf5b-99942de2-5785-4fc9-bc3e-3e9e599e9999-000000",
            subject: "Check Your Credit Report Today - Special Offer!",
          },
          tags: {
            "ses:operation": ["SendEmail"],
            channel: ["Email"],
            messageId: ["aa895c37-8efd-406f-9deb-bb071ee76222"],
            "ses:caller-identity": ["email-service-test"],
            templateId: ["template-12345-abcd-efgh-ijkl-mnopqrstuvwx"],
            journeyId: ["journey-12345-abcd-efgh-ijkl-mnopqrstuvwx"],
            userId: ["user-12345-abcd-efgh-ijkl-mnopqrstuvwx"],
            "ses:source-tls-version": ["TLSv1.3"],
            "ses:configuration-set": ["Marketing"],
            "ses:source-ip": ["10.0.0.100"],
            "ses:from-domain": ["example.com"],
            runId: ["run-12345-abcd-efgh-ijkl-mnopqrstuvwx"],
            nodeId: ["email-broadcast"],
            workspaceId: ["workspace-12345-abcd-efgh-ijkl-mnopqrstuvwx"],
          },
        },
      } satisfies AmazonSesBounceEvent);

      const body: AmazonSNSNotificationEvent = {
        Type: AmazonSNSEventTypes.Notification,
        Message: encodedMessage,
        MessageId: randomUUID(),
        TopicArn: randomUUID(),
        Timestamp: new Date().toISOString(),
        SignatureVersion: "1",
        Signature: randomUUID(),
        SigningCertURL: randomUUID(),
        UnsubscribeURL: randomUUID(),
      };
      const result = await handleSesNotification(body);
      unwrap(result);
    });
  });
});
