import { Static, Type } from "@sinclair/typebox";
import { credential, ServiceAccount } from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import { getMessaging, Message } from "firebase-admin/messaging";
import {
  jsonParseSafe,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

export const FcmKey = Type.Object({
  project_id: Type.String(),
  client_email: Type.String(),
  private_key: Type.String(),
});

export type FcmKey = Static<typeof FcmKey>;

export function extractServiceAccount(
  fcmKeyString: string,
): Result<ServiceAccount, Error> {
  return jsonParseSafe(fcmKeyString)
    .andThen((parsed) => schemaValidateWithErr(parsed, FcmKey))
    .map((fcmKey) => ({
      projectId: fcmKey.project_id,
      privateKey: fcmKey.private_key,
      clientEmail: fcmKey.client_email,
    }));
}

export async function sendNotification({
  key,
  ...message
}: Message & { key: string }): Promise<Result<string, Error>> {
  const serviceAccount = extractServiceAccount(key);
  if (serviceAccount.isErr()) {
    return err(serviceAccount.error);
  }
  const app = initializeApp({
    credential: credential.cert(serviceAccount.value),
  });

  const messaging = getMessaging(app);

  const fcmMessageId = await messaging.send(message);
  return ok(fcmMessageId);
}
