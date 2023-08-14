import { EmailEvent, EmailEventList } from "./types";

export const EmailEventSet = new Set<string>(EmailEventList);

export function isEmailEvent(s: unknown): s is EmailEvent {
  if (typeof s !== "string") return false;
  return EmailEventSet.has(s);
}
