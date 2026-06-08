# Custom Email Headers - Integration Guide

## Overview

This implementation adds support for custom email headers in Dittofeed,
enabling users to set headers like `X-PM-Message-Stream: broadcast` for
Postmark or any other provider-specific headers.

## Architecture

### Backend (`packages/backend-lib/src/email/`)

- **`customHeaders.ts`** - Core utilities for parsing, validating, sanitizing, and converting headers to provider-specific formats
- **`applyCustomHeaders.ts`** - Integration layer that processes raw headers and outputs them in the correct format for each email provider
- **`index.ts`** - Public API exports

### Types (`packages/backend-lib/src/types/`)

- **`emailHeaders.ts`** - io-ts codecs and TypeScript types for the headers schema

### Frontend (`packages/dashboard/src/components/messages/`)

- **`EmailCustomHeaders.tsx`** - React component for the email editor UI

### Messaging (`packages/backend-lib/src/messaging/`)

- **`sendEmail.ts`** - Example showing how to integrate headers into the send pipeline

## Integration Steps

### 1. Update the Email Template Schema

In your existing message template type definition, add the `headers` field:

```typescript
import { CustomEmailHeadersCodec } from "./types/emailHeaders";

// In your existing EmailContents or MessageTemplateDefinition:
const EmailContents = t.intersection([
  t.type({
    from: t.string,
    subject: t.string,
    body: t.string,
  }),
  t.partial({
    replyTo: t.string,
    headers: CustomEmailHeadersCodec, // ADD THIS
  }),
]);
```

### 2. Update the Database Schema

If using Prisma or similar, add a JSON field to store headers:

```prisma
model MessageTemplate {
  // ... existing fields
  headers Json? // Array of {name, value} objects
}
```

### 3. Add the UI Component

In your email editor page, add the `EmailCustomHeaders` component:

```tsx
import EmailCustomHeaders from "./EmailCustomHeaders";

// In your email editor component:
<EmailCustomHeaders
  headers={templateHeaders}
  onChange={(newHeaders) => {
    setTemplateHeaders(newHeaders);
    // Save to your state management
  }}
/>
```

### 4. Update the Send Pipeline

In your email sending function, use `applyCustomHeaders`:

```typescript
import { applyCustomHeaders } from "./email/applyCustomHeaders";

// When sending an email:
const headersResult = applyCustomHeaders({
  rawHeaders: messageTemplate.headers,
  templateVariables: { userId: user.id, campaignId: campaign.id },
  provider: currentProvider, // "smtp" | "postmark" | "sendgrid" | "ses" | "resend"
});

// Then pass headersResult.headers to your provider SDK
```

### 5. Provider-Specific Notes

#### Postmark

Postmark uses `X-PM-Message-Stream` to route emails to specific streams.
The integration automatically extracts this header and sets the
`MessageStream` field in the Postmark API payload.

```
Header Name: X-PM-Message-Stream
Header Value: broadcast
```

#### SendGrid

Headers are passed in the `personalizations[0].headers` field.

#### Amazon SES

Custom headers require using the raw email sending API (`SendRawEmail`).

#### Resend

Headers are passed directly in the `headers` field of the API request.

#### SMTP

Headers are passed in nodemailer's `headers` option as key-value pairs.

## Security

- Header names are validated against RFC 2822
- Header values are checked for CR/LF injection
- Invalid headers are silently dropped with a warning log
- Template variables in header values support `{{variable}}` syntax

## Testing

Run the test suite:

```bash
make test
```

Or directly:

```bash
cd packages/backend-lib && npx jest
```
