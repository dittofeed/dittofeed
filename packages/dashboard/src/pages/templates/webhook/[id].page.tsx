import { enrichMessageTemplate } from "backend-lib/src/messaging";
import { DEFAULT_WEBHOOK_DEFINITION } from "backend-lib/src/messaging/webhook";
import { MessageTemplate } from "backend-lib/src/types";
import { toUserPropertyResource } from "backend-lib/src/userProperties";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React from "react";
import { validate } from "uuid";

import DashboardContent from "../../../components/dashboardContent";
import WebhookEditor from "../../../components/messages/webhookEditor";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { useAppStorePick } from "../../../lib/appStore";
import prisma from "../../../lib/prisma";
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

    const [template, userProperties] = await Promise.all([
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
    let templateWithDefault: MessageTemplate;
    if (!template) {
      templateWithDefault = await prisma().messageTemplate.upsert({
        where: { id },
        create: {
          workspaceId: dfContext.workspace.id,
          name: name ?? `New Webhook Template - ${id}`,
          id,
          definition: DEFAULT_WEBHOOK_DEFINITION,
        },
        update: {},
      });
    } else {
      templateWithDefault = template;
    }

    return {
      props: addInitialStateToProps({
        dfContext,
        serverInitialState: {
          messages: {
            type: CompletionStatus.Successful,
            value: [unwrap(enrichMessageTemplate(templateWithDefault))],
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
  const templateId =
    typeof router.query.id === "string" ? router.query.id : null;
  const { member } = useAppStorePick(["member"]);
  if (!templateId) {
    return null;
  }
  return (
    <DashboardContent>
      <WebhookEditor
        key={templateId}
        templateId={templateId}
        member={member ?? undefined}
      />
    </DashboardContent>
  );
}
