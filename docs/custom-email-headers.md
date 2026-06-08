# Custom Email Headers

## Overview

Dittofeed supports adding custom headers to outgoing emails. This is useful for:

- **Postmark**: Selecting message streams with `X-PM-Message-Stream`
- **SendGrid**: Adding custom tracking with `X-SMTPAPI` or custom headers
- **AWS SES**: Setting configuration sets with `X-SES-CONFIGURATION-SET`
- **General**: Adding any RFC-compliant custom header to emails

## Usage

### In the Email Editor

1. Open your email template in the broadcast or journey email editor
2. Scroll down to the "Custom Email Headers" section
3. Click "Add Header" to add a new header
4. Enter the header name (e.g., `X-PM-Message-Stream`) and value (e.g., `broadcast`)
5. Add as many headers as needed
6. Save the template

### Template Variables in Headers

Header values support template variable substitution using the `{{variable}}` syntax:

```
Header Name: X-Campaign-ID
Header Value: {{campaignId}}
```

### Example: Postmark Message Streams

To send emails through a specific Postmark message stream:

```
Header Name: X-PM-Message-Stream
Header Value: broadcast
```

This tells Postmark to use the "broadcast" stream for the email, which is required for marketing/broadcast emails in Postmark.

### Example: AWS SES Configuration Set

```
Header Name: X-SES-CONFIGURATION-SET  
Header Value: my-tracking-config
```

## API

When creating or updating templates via the API, include the `headers` field in the email template definition:

```json
{
  "type": "Email",
  "from": "sender@example.com",
  "subject": "Hello",
  "body": "<html>...</html>",
  "headers": [
    {
      "name": "X-PM-Message-Stream",
      "value": "broadcast"
    },
    {
      "name": "X-Custom-Header",
      "value": "custom-value"
    }
  ]
}
```

## Validation Rules

- **Header names** must be valid RFC 5322 field names (printable ASCII, no colons or spaces)
- **Header names** must be between 1 and 256 characters
- **Header values** must be 2048 characters or less
- **Header values** must not contain bare CR or LF characters
- Invalid headers are silently filtered out during send

## Provider Support

| Provider | Format | Notes |
|----------|--------|-------|
| SMTP (Nodemailer) | Key-value object | Full support |
| SendGrid | Headers object | Full support |
| Postmark | Name/Value array | Full support, use for message streams |
| Amazon SES | Name/Value array | Full support |
| Resend | Key-value object | Full support |
