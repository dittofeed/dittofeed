# Message Third Parties

Currently our codebase assumes that when journeys and broadcasts message users, we message them directly. EX: in the case of emails we send the message to their "email" user property, and send an sms to their "phone" user property. We want to open up these options so that we allow users to message third parties e.g. we might want to respond to user performing an action by messaging their manager.

The way we intend to solve this is by allow message templates to be configured with a custom "to" value, which would be a reference to a particular user property. This value would be optional, but if provided, it would override the recipient address with the resolved value.

An additional constraints:

- Our webhooks, which rely on the users' "to" values (emails, phone numbers), to resolve the user id, must continue to work.
- Our subscription logic, and unsubscribe links, which rely on these values must continue to work.

## Coding Tips

See `./AGENTS.md` for helpful commands e.g. linting, tests, type checking.

## Steps

### 1. Update Template Type Definitions

**File:** `packages/isomorphic-lib/src/types.ts`

Add an optional `identifierKey` field to email and SMS template types (consistent with webhook templates):

- Add `identifierKey: Type.Optional(Type.String())` to `CodeEmailContents` (around line 1649) and `LowCodeEmailContents` (around line 1667)
- Add `identifierKey: Type.Optional(Type.String())` to `SmsContents` (around line 1741)
- This field will hold the **name of a user property** (e.g., `"managerEmail"`) whose value will be used as the recipient
- When not specified, defaults to `"email"` for email templates and `"phone"` for SMS templates (current behavior)

### 2. Update Message Sending Logic

**File:** `packages/backend-lib/src/messaging.ts`

Modify `sendEmail()` (line ~809) and `sendSms()` (line ~1716):

1. Use `messageTemplateDefinition.identifierKey` if set, otherwise fall back to the channel default (`CHANNEL_IDENTIFIERS.Email` or `CHANNEL_IDENTIFIERS.Sms`)
2. Resolve the recipient address from `userPropertyAssignments[identifierKey]`
3. Pass the resolved `identifierKey` to `constructUnsubscribeHeaders()` (instead of hardcoded `CHANNEL_IDENTIFIERS.Email`)

Example change in `sendEmail()`:
```typescript
// Current (line ~915):
const identifier = userPropertyAssignments[identifierKey]; // identifierKey is always CHANNEL_IDENTIFIERS.Email

// New:
const resolvedIdentifierKey = messageTemplateDefinition.identifierKey ?? CHANNEL_IDENTIFIERS.Email;
const identifier = userPropertyAssignments[resolvedIdentifierKey];
```

The rest of the flow works automatically because:
- `constructUnsubscribeHeaders()` already receives `identifierKey` and passes it to `generateSubscriptionChangeUrl()`
- `lookupUserForSubscriptions()` uses `findUserIdsByUserPropertyValue({userPropertyName: identifierKey, value: identifier})` to find users with that property value
- The hash includes `userId + identifierKey + identifier`, so it uniquely identifies the user even if multiple users share the same third-party address

### 3. Update Unsubscribe Header Generation

**File:** `packages/backend-lib/src/messaging/email.ts`

The `constructUnsubscribeHeaders()` function (line 35) currently hardcodes `CHANNEL_IDENTIFIERS.Email` as the `identifierKey`. Update it to accept the `identifierKey` as a parameter instead:

```typescript
// Current (line 62-63):
identifierKey: CHANNEL_IDENTIFIERS.Email,

// New:
identifierKey, // passed as parameter
```

**File:** `packages/backend-lib/src/messaging.ts`

Update the call to `constructUnsubscribeHeaders()` (line ~987) to pass the resolved `identifierKey`:

```typescript
constructUnsubscribeHeaders({
  to,
  from,
  userId,
  identifierKey: resolvedIdentifierKey, // NEW: pass the custom identifier key
  subscriptionGroupSecret,
  subscriptionGroupName: subscriptionGroupDetails.name,
  workspaceId,
  subscriptionGroupId: subscriptionGroupDetails.id,
})
```

### 4. Subscription Lookup Logic - No Changes Needed

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

### 5. Track Third-Party Recipients for Provider Webhooks

**Challenge:** Email providers (SendGrid, Amazon SES, etc.) send delivery webhooks (bounces, complaints, opens, clicks) with the **recipient email address**. If we send to a third party, we need to map that back to the original user.

**Option A - Store in message metadata:**

When sending a message to a third party, include the original user ID in provider-specific metadata/tags:
- SendGrid: custom_args
- Amazon SES: message tags
- Resend: tags
- PostMark: metadata

Then, when processing webhooks, extract the original user ID from metadata.

**File:** `packages/backend-lib/src/messaging.ts` - Update provider-specific send functions to include user metadata.

**File:** `packages/api/src/controllers/webhooksController.ts` - Update webhook handlers to extract user ID from metadata when available.

**Option B - Store recipient mapping in database:**

Create a new table or extend `sentMessage` tracking to store:
- `messageId`
- `originalUserId`
- `recipientAddress` (the third-party email/phone)

This allows looking up the original user when a webhook arrives for a third-party recipient.

### 6. Update the Dashboard UI

**Files:**
- `packages/dashboard/src/components/messages/emailEditor.tsx`
- `packages/dashboard/src/components/messages/smsEditor.tsx`

Add a UI control for selecting a custom identifier key:

1. Add an optional dropdown/input field labeled "Recipient User Property" or similar
2. List available user properties as options
3. Default should be empty (meaning use the channel default: `email` for email, `phone` for SMS)
4. When set, save the user property name to the template's `identifierKey` field

### 7. Update Template Validation

**File:** `packages/backend-lib/src/messaging.ts` or relevant validation code

Add validation:
- If `identifierKey` is specified in template, verify it references a valid user property name
- Consider adding a warning if the specified property doesn't exist in the workspace

### 8. Update Message Preview/Test Send

**Files:**
- `packages/backend-lib/src/messaging.ts` - `sendEmail()`, `sendSms()`
- Dashboard preview components

Ensure message previews correctly resolve the custom `identifierKey` and display the actual recipient address.

### 9. Documentation

Update user-facing documentation to explain:
- How to configure templates to message third parties
- The implications for subscription management (original user can unsubscribe)
- How delivery tracking works when messaging third parties

## Testing Considerations

1. **Unit tests:** Verify `identifierKey` resolution in `sendEmail()` and `sendSms()`
2. **Integration tests:** Send to third-party recipient, verify unsubscribe link works for original user
3. **Webhook tests:** Simulate provider webhooks for third-party recipients, verify original user is identified
4. **UI tests:** Verify template editor correctly saves/loads custom `identifierKey`
