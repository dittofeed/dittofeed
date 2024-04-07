import { enrichMessageTemplate } from "backend-lib/src/messaging";
import { MessageTemplate } from "backend-lib/src/types";
import { toUserPropertyResource } from "backend-lib/src/userProperties";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  ChannelType,
  CompletionStatus,
  WebhookTemplateResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { validate } from "uuid";

import MainLayout from "../../../components/mainLayout";
import WebhookEditor from "../../../components/messages/webhookEditor";
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
          name: `New Webhook Template - ${id}`,
          id,
          definition: {
            type: ChannelType.Webhook,
            identifierKey: "email",
            config: {
              url: "https://httpbin.org/post",
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              data: {
                email: "{{email}}",
              },
            },
            secret: {},
          } satisfies WebhookTemplateResource,
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
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <MainLayout>
          <WebhookEditor
            key={templateId}
            templateId={templateId}
            member={member ?? undefined}
          />
        </MainLayout>
      </main>
    </>
  );
}
