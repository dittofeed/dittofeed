# Message Third Parties

Currently our codebase assumes that when journeys and broadcasts message users, we message them directly. EX: in the case of emails we send the message to their "email" user property, and send an sms to their "phone" user property. We want to open up these options so that we allow users to message third parties e.g. we might want to respond to user performing an action by messaging their manager.

The way we intend to solve this is by allow message templates to be configured with a custom "to" value, which would be a reference to a particular user property. This value would be optional, but if provided, it would override the recipient address with the resolved value.

An additional constraints:

- Our webhooks, which rely on the users' "to" values (emails, phone numbers), to resolve the user id, must continue to work.
- Our subscription logic, and unsubscribe links, which rely on these values must continue to work.

## Coding Tips

See `./AGENTS.md` for helpful commands e.g. linting, tests, type checking.

### Test-Driven Development (TDD) Approach

We follow TDD for this feature. For each step:

1. **Write a failing test first** - Create the test that defines the expected behavior. If the function/interface doesn't exist yet, create an empty stub so the test compiles but fails.
2. **Implement the feature** - Write the minimal code to make the test pass.
3. **Confirm the test passes** - Run the test to verify the implementation works.

### Testing Guidelines

- **Real database interactions** - Do not mock database calls
- **Mock external HTTP only** - Only mock axios for external HTTP calls (webhooks, etc.)
- **Use Test providers** - Use `EmailProviderType.Test` and `SmsProviderType.Test`
- **Integration tests preferred** - Tests that span multiple backend methods are highly desirable
- **Avoid UI tests** - Testing that crosses the UX vs API/backend barrier is undesirable due to non-determinacy and slowness

### Assistance

If you get stuck, attempting the same task multiple times but failing (getting type errors to resolve, getting tests to pass), take a step back, and ask for assistance from the user.

## Callsite Analysis

The following callsites invoke `sendMessage` (or its variants):

1. **Journeys** (`packages/backend-lib/src/journeys/userWorkflow/activities.ts:248`):
   - `sendMessageInner` → fetches user properties via `findAllUserPropertyAssignments()` → calls `sender()`

2. **Broadcasts** (`packages/backend-lib/src/broadcasts/activities.ts:360`):
   - `sendMessagesFactory` → builds `userPropertyAssignments` from user data → calls `sender()`

3. **Transactional API** (`packages/backend-lib/src/messaging.ts:2617` via `batchMessageUsers`):
   - Fetches user properties, merges with request → calls `sendMessage()`

**No changes needed to callsites.** All callsites already pass the full `userPropertyAssignments` containing all user properties (including custom ones like `managerEmail`). The template is loaded inside `sendEmail()`/`sendSms()` where we read the `identifierKey` and resolve the recipient from the existing `userPropertyAssignments`.

## Steps

### Step 1: Update Template Type Definitions

#### 1.1 Write Failing Test

**File:** `packages/backend-lib/src/messaging.test.ts`

First, write a test that expects the new `identifierKey` field on email templates. This test will fail because the type doesn't support `identifierKey` yet.

```typescript
describe("sendEmail", () => {
  describe("when template has custom identifierKey", () => {
    it("should send to the custom identifier key address", async () => {
      // Create template with identifierKey - this will cause a type error initially
      const template = await insert({
        table: dbMessageTemplate,
        values: {
          id: randomUUID(),
          workspaceId: workspace.id,
          name: `template-${randomUUID()}`,
          definition: {
            type: ChannelType.Email,
            from: "support@company.com",
            subject: "Hello Manager",
            body: "Test body.",
            identifierKey: "managerEmail", // NEW FIELD - will cause type error
          } satisfies EmailTemplateResource,
          updatedAt: new Date(),
          createdAt: new Date(),
        },
      }).then(unwrap);

      // ... rest of test setup (subscription group, email provider, etc.)

      const payload = await sendEmail({
        workspaceId: workspace.id,
        templateId: template.id,
        userPropertyAssignments: {
          id: "user-123",
          email: "user@example.com",
          managerEmail: "manager@company.com",
        },
        userId: "user-123",
        useDraft: false,
        subscriptionGroupDetails: { /* ... */ },
        providerOverride: EmailProviderType.Test,
      });

      const result = unwrap(payload);
      expect(result.type).toBe(InternalEventType.MessageSent);
      if (result.type === InternalEventType.MessageSent) {
        expect(result.variant.to).toBe("manager@company.com"); // Should send to manager
      }
    });
  });
});
```

