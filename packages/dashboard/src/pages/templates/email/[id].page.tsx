import { enrichMessageTemplate } from "backend-lib/src/messageTemplates";
import { MessageTemplate } from "backend-lib/src/types";
import { enrichUserProperty } from "backend-lib/src/userProperties";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  ChannelType,
  CompletionStatus,
  EmailTemplateResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { validate } from "uuid";

import MainLayout from "../../../components/mainLayout";
import defaultEmailBody from "../../../components/messages/defaultEmailBody";
import EmailEditor from "../../../components/messages/emailEditor";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import prisma from "../../../lib/prisma";
import { requestContext } from "../../../lib/requestContext";
import { AppState, PropsWithInitialState } from "../../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const templateId = ctx.params?.id;

    if (typeof templateId !== "string" || !validate(templateId)) {
      return {
        notFound: true,
      };
    }
    const workspaceId = dfContext.workspace.id;

    const [emailTemplate, userProperties] = await Promise.all([
      prisma().messageTemplate.findUnique({
        where: {
          id: templateId,
        },
      }),
      prisma().userProperty.findMany({
        where: {
          workspaceId,
        },
      }),
    ]);

    let emailTemplateWithDefault: MessageTemplate;
    if (!emailTemplate) {
      emailTemplateWithDefault = await prisma().messageTemplate.upsert({
        where: { id: templateId },
        create: {
          workspaceId,
          name: `New Email Message - ${templateId}`,
          id: templateId,
          definition: {
            type: ChannelType.Email,
            subject: "Hi {{ user.firstName | default: 'there'}}!",
            from: '{{ user.accountManager | default: "hello@company.com"}}',
            replyTo: "",
            body: defaultEmailBody,
          } satisfies EmailTemplateResource,
        },
        update: {},
      });
    } else {
      emailTemplateWithDefault = emailTemplate;
    }

    const serverInitialState: Partial<AppState> = {
      messages: {
        type: CompletionStatus.Successful,
        value: [unwrap(enrichMessageTemplate(emailTemplateWithDefault))],
      },
      userProperties: {
        type: CompletionStatus.Successful,
        value: userProperties.flatMap((p) => unwrap(enrichUserProperty(p))),
      },
    };

    return {
      props: addInitialStateToProps({
        dfContext,
        serverInitialState,
        props: {},
      }),
    };
  });

export default function MessageEditor() {
  const router = useRouter();

  const messageId =
    typeof router.query.id === "string" ? router.query.id : null;

  if (!messageId) {
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
          <EmailEditor templateId={messageId} />
        </MainLayout>
      </main>
    </>
  );
}
