import { err, ok, Result } from "neverthrow";

import { getObject, putObject, storage } from "./blobStorage";
import config from "./config";
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

export function getViewInBrowserKey({
  workspaceId,
  messageId,
}: {
  workspaceId: string;
  messageId: string;
}): string {
  return `emails/${workspaceId}/${messageId}/body.html`;
}

export async function storeEmailForViewInBrowser({
  workspaceId,
  messageId,
  body,
}: {
  workspaceId: string;
  messageId: string;
  body: string;
}): Promise<Result<void, Error>> {
  if (!config().enableBlobStorage) {
    return err(new Error("Blob storage is not enabled"));
  }

  try {
    const s3 = storage();
    const key = getViewInBrowserKey({ workspaceId, messageId });
    await putObject(s3, {
      text: body,
      key,
      contentType: "text/html",
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function getStoredEmailForViewInBrowser({
  workspaceId,
  messageId,
}: {
  workspaceId: string;
  messageId: string;
}): Promise<Result<string, Error>> {
  if (!config().enableBlobStorage) {
    return err(new Error("Blob storage is not enabled"));
  }

  try {
    const s3 = storage();
    const key = getViewInBrowserKey({ workspaceId, messageId });
    const result = await getObject(s3, { key });

    if (!result) {
      return err(new Error("Email not found"));
    }

    return ok(result.text);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