#### 1.2 Implement

**File:** `packages/isomorphic-lib/src/types.ts`

Add an optional `identifierKey` field to email and SMS template types (consistent with webhook templates):

- Add `identifierKey: Type.Optional(Type.String())` to `CodeEmailContents` (around line 1649)
- Add `identifierKey: Type.Optional(Type.String())` to `LowCodeEmailContents` (around line 1667)
- Add `identifierKey: Type.Optional(Type.String())` to `SmsContents` (around line 1741)

This field will hold the **name of a user property** (e.g., `"managerEmail"`) whose value will be used as the recipient. When not specified, defaults to `"email"` for email templates and `"phone"` for SMS templates (current behavior).

#### 1.3 Confirm

Run type checking to confirm the type is valid:
```bash
yarn workspace isomorphic-lib check
```

The test from 1.1 should now compile (but still fail at runtime because the sending logic hasn't changed yet).

---

### Step 2: Update Message Sending Logic

#### 2.1 Write Failing Test

**File:** `packages/backend-lib/src/messaging.test.ts`

The test from Step 1.1 should already be in place. It will fail because `sendEmail()` doesn't use the custom `identifierKey` yet - it still sends to the default `email` property.

Add additional tests:

```typescript
describe("when template has custom identifierKey", () => {
  let template: MessageTemplate;
  let subscriptionGroup: SubscriptionGroup;

  beforeEach(async () => {
    // Setup template with identifierKey: "managerEmail"
    // Setup subscription group, email provider, subscription secret
  });

  it("should send to the custom identifier key address", async () => {
    // ... (from Step 1.1)
  });

  it("should skip message when custom identifierKey property is missing", async () => {
    const payload = await sendEmail({
      workspaceId: workspace.id,
      templateId: template.id,
      userPropertyAssignments: {
        id: "user-123",
        email: "user@example.com",
        // managerEmail is intentionally missing
      },
      userId: "user-123",
      useDraft: false,
      subscriptionGroupDetails: { /* ... */ },
      providerOverride: EmailProviderType.Test,
    });

    expect(payload.isErr()).toBe(true);
    if (payload.isErr()) {
      expect(payload.error.type).toBe(InternalEventType.MessageSkipped);
    }
  });

  it("should fall back to default identifierKey when not specified", async () => {
    // Create template WITHOUT identifierKey
    const defaultTemplate = await insert({
      table: dbMessageTemplate,
      values: {
        // ... no identifierKey field
      },
    }).then(unwrap);

    const payload = await sendEmail({
      workspaceId: workspace.id,
      templateId: defaultTemplate.id,
      userPropertyAssignments: {
        id: "user-123",
        email: "user@example.com",
        managerEmail: "manager@company.com",
      },
      // ...
    });

    const result = unwrap(payload);
    if (result.type === InternalEventType.MessageSent) {
      expect(result.variant.to).toBe("user@example.com"); // Falls back to email
    }
  });
});
```

#### 2.2 Implement

**File:** `packages/backend-lib/src/messaging.ts`

Modify `sendEmail()` (line ~809) and `sendSms()` (line ~1716):

1. Use `messageTemplateDefinition.identifierKey` if set, otherwise fall back to the channel default (`CHANNEL_IDENTIFIERS.Email` or `CHANNEL_IDENTIFIERS.Sms`)
2. Resolve the recipient address from `userPropertyAssignments[resolvedIdentifierKey]`

```typescript
// Current (line ~915):
const identifier = userPropertyAssignments[identifierKey]; // identifierKey is always CHANNEL_IDENTIFIERS.Email

// New:
const resolvedIdentifierKey = messageTemplateDefinition.identifierKey ?? CHANNEL_IDENTIFIERS.Email;
const identifier = userPropertyAssignments[resolvedIdentifierKey];
```

#### 2.3 Confirm

```bash
yarn jest packages/backend-lib/src/messaging.test.ts --testNamePattern="custom identifierKey"
```

---

### Step 3: Update Unsubscribe Header Generation

#### 3.1 Write Failing Test

**File:** `packages/backend-lib/src/messaging.test.ts`

Add a test that verifies the unsubscribe URL contains the custom identifierKey:

```typescript
it("should generate unsubscribe link with custom identifierKey", async () => {
  const payload = await sendEmail({
    workspaceId: workspace.id,
    templateId: template.id, // template with identifierKey: "managerEmail"
    userPropertyAssignments: {
      id: "user-123",
      email: "user@example.com",
      managerEmail: "manager@company.com",
    },
    userId: "user-123",
    useDraft: false,
    subscriptionGroupDetails: {
      id: subscriptionGroup.id,
      name: subscriptionGroup.name,
      type: SubscriptionGroupType.OptOut,
      action: null,
    },
    providerOverride: EmailProviderType.Test,
  });

  const result = unwrap(payload);
  if (result.type !== InternalEventType.MessageSent || result.variant.type !== ChannelType.Email) {
    throw new Error("Expected email message sent");
  }

  // Extract unsubscribe URL from body
  const unsubscribeUrl = result.variant.body.match(/href="([^"]*unsubscribe[^"]*)"/)?.[1];
  expect(unsubscribeUrl).toBeDefined();

  const url = new URL(unsubscribeUrl!);
  expect(url.searchParams.get("ik")).toEqual("managerEmail"); // identifierKey
  expect(url.searchParams.get("i")).toEqual("manager@company.com"); // identifier value
});
```

**File:** `packages/backend-lib/src/subscriptionGroups.test.ts`

```typescript
describe("generateSubscriptionChangeUrl", () => {
  it("should include custom identifierKey in URL params", async () => {
    // ... setup workspace, subscription group, secret

    const url = generateSubscriptionChangeUrl({
      workspaceId,
      userId,
      subscriptionSecret: secret.value,
      identifier: "manager@company.com",
      identifierKey: "managerEmail", // custom key
      changedSubscription: subscriptionGroup.id,
      subscriptionChange: SubscriptionChange.Unsubscribe,
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("i")).toEqual("manager@company.com");
    expect(parsed.searchParams.get("ik")).toEqual("managerEmail");
  });
});
```

#### 3.2 Implement

**File:** `packages/backend-lib/src/messaging/email.ts`

The `constructUnsubscribeHeaders()` function (line 35) currently hardcodes `CHANNEL_IDENTIFIERS.Email` as the `identifierKey`. Update it to accept the `identifierKey` as a parameter:

```typescript
export function constructUnsubscribeHeaders({
  to,
  from,
  userId,
  identifierKey, // NEW: accept as parameter instead of hardcoding
  subscriptionGroupSecret,
  subscriptionGroupName,
  workspaceId,
  subscriptionGroupId,
}: {
  to: string;
  from: string;
  userId: string;
  identifierKey: string; // NEW
  subscriptionGroupSecret: string;
  subscriptionGroupName: string;
  workspaceId: string;
  subscriptionGroupId: string;
}): Result<UnsubscribeHeaders, MessageTemplateRenderError> {
  // ...
  const url = generateSubscriptionChangeUrl({
    workspaceId,
    identifier: to,
    identifierKey, // Now uses the passed parameter
    subscriptionSecret: subscriptionGroupSecret,
    userId,
    changedSubscription: subscriptionGroupId,
    subscriptionChange: SubscriptionChange.Unsubscribe,
  });
  // ...
}
```

**File:** `packages/backend-lib/src/messaging.ts`

Update the call to `constructUnsubscribeHeaders()` (line ~987) to pass the resolved `identifierKey`:

```typescript
constructUnsubscribeHeaders({
  to,
  from,
  userId,
  identifierKey: resolvedIdentifierKey, // Pass the custom identifier key
  subscriptionGroupSecret,
  subscriptionGroupName: subscriptionGroupDetails.name,
  workspaceId,
  subscriptionGroupId: subscriptionGroupDetails.id,
})
```

#### 3.3 Confirm

```bash
yarn jest packages/backend-lib/src/messaging.test.ts --testNamePattern="unsubscribe link"
yarn jest packages/backend-lib/src/subscriptionGroups.test.ts --testNamePattern="custom identifierKey"
```

---

### Step 4: End-to-End Unsubscribe Flow Test

#### 4.1 Write Failing Test

**File:** `packages/backend-lib/src/subscriptionManagementEndToEnd.test.ts`

This is the most important integration test. It verifies the complete flow works end-to-end:

```typescript
describe("when a user sends to a third party and they click unsubscribe", () => {
  let workspace: Workspace;
  let subscriptionGroup: SubscriptionGroup;
  let userId: string;
  let templateId: string;

  beforeEach(async () => {
    userId = randomUUID();
    workspace = unwrap(await createWorkspace({ /* ... */ }));

    // Create email user property
    const emailUserProperty = unwrap(await upsertUserProperty({
      workspaceId: workspace.id,
      name: "email",
      definition: { type: UserPropertyDefinitionType.Trait, path: "email" },
    }));

    // Create managerEmail user property
    const managerEmailUserProperty = unwrap(await upsertUserProperty({
      workspaceId: workspace.id,
      name: "managerEmail",
      definition: { type: UserPropertyDefinitionType.Trait, path: "managerEmail" },
    }));

    // Create template with custom identifierKey
    const template = unwrap(await upsertMessageTemplate({
      workspaceId: workspace.id,
      name: "notify-manager-template",
      definition: {
        type: ChannelType.Email,
        from: "support@company.com",
        subject: "User Activity",
        body: "{% unsubscribe_link here %}.",
        identifierKey: "managerEmail", // send to manager
      },
    }));
    templateId = template.id;

    // Setup subscription group, secret, email provider...

    // Submit user identify event with both email and managerEmail
    await submitBatch({
      workspaceId: workspace.id,
      data: {
        batch: [{
          type: EventType.Identify,
          userId,
          messageId: randomUUID(),
          traits: {
            email: "user@example.com",
            managerEmail: "manager@company.com",
          },
        }],
      },
    });

    await computePropertiesIncremental({
      workspaceId: workspace.id,
      userProperties: [emailUserProperty, managerEmailUserProperty],
      // ...
    });
  });

  it("should correctly unsubscribe the original user when manager clicks unsubscribe link", async () => {
    // 1. Send message to manager
    const userPropertyAssignments = await findAllUserPropertyAssignments({
      userId,
      workspaceId: workspace.id,
    });
    expect(userPropertyAssignments.email).toBe("user@example.com");
    expect(userPropertyAssignments.managerEmail).toBe("manager@company.com");

    const subscriptionGroupWithAssignment = await getSubscriptionGroupWithAssignment({
      workspaceId: workspace.id,
      userId,
      subscriptionGroupId: subscriptionGroup.id,
    });
    const subscriptionGroupDetails = getSubscriptionGroupDetails(subscriptionGroupWithAssignment);

    const sendResult = await sendMessage({
      workspaceId: workspace.id,
      channel: ChannelType.Email,
      userId,
      subscriptionGroupDetails: { name: subscriptionGroup.name, ...subscriptionGroupDetails },
      templateId,
      userPropertyAssignments,
      useDraft: false,
    });

    const sent = unwrap(sendResult);
    expect(sent.type).toBe(InternalEventType.MessageSent);
    expect(sent.variant.to).toBe("manager@company.com"); // sent to manager

    // 2. Extract unsubscribe URL
    const unsubscribeUrl = sent.variant.body.match(
      /<a[^>]*class="df-unsubscribe"[^>]*href="([^"]*)"[^>]*>/,
    )?.[1];
    expect(unsubscribeUrl).toBeDefined();

    const url = new URL(unsubscribeUrl!);
    const params = unwrap(schemaValidateWithErr(
      Object.fromEntries(url.searchParams),
      SubscriptionParams,
    ));

    // 3. Verify URL has correct identifierKey
    expect(params.ik).toEqual("managerEmail");
    expect(params.i).toEqual("manager@company.com");

    // 4. Lookup user via the unsubscribe params - should find original user
    const userLookupResult = unwrap(await lookupUserForSubscriptions({
      workspaceId: params.w,
      identifier: params.i,        // manager@company.com
      identifierKey: params.ik,    // managerEmail
      hash: params.h,
    }));
    expect(userLookupResult.userId).toEqual(userId); // finds original user!

    // 5. Update subscription
    await updateUserSubscriptions({
      workspaceId: params.w,
      userUpdates: [{
        userId: userLookupResult.userId,
        changes: { [params.s!]: params.sub === "1" },
      }],
    });

    // 6. Verify subsequent messages to this user are skipped
    const updatedDetails = getSubscriptionGroupDetails(
      await getSubscriptionGroupWithAssignment({
        workspaceId: workspace.id,
        userId,
        subscriptionGroupId: subscriptionGroup.id,
      })!,
    );
    expect(updatedDetails.action).toBe(SubscriptionChange.Unsubscribe);

    const secondSendResult = await sendMessage({
      workspaceId: workspace.id,
      channel: ChannelType.Email,
      userId,
      subscriptionGroupDetails: { name: subscriptionGroup.name, ...updatedDetails },
      templateId,
      userPropertyAssignments,
      useDraft: false,
    });
    expect(secondSendResult.isErr()).toBe(true);
    expect(secondSendResult.error.type).toBe(InternalEventType.MessageSkipped);
  });
});
```

#### 4.2 Subscription Lookup Logic - No Implementation Changes Needed

**File:** `packages/backend-lib/src/subscriptionGroups.ts`

The `lookupUserForSubscriptions()` function (line 564) already handles custom identifier keys correctly:

1. It searches `findUserIdsByUserPropertyValue({userPropertyName: identifierKey, value: identifier})` - this finds users who have the specified property (e.g., `managerEmail`) with the specified value
2. The hash validation uses the same `identifierKey` and `identifier` from the URL, plus the `userId`

**Example flow:**
- John has `managerEmail: manager@company.com`
- Email sent to `manager@company.com` with `identifierKey=managerEmail`
- Unsubscribe URL: `identifier=manager@company.com&identifierKey=managerEmail&hash=xxx`
- On click: `findUserIdsByUserPropertyValue(managerEmail, manager@company.com)` → finds John
- Hash validated with John's userId → John is identified and unsubscribed

#### 4.3 Confirm

```bash
yarn jest packages/backend-lib/src/subscriptionManagementEndToEnd.test.ts --testNamePattern="third party"
```

---

### Step 5: Edge Case - Multiple Users with Same Third-Party Email

#### 5.1 Write Failing Test

**File:** `packages/backend-lib/src/messaging.test.ts`

```typescript
describe("sendEmail with custom identifierKey edge cases", () => {
  it("should handle multiple users with same third-party email", async () => {
    // Setup: Two users both have managerEmail: "manager@company.com"
    // User1 and User2 share the same manager

    // Send message for user1
    const payload1 = await sendEmail({
      workspaceId: workspace.id,
      templateId: template.id,
      userPropertyAssignments: {
        id: "user1",
        email: "user1@example.com",
        managerEmail: "manager@company.com",
      },
      userId: "user1",
      // ...
    });

    // Extract unsubscribe URL for user1
    const result1 = unwrap(payload1);
    const url1 = /* extract from body */;

    // Send message for user2
    const payload2 = await sendEmail({
      workspaceId: workspace.id,
      templateId: template.id,
      userPropertyAssignments: {
        id: "user2",
        email: "user2@example.com",
        managerEmail: "manager@company.com", // same manager
      },
      userId: "user2",
      // ...
    });

    const result2 = unwrap(payload2);
    const url2 = /* extract from body */;

    // URLs should have different hashes (because userId is different)
    expect(url1.searchParams.get("h")).not.toEqual(url2.searchParams.get("h"));

    // Clicking user1's unsubscribe link should only affect user1
    const lookup1 = unwrap(await lookupUserForSubscriptions({
      workspaceId,
      identifier: "manager@company.com",
      identifierKey: "managerEmail",
      hash: url1.searchParams.get("h")!,
    }));
    expect(lookup1.userId).toEqual("user1");

    // Clicking user2's unsubscribe link should only affect user2
    const lookup2 = unwrap(await lookupUserForSubscriptions({
      workspaceId,
      identifier: "manager@company.com",
      identifierKey: "managerEmail",
      hash: url2.searchParams.get("h")!,
    }));
    expect(lookup2.userId).toEqual("user2");
  });
});
```

#### 5.2 Implementation - Already Handled

The hash includes `userId + identifierKey + identifier`, so it uniquely identifies the user even if multiple users share the same third-party address. No additional implementation needed.

#### 5.3 Confirm

```bash
yarn jest packages/backend-lib/src/messaging.test.ts --testNamePattern="multiple users"
```

---

### Step 6: Verify Provider Webhooks Work with Third-Party Messaging

#### 6.1 Analysis - No Implementation Changes Needed

Provider webhooks (SendGrid, Amazon SES, Twilio, etc.) **already work correctly** with third-party messaging because:

1. When sending, we include `userId` in message tags/metadata (e.g., SendGrid's `custom_args`)
2. Providers echo this `userId` back in webhook payloads
3. Webhook handlers use `userId` directly from the payload, **not** the recipient email address

See `packages/backend-lib/src/destinations/sendgrid.ts:91-94, 175-186`:
```typescript
const { userId } = sendgridEvent;  // Uses userId from custom_args
if (!userId) {
  return err(new Error("Missing userId or anonymousId."));
}
```

#### 6.2 Write Verification Test

**File:** `packages/backend-lib/src/destinations/sendgrid.test.ts` (or create if needed)

Add a test to verify webhook handling works when email was sent to a third party:

```typescript
describe("sendgridEventToDF", () => {
  it("should use userId from custom_args regardless of recipient email", () => {
    // Simulate a webhook event where email was sent to a third party
    // but userId in custom_args is the original user
    const sendgridEvent: RelevantSendgridFields = {
      email: "manager@company.com",  // Third-party recipient
      event: "delivered",
      timestamp: Date.now() / 1000,
      userId: "original-user-123",   // Original user from custom_args
      workspaceId: "workspace-123",
      sg_message_id: "sg-msg-123",
      // ... other fields
    };

    const result = sendgridEventToDF({ sendgridEvent });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.userId).toBe("original-user-123");
      // Verify the email is in properties, not used as userId
      expect(result.value.properties?.email).toBe("manager@company.com");
    }
  });
});
```

#### 6.3 Confirm

```bash
yarn jest packages/backend-lib/src/destinations/sendgrid.test.ts --testNamePattern="custom_args"
```

---

### Step 7: Update the Dashboard UI

**Files:**
- `packages/dashboard/src/components/messages/emailEditor.tsx`
- `packages/dashboard/src/components/messages/smsEditor.tsx`

Add a UI control for selecting a custom identifier key:

1. Add an optional dropdown/input field labeled "Recipient User Property" or similar
2. List available user properties as options
3. Default should be empty (meaning use the channel default: `email` for email, `phone` for SMS)
4. When set, save the user property name to the template's `identifierKey` field

---

### Step 8: Update Template Validation

**File:** `packages/backend-lib/src/messaging.ts` or relevant validation code

Add validation:
- If `identifierKey` is specified in template, verify it references a valid user property name
- Consider adding a warning if the specified property doesn't exist in the workspace

---

### Step 9: Update Message Preview/Test Send

**Files:**
- `packages/backend-lib/src/messaging.ts` - `sendEmail()`, `sendSms()`
- Dashboard preview components

Ensure message previews correctly resolve the custom `identifierKey` and display the actual recipient address.

---

### Step 10: Documentation

Update user-facing documentation to explain:
- How to configure templates to message third parties
- The implications for subscription management (original user can unsubscribe)
- How delivery tracking works when messaging third parties
