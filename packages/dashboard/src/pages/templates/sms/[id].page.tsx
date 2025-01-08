import { db, insert } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { enrichMessageTemplate } from "backend-lib/src/messaging";
import { defaultSmsDefinition } from "backend-lib/src/messaging/sms";
import { MessageTemplate } from "backend-lib/src/types";
import { toUserPropertyResource } from "backend-lib/src/userProperties";
import { and, eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React from "react";
import { validate } from "uuid";

import SmsEditor from "../../../components/messages/smsEditor";
import TemplatePageContent from "../../../components/messages/templatePageContent";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { useAppStorePick } from "../../../lib/appStore";
import { requestContext } from "../../../lib/requestContext";
import { PropsWithInitialState } from "../../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const id = ctx.params?.id;
    let name: string | null = null;

    if (typeof id !== "string" || !validate(id)) {
      return {
        notFound: true,
      };
    }

    if (typeof ctx.query.name === "string") {
      name = ctx.query.name;
    }

    const [smsTemplate, userProperties] = await Promise.all([
      db().query.messageTemplate.findFirst({
        where: and(
          eq(schema.messageTemplate.id, id),
          eq(schema.messageTemplate.workspaceId, dfContext.workspace.id),
        ),
      }),
      db().query.userProperty.findMany({
        where: eq(schema.userProperty.workspaceId, dfContext.workspace.id),
      }),
    ]);
    let smsTemplateWithDefault: MessageTemplate;
    if (!smsTemplate) {
      smsTemplateWithDefault = await insert({
        table: schema.messageTemplate,
        values: {
          workspaceId: dfContext.workspace.id,
          name: name ?? `New SMS Message - ${id}`,
          id,
          definition: defaultSmsDefinition(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        doNothingOnConflict: true,
      }).then(unwrap);
    } else {
      smsTemplateWithDefault = smsTemplate;
    }

    return {
      props: addInitialStateToProps({
        dfContext,
        serverInitialState: {
          messages: {
            type: CompletionStatus.Successful,
            value: [unwrap(enrichMessageTemplate(smsTemplateWithDefault))],
          },
          userProperties: {
            type: CompletionStatus.Successful,
            value: userProperties.flatMap((p) =>
              unwrap(toUserPropertyResource(p)),
            ),
          },
        },
        props: {},
      }),
    };
  });

export default function MessageEditor() {
  const router = useRouter();
  const messageId =
    typeof router.query.id === "string" ? router.query.id : null;
  const { member } = useAppStorePick(["member"]);
  if (!messageId) {
    return null;
  }
  return (
    <TemplatePageContent>
      <SmsEditor
        key={messageId}
        templateId={messageId}
        member={member ?? undefined}
      />
    </TemplatePageContent>
  );
}
