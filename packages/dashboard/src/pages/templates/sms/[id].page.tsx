import { enrichMessageTemplate } from "backend-lib/src/messaging";
import { defaultSmsDefinition } from "backend-lib/src/messaging/sms";
import { MessageTemplate } from "backend-lib/src/types";
import { toUserPropertyResource } from "backend-lib/src/userProperties";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React from "react";
import { validate } from "uuid";

import DashboardContent from "../../../components/dashboardContent";
import SmsEditor from "../../../components/messages/smsEditor";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { useAppStorePick } from "../../../lib/appStore";
import prisma from "../../../lib/prisma";
import { requestContext } from "../../../lib/requestContext";
import { PropsWithInitialState } from "../../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const id = ctx.params?.id;

    if (typeof id !== "string" || !validate(id)) {
      return {
        notFound: true,
      };
    }

    const [smsTemplate, userProperties] = await Promise.all([
      prisma().messageTemplate.findUnique({
        where: {
          id,
        },
      }),
      prisma().userProperty.findMany({
        where: {
          workspaceId: dfContext.workspace.id,
        },
      }),
    ]);
    let smsTemplateWithDefault: MessageTemplate;
    if (!smsTemplate) {
      smsTemplateWithDefault = await prisma().messageTemplate.upsert({
        where: { id },
        create: {
          workspaceId: dfContext.workspace.id,
          name: `New SMS Message - ${id}`,
          id,
          definition: defaultSmsDefinition(),
        },
        update: {},
      });
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
    <DashboardContent>
      <SmsEditor
        key={messageId}
        templateId={messageId}
        member={member ?? undefined}
      />
    </DashboardContent>
  );
}
