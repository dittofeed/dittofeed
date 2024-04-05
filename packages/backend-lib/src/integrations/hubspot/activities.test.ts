import { randomUUID } from "crypto";

import { calculateHubspotEmailChanges } from "./activities";

describe("hubspot activities", () => {
  describe("calculateHubspotEmailChanges", () => {
    describe("when the user has opened an email before a sync has ocurred", () => {
      it("should calculate email changes", () => {
        const changes = calculateHubspotEmailChanges({
          events: [
            {
              event: "DFEmailOpened",
              timestamp: "2023-08-30T02:41:22",
              properties: {
                userId: "userid-26404",
                runId: "e9bce486-89ff-4dc0-ab45-658f1549a6f9",
                nodeId: "198e268e-9d9d-43d5-af5b-79e0e301de90",
                templateId: "4bad6541-aabf-46ce-a51e-0702773b8397",
                workspaceId: "9c201f33-5a90-4981-91c9-40bacb07a552",
                journeyId: "a1eaa9e1-0017-464f-ae00-3fd6bbda374f",
                email: "test@email.com",
                messageId: "c48b9513-2a37-4234-ae0b-e428008a5c43",
              },
            },
            {
              properties: {
                workspaceId: "9c201f33-5a90-4981-91c9-40bacb07a552",
                runId: "e9bce486-89ff-4dc0-ab45-658f1549a6f9",
                nodeId: "198e268e-9d9d-43d5-af5b-79e0e301de90",
                templateId: "4bad6541-aabf-46ce-a51e-0702773b8397",
                messageId: "c48b9513-2a37-4234-ae0b-e428008a5c43",
                email: "test@email.com",
                userId: "userid-26404",
                journeyId: "a1eaa9e1-0017-464f-ae00-3fd6bbda374f",
              },
              event: "DFEmailOpened",
              timestamp: "2023-08-29T18:42:53",
            },
            {
              properties: {
                userId: "userid-26404",
                messageId: "c48b9513-2a37-4234-ae0b-e428008a5c43",
                journeyId: "a1eaa9e1-0017-464f-ae00-3fd6bbda374f",
                email: "test@email.com",
                runId: "e9bce486-89ff-4dc0-ab45-658f1549a6f9",
                workspaceId: "9c201f33-5a90-4981-91c9-40bacb07a552",
                templateId: "4bad6541-aabf-46ce-a51e-0702773b8397",
                nodeId: "198e268e-9d9d-43d5-af5b-79e0e301de90",
              },
              event: "DFEmailDelivered",
              timestamp: "2023-08-29T18:37:12",
            },
            {
              timestamp: "2023-08-29T18:37:07",
              properties: {
                templateId: "4bad6541-aabf-46ce-a51e-0702773b8397",
                from: "sender@email.com",
                nodeId: "198e268e-9d9d-43d5-af5b-79e0e301de90",
                body: "<div>test email</div>\n",
                runId: "e9bce486-89ff-4dc0-ab45-658f1549a6f9",
                to: "test@email.com",
                subject: "test",
                journeyId: "a1eaa9e1-0017-464f-ae00-3fd6bbda374f",
                subscriptionGroupId: "57a63338-0e5e-46f1-a868-f8283510622d",
                channel: "Email",
              },
              event: "DFInternalMessageSent",
            },
          ],
          workspaceId: randomUUID(),
          owners: {},
          userId: randomUUID(),
          pastEmails: [],
        });
        expect(changes).toEqual({
          newEmails: [
            {
              hs_timestamp: 1693334227000,
              hs_email_html: "<div>test email</div>\n",
              hs_email_subject: "test",
              hs_email_status: "SENT",
              from: "sender@email.com",
            },
          ],
          emailUpdates: [],
        });
      });
    });
  });
});
