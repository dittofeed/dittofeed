import { findMessageTemplate } from "backend-lib/src/messageTemplates";
import { toUserPropertyResource } from "backend-lib/src/userProperties";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { ChannelType } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { validate } from "uuid";

import MainLayout from "../../../components/mainLayout";
import SmsEditor from "../../../components/messages/smsEditor";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import prisma from "../../../lib/prisma";
import { requestContext } from "../../../lib/requestContext";
import { getSmsEditorState } from "../../../lib/sms";
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
      findMessageTemplate({
        id,
        channel: ChannelType.Sms,
      }).then(unwrap),
      prisma().userProperty.findMany({
        where: {
          workspaceId: dfContext.workspace.id,
        },
      }),
    ]);

    return {
      props: addInitialStateToProps({
        dfContext,
        serverInitialState: getSmsEditorState({
          smsTemplate,
          templateId: id,
          userProperties: userProperties.map((up) =>
            unwrap(toUserPropertyResource(up))
          ),
        }),
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
          <SmsEditor key={messageId} templateId={messageId} />
        </MainLayout>
      </main>
    </>
  );
}
