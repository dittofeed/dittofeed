# Integration Guide: Custom Email Headers in Dittofeed

This guide explains how to integrate the custom email headers feature into the existing Dittofeed codebase.

## Overview

This feature adds support for custom email headers (e.g., `X-PM-Message-Stream: broadcast` for Postmark) to Dittofeed's email sending functionality.

## Files to Integrate

### 1. Type Definitions (isomorphic-lib)

Add `packages/isomorphic-lib/src/types/emailHeaders.ts` - contains the Zod schemas and utility functions for email headers.

Update the existing message template type to include a `headers` field:

```typescript
// In your existing MessageTemplate or EmailMessageDefinition type:
import { EmailHeadersSchema } from "./types/emailHeaders";

export const EmailTemplateSchema = z.object({
  // ... existing fields
  subject: z.string(),
  body: z.string(),
  from: z.string(),
  replyTo: z.string().optional(),
  headers: EmailHeadersSchema, // <-- ADD THIS
});
```

### 2. Backend Email Sending

Modify the existing email sending functions to pass custom headers to providers:

#### For SMTP (nodemailer):
```typescript
import { prepareSmtpHeaders } from "./messaging/emailHeaders";

// In your sendEmail function:
const mailOptions = {
  // ... existing options
  headers: prepareSmtpHeaders(message.headers),
};
```

#### For SendGrid:
```typescript
import { prepareSendGridHeaders } from "./messaging/emailHeaders";

const msg = {
  // ... existing options
  headers: prepareSendGridHeaders(message.headers),
};
```

#### For Postmark:
```typescript
import { preparePostmarkHeaders } from "./messaging/emailHeaders";

const postmarkMessage = {
  // ... existing options
  Headers: preparePostmarkHeaders(message.headers),
  // Also extract MessageStream if present:
  MessageStream: message.headers?.find(
    h => h.name.toLowerCase() === 'x-pm-message-stream'
  )?.value ?? 'outbound',
};
```

#### For Amazon SES:
```typescript
import { prepareSesHeaders } from "./messaging/emailHeaders";

// Pass headers via raw email or API
const headers = prepareSesHeaders(message.headers);
```

#### For Resend:
```typescript
import { prepareResendHeaders } from "./messaging/emailHeaders";

const resendOptions = {
  // ... existing options
  headers: prepareResendHeaders(message.headers),
};
```

### 3. Dashboard UI

Add the `EmailHeadersEditor` component to the email template editor page:

```tsx
import { EmailHeadersEditor } from "./components/EmailHeadersEditor";

// In your email editor component:
<EmailHeadersEditor
  headers={template.headers ?? []}
  onChange={(headers) => updateTemplate({ ...template, headers })}
/>
```

### 4. Database Migration

If message templates are stored in a database, add a migration to support the headers field:

```sql
-- If using a JSON column for template definition, no migration needed
-- The headers field is part of the JSON structure

-- If using separate columns:
ALTER TABLE message_templates
ADD COLUMN custom_headers JSONB DEFAULT '[]';
```

## Testing

Run the tests:
```bash
npx vitest run packages/isomorphic-lib/src/types/emailHeaders.test.ts
npx vitest run packages/backend/src/messaging/emailHeaders.test.ts
```

## Common Use Cases

### Postmark Message Stream
```
Header Name: X-PM-Message-Stream
Header Value: broadcast
```

### SendGrid Categories
```
Header Name: X-SMTPAPI
Header Value: {"category": ["welcome"]}
```

### Custom Tracking
```
Header Name: X-Custom-Tracking-Id  
Header Value: campaign-2024-01
```
