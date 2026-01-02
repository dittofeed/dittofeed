import { generateSecureHash } from "./crypto";

export function generateViewInBrowserHash({
  workspaceId,
  messageId,
  secret,
}: {
  workspaceId: string;
  messageId: string;
  secret: string;
}): string {
  return generateSecureHash({
    key: secret,
    value: {
      w: workspaceId,
      m: messageId,
    },
  });
}
