// Re-export email headers types and utilities
export {
  EmailHeaderSchema,
  EmailHeadersSchema,
  headersToRecord,
  validateHeaders,
  BLOCKED_HEADER_NAMES,
} from "./types/emailHeaders";
export type { EmailHeader, EmailHeaders } from "./types/emailHeaders";
