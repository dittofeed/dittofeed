import { enrichMessageTemplate } from "backend-lib/src/messageTemplates";
import { MessageTemplate } from "backend-lib/src/types";
import { toUserPropertyResource } from "backend-lib/src/userProperties";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  CompletionStatus,
  DefaultEmailProviderResource,
  EmailTemplateResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { validate } from "uuid";

import MainLayout from "../../../components/mainLayout";
import { defaultEmailDefinition } from "../../../components/messages/email";
import EmailEditor from "../../../components/messages/emailEditor";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { useAppStorePick } from "../../../lib/appStore";
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

    const [emailTemplate, userProperties, defaultEmailProvider] =
      await Promise.all([
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
        prisma().defaultEmailProvider.findUnique({
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
          definition: defaultEmailDefinition(
            defaultEmailProvider as DefaultEmailProviderResource | undefined,
          ) satisfies EmailTemplateResource,
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
        value: userProperties.flatMap((p) => unwrap(toUserPropertyResource(p))),
      },
    };

    // for some reason, new messages are not being merged into existing
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
  const { member } = useAppStorePick(["member"]);

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
          <EmailEditor templateId={messageId} member={member ?? undefined} />
        </MainLayout>
      </main>
    </>
  );
}
