import { assertUnreachable } from "./typeAssertions";
import { EmailEvent, EmailEventList, EmailProviderType } from "./types";

export const EmailEventSet = new Set<string>(EmailEventList);

export function isEmailEvent(s: unknown): s is EmailEvent {
  if (typeof s !== "string") return false;
  return EmailEventSet.has(s);
}

export function emailProviderLabel(provider: EmailProviderType): string {
  switch (provider) {
    case EmailProviderType.Test:
      return "Test";
    case EmailProviderType.Sendgrid:
      return "Sendgrid";
    case EmailProviderType.AmazonSes:
      return "Amazon SES";
    case EmailProviderType.PostMark:
      return "Postmark";
    case EmailProviderType.Resend:
      return "Resend";
    case EmailProviderType.Smtp:
      return "SMTP";
    case EmailProviderType.MailChimp:
      return "Mailchimp";
    default:
      assertUnreachable(provider);
  }
}
