import { APIRequestContext, APIResponse, expect, test } from "@playwright/test";

/**
 * The trunk pipeline: an event enters the workspace through the public API,
 * matches an event-entry journey, and produces a delivery that is visible in
 * the dashboard. Everything here talks to a *running* stack.
 *
 * The suite is self-contained: it creates its own email provider (the `Test`
 * provider, which records a successful send without hitting the network),
 * template, and journey, then deletes them again. It only needs a workspace id.
 */
const apiBaseUrl = (
  process.env.DASHBOARD_API_BASE ?? "http://localhost:3001"
).replace(/\/$/, "");
const workspaceId = process.env.DF_WORKSPACE_ID ?? "";

test.skip(!workspaceId, "set DF_WORKSPACE_ID to run the journey pipeline suite");

const runId = `e2e-${Date.now().toString(36)}`;
const eventName = `E2E_TRUNK_${runId}`;
const userId = `e2e-user-${runId}`;
const userEmail = `${userId}@example.com`;
const templateName = `e2e-template-${runId}`;
const journeyName = `e2e-journey-${runId}`;
const subscriptionGroupName = `e2e-group-${runId}`;
const writeKeyName = `e2e-key-${runId}`;
const messageNodeId = `e2e-message-${runId}`;

const deliverySentStatus = "DFInternalMessageSent";

interface IdResource {
  id: string;
}

interface WriteKeyResource {
  writeKeyName: string;
  writeKeyValue: string;
  secretId: string;
}

interface Delivery {
  status: string;
  userId: string;
}

interface PipelineState {
  templateId?: string;
  journeyId?: string;
  subscriptionGroupId?: string;
  deliveryFound?: boolean;
}

const state: PipelineState = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIdResource(value: unknown): value is IdResource {
  return isRecord(value) && typeof value.id === "string";
}

function isWriteKeyResource(value: unknown): value is WriteKeyResource {
  return (
    isRecord(value) &&
    typeof value.writeKeyName === "string" &&
    typeof value.writeKeyValue === "string" &&
    typeof value.secretId === "string"
  );
}

function isDelivery(value: unknown): value is Delivery {
  return (
    isRecord(value) &&
    typeof value.status === "string" &&
    typeof value.userId === "string"
  );
}

function deliveriesFrom(value: unknown): Delivery[] {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return [];
  }
  return value.items.filter(isDelivery);
}

/** Fails with the response body when the request is not successful. */
async function expectOk(
  response: APIResponse,
  what: string,
): Promise<unknown> {
  const body = await response.text();
  expect(
    response.ok(),
    `${what} failed with ${response.status()}: ${body}`,
  ).toBeTruthy();
  return body ? JSON.parse(body) : undefined;
}

async function createWriteKeyHeader(request: APIRequestContext) {
  const headers = { "content-type": "application/json" };
  await expectOk(
    await request.put(`${apiBaseUrl}/api/settings/write-keys`, {
      headers,
      data: { workspaceId, writeKeyName },
    }),
    "create write key",
  );

  const writeKeys = await expectOk(
    await request.get(`${apiBaseUrl}/api/settings/write-keys`, {
      params: { workspaceId },
    }),
    "list write keys",
  );
  if (!Array.isArray(writeKeys)) {
    throw new Error("write key list was not an array");
  }
  const writeKey = writeKeys.filter(isWriteKeyResource).find(
    (key) => key.writeKeyName === writeKeyName,
  );
  if (!writeKey) {
    throw new Error(`write key ${writeKeyName} was not created`);
  }

  const credentials = Buffer.from(
    `${writeKey.secretId}:${writeKey.writeKeyValue}`,
  ).toString("base64");
  return `Basic ${credentials}`;
}

async function bestEffort(what: string, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    // Cleanup must never hide the actual test failure.
    process.stderr.write(`failed to clean up ${what}: ${String(error)}\n`);
  }
}

test.describe.configure({ mode: "serial" });

