import { db, insert } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { enrichMessageTemplate } from "backend-lib/src/messaging";
import { defaultSmsDefinition } from "backend-lib/src/messaging/sms";
import { CompletionStatus, MessageTemplate } from "backend-lib/src/types";
import { toUserPropertyResource } from "backend-lib/src/userProperties";
import { and, eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { AppState } from "./types";

export async function serveSmsTemplate({
  workspaceId,
  messageTemplateId,
  defaultName,
}: {
  workspaceId: string;
  messageTemplateId: string;
  defaultName?: string;
}): Promise<Pick<AppState, "messages" | "userProperties">> {
  const [smsTemplate, userProperties] = await Promise.all([
    db().query.messageTemplate.findFirst({
      where: and(
        eq(schema.messageTemplate.id, messageTemplateId),
        eq(schema.messageTemplate.workspaceId, workspaceId),
      ),
    }),
    db().query.userProperty.findMany({
      where: eq(schema.userProperty.workspaceId, workspaceId),
    }),
  ]);

  let smsTemplateWithDefault: MessageTemplate;
  if (!smsTemplate) {
    smsTemplateWithDefault = await insert({
      table: schema.messageTemplate,
      values: {
        workspaceId,
        name: defaultName ?? `New SMS Message - ${messageTemplateId}`,
        id: messageTemplateId,
        definition: defaultSmsDefinition(),
      },
      lookupExisting: and(
        eq(schema.messageTemplate.id, messageTemplateId),
        eq(schema.messageTemplate.workspaceId, workspaceId),
      )!,
      doNothingOnConflict: true,
    }).then(unwrap);
  } else {
    smsTemplateWithDefault = smsTemplate;
  }

  return {
    messages: {
      type: CompletionStatus.Successful,
      value: [unwrap(enrichMessageTemplate(smsTemplateWithDefault))],
    },
    userProperties: {
      type: CompletionStatus.Successful,
      value: userProperties.flatMap((p) => unwrap(toUserPropertyResource(p))),
    },
  };
}