test.describe("journey pipeline", () => {
  test.afterAll(async ({ request }) => {
    const headers = { "content-type": "application/json" };
    await bestEffort("journey", () =>
      request.delete(`${apiBaseUrl}/api/journeys`, {
        headers,
        data: { workspaceId, id: state.journeyId },
      }),
    );
    await bestEffort("template", () =>
      request.delete(`${apiBaseUrl}/api/content/templates`, {
        headers,
        data: { workspaceId, id: state.templateId, type: "Email" },
      }),
    );
    await bestEffort("subscription group", () =>
      request.delete(`${apiBaseUrl}/api/subscription-groups`, {
        headers,
        data: { id: state.subscriptionGroupId },
      }),
    );
    await bestEffort("write key", () =>
      request.delete(`${apiBaseUrl}/api/settings/write-keys`, {
        headers,
        data: { workspaceId, writeKeyName },
      }),
    );
  });

  test("an event flows through a journey and produces a delivery", async ({
    request,
  }) => {
    test.setTimeout(180_000);
    const headers = { "content-type": "application/json" };

    // A provider must exist before a workspace can send email, and the send
    // path reads the workspace's *default* provider, so this overwrites it.
    // The `Test` provider records a successful send without contacting anyone.
    // Point the suite at a disposable workspace - the previous default cannot
    // be read back through the API, so it cannot be restored afterwards.
    await expectOk(
      await request.put(`${apiBaseUrl}/api/settings/email-providers`, {
        headers,
        data: { workspaceId, setDefault: true, config: { type: "Test" } },
      }),
      "configure email provider",
    );

    const subscriptionGroup = await expectOk(
      await request.put(`${apiBaseUrl}/api/subscription-groups`, {
        headers,
        data: {
          workspaceId,
          name: subscriptionGroupName,
          channel: "Email",
          type: "OptOut",
        },
      }),
      "create subscription group",
    );
    if (!isIdResource(subscriptionGroup)) {
      throw new Error("subscription group was not created");
    }
    state.subscriptionGroupId = subscriptionGroup.id;

    const template = await expectOk(
      await request.put(`${apiBaseUrl}/api/content/templates`, {
        headers,
        data: {
          workspaceId,
          name: templateName,
          definition: {
            type: "Email",
            from: "e2e@example.com",
            subject: "Hello {{ user.id }}",
            body: [
              "<mjml><mj-body><mj-section><mj-column><mj-text>",
              "This message was sent by the Dittofeed end-to-end test.",
              "</mj-text></mj-column></mj-section></mj-body></mjml>",
            ].join(""),
          },
        },
      }),
      "create message template",
    );
    if (!isIdResource(template)) {
      throw new Error("message template was not created");
    }
    state.templateId = template.id;

    const journey = await expectOk(
      await request.put(`${apiBaseUrl}/api/journeys`, {
        headers,
        data: {
          workspaceId,
          name: journeyName,
          status: "Running",
          canRunMultiple: true,
          definition: {
            entryNode: {
              type: "EventEntryNode",
              event: eventName,
              child: messageNodeId,
            },
            exitNode: { type: "ExitNode" },
            nodes: [
              {
                id: messageNodeId,
                type: "MessageNode",
                subscriptionGroupId: state.subscriptionGroupId,
                variant: { type: "Email", templateId: template.id },
                child: "ExitNode",
              },
            ],
          },
        },
      }),
      "create journey",
    );
    if (!isIdResource(journey)) {
      throw new Error("journey was not created");
    }
    state.journeyId = journey.id;

    const authorization = await createWriteKeyHeader(request);
    const publicHeaders = { "content-type": "application/json", authorization };

    const identifyResponse = await request.post(
      `${apiBaseUrl}/api/public/apps/identify`,
      {
        headers: publicHeaders,
        data: {
          messageId: `${runId}-identify`,
          userId,
          traits: { email: userEmail },
        },
      },
    );
    expect(
      identifyResponse.status(),
      `identify: ${await identifyResponse.text()}`,
    ).toBe(204);

    // Traits only reach the journey as user properties once the computed
    // properties workflow has processed the identify event, and that workflow
    // observes new events on an interval (two minutes by default). Nudge it and
    // re-send the event until the message is delivered, instead of sleeping for
    // a fixed interval that is both slow and still racy.
    let attempt = 0;
    await expect
      .poll(
        async () => {
          attempt += 1;
          await request.post(
            `${apiBaseUrl}/api/computed-properties/trigger-recompute`,
            { headers, data: { workspaceId } },
          );
          const trackResponse = await request.post(
            `${apiBaseUrl}/api/public/apps/track`,
            {
              headers: publicHeaders,
              data: {
                messageId: `${runId}-track-${attempt}`,
                userId,
                event: eventName,
              },
            },
          );
          expect(
            trackResponse.status(),
            `track: ${await trackResponse.text()}`,
          ).toBe(204);

          const response = await request.get(`${apiBaseUrl}/api/deliveries`, {
            params: { workspaceId, journeyId: journey.id, userId, limit: 10 },
          });
          if (!response.ok()) {
            return [];
          }
          return deliveriesFrom(await response.json()).map(
            (delivery) => delivery.status,
          );
        },
        {
          message: [
            "journey should deliver the email message.",
            "The worker must run the computed properties workflow",
            "(start it with BOOTSTRAP_WORKER=true), otherwise the user's email",
            "trait is never materialized and the message is skipped.",
          ].join(" "),
          timeout: 150_000,
          intervals: [2_000],
        },
      )
      .toContain(deliverySentStatus);

    state.deliveryFound = true;
  });

  test("the journey and its delivery are visible in the dashboard", async ({
    page,
    request,
  }) => {
    test.skip(!state.deliveryFound, "the pipeline test must pass first");
    test.setTimeout(120_000);
    const journeyId = state.journeyId ?? "";

    await page.goto("/dashboard/journeys");
    await expect(page.getByText(journeyName)).toBeVisible();

    const response = await request.get(`${apiBaseUrl}/api/deliveries`, {
      params: { workspaceId, journeyId, userId, limit: 10 },
    });
    expect(response.ok()).toBeTruthy();
    const deliveries = deliveriesFrom(await response.json());
    expect(
      deliveries.some((delivery) => delivery.status === deliverySentStatus),
    ).toBe(true);
  });
});
